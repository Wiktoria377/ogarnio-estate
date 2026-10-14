import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import zlib from "node:zlib";
import { AppError } from "@/lib/errors";

/**
 * Outbound HTTP for user-supplied URLs (property feeds, CRM photo links, and in
 * ETAP 4 brand-site analysis). Protects the server against SSRF:
 *  - only http/https, standard ports, no credentials in the URL;
 *  - every resolved address is checked against private, loopback, link-local,
 *    CGNAT, multicast and reserved ranges (IPv4, IPv6 and IPv4-mapped IPv6),
 *    inside the socket's DNS lookup, so DNS rebinding between check and connect
 *    is not possible;
 *  - redirects are followed manually (max 3) and each hop is validated again;
 *  - hard limits on time and on the (decompressed) body size.
 * Fetched content is untrusted data: callers parse it, never execute it.
 */
export class SafeFetchError extends AppError {
  constructor(message: string, code: string, status = 422) {
    super(message, code, status);
  }
}

const BLOCKED = new BlockList();
for (const [net, bits] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16],
  ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) BLOCKED.addSubnet(net, bits, "ipv4");
for (const [net, bits] of [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["fec0::", 10], ["ff00::", 8],
  ["2001:db8::", 32], ["2001::", 23], ["100::", 64],
] as const) BLOCKED.addSubnet(net, bits, "ipv6");

/** Embedded IPv4 in IPv4-mapped (::ffff:a.b.c.d), NAT64 (64:ff9b::/96) and 6to4 (2002::/16) addresses. */
function embeddedV4(addr: string): string | null {
  const a = addr.toLowerCase();
  const dotted = a.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1]!;
  const hex = a.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const hi = parseInt(hex[1]!, 16);
    const lo = parseInt(hex[2]!, 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  const sixToFour = a.match(/^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4}):/);
  if (sixToFour) {
    const hi = parseInt(sixToFour[1]!, 16);
    const lo = parseInt(sixToFour[2]!, 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  return null;
}

/** Test-only allowlist (e.g. the local contract mock); never honoured in production. */
function testAllowed(host: string, port: number): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const list = (process.env.SAFE_FETCH_ALLOW_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(`${host}:${port}`);
}

export function isBlockedAddress(addr: string): boolean {
  const family = isIP(addr);
  if (family === 0) return true;
  if (family === 4) return BLOCKED.check(addr, "ipv4");
  const v4 = embeddedV4(addr);
  if (v4) return BLOCKED.check(v4, "ipv4");
  return BLOCKED.check(addr, "ipv6");
}

const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);

/** Validates a user-supplied URL (syntax, scheme, port, no userinfo, no literal private IP). */
export function validateExternalUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new SafeFetchError("Nieprawidłowy adres URL.", "bad_url");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new SafeFetchError("Dozwolone są tylko adresy http:// i https://.", "bad_scheme");
  if (url.username || url.password) throw new SafeFetchError("Adres nie może zawierać loginu ani hasła. Dane dostępowe podaj w osobnym polu.", "url_credentials");
  if (input.length > 2000) throw new SafeFetchError("Adres URL jest za długi.", "bad_url");
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (testAllowed(host, port)) return url;
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") || !host.includes(".") && isIP(host) === 0)
    throw new SafeFetchError("Adresy lokalne i wewnętrzne są zablokowane.", "blocked_host");
  if (isIP(host) && isBlockedAddress(host)) throw new SafeFetchError("Adresy prywatne i zastrzeżone są zablokowane.", "blocked_ip");
  if (!ALLOWED_PORTS.has(port)) throw new SafeFetchError("Niedozwolony port w adresie.", "bad_port");
  return url;
}

function guardedLookup(allowAny: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, "", 0);
      const list = (addresses as unknown as LookupAddress[]) ?? [];
      if (!list.length) return callback(new SafeFetchError("Nie znaleziono serwera pod tym adresem.", "dns_failed"), "", 0);
      if (!allowAny && list.some((a) => isBlockedAddress(a.address)))
        return callback(new SafeFetchError("Adres wskazuje na sieć prywatną lub zastrzeżoną i został zablokowany.", "blocked_ip"), "", 0);
      if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
      callback(null, list[0]!.address, list[0]!.family);
    });
  };
}

export interface SafeFetchOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Accepted content types (prefix match); empty = any. */
  accept?: string[];
  /** Identifies the purpose of the request (robots.txt rules are matched against it). */
  userAgent?: string;
}

export interface SafeResponse {
  url: string;
  status: number;
  headers: http.IncomingHttpHeaders;
  contentType: string;
  body: Buffer;
  text(): string;
}

function once(url: URL, opts: SafeFetchOptions, deadline: number): Promise<{ res: http.IncomingMessage; req: http.ClientRequest }> {
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  const allowAny = testAllowed(url.hostname.replace(/^\[|\]$/g, ""), port);
  const mod = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new SafeFetchError("Przekroczono czas oczekiwania na odpowiedź serwera.", "timeout", 504));
    const req = mod.request(
      url,
      {
        method: opts.method ?? "GET",
        headers: { "user-agent": opts.userAgent ?? "OgarnioEstate/1.0 (+import ofert)", accept: "*/*", "accept-encoding": "gzip, deflate, br", ...opts.headers },
        lookup: guardedLookup(allowAny),
        agent: false,
        timeout: remaining,
      },
      (res) => resolve({ res, req }),
    );
    req.on("timeout", () => req.destroy(new SafeFetchError("Przekroczono czas oczekiwania na odpowiedź serwera.", "timeout", 504)));
    req.on("error", (e) => reject(e instanceof AppError ? e : new SafeFetchError(`Nie udało się połączyć z serwerem (${(e as NodeJS.ErrnoException).code ?? "błąd sieci"}).`, "network", 502)));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function readBody(res: http.IncomingMessage, maxBytes: number, deadline: number, req: http.ClientRequest): Promise<Buffer> {
  const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
  const declared = Number(res.headers["content-length"] ?? 0);
  if (!enc && declared > maxBytes) {
    req.destroy();
    return Promise.reject(new SafeFetchError(`Plik jest za duży (limit ${Math.round(maxBytes / 1048576)} MB).`, "too_large", 413));
  }
  let stream: NodeJS.ReadableStream = res;
  if (enc === "gzip" || enc === "x-gzip") stream = res.pipe(zlib.createGunzip());
  else if (enc === "deflate") stream = res.pipe(zlib.createInflate());
  else if (enc === "br") stream = res.pipe(zlib.createBrotliDecompress());
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => {
      req.destroy();
      reject(new SafeFetchError("Przekroczono czas pobierania.", "timeout", 504));
    }, Math.max(1, deadline - Date.now()));
    stream.on("data", (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        clearTimeout(timer);
        req.destroy();
        reject(new SafeFetchError(`Plik jest za duży (limit ${Math.round(maxBytes / 1048576)} MB).`, "too_large", 413));
        return;
      }
      chunks.push(c);
    });
    stream.on("end", () => {
      clearTimeout(timer);
      resolve(Buffer.concat(chunks));
    });
    stream.on("error", () => {
      clearTimeout(timer);
      reject(new SafeFetchError("Odpowiedź serwera jest uszkodzona.", "bad_body", 502));
    });
  });
}

export async function safeFetch(input: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const deadline = Date.now() + (opts.timeoutMs ?? 15_000);
  const maxBytes = opts.maxBytes ?? 10 * 1048576;
  let url = validateExternalUrl(input);
  for (let hop = 0; ; hop++) {
    const { res, req } = await once(url, opts, deadline);
    const status = res.statusCode ?? 0;
    if (status >= 300 && status < 400 && res.headers.location) {
      res.resume();
      if (hop >= (opts.maxRedirects ?? 3)) throw new SafeFetchError("Za dużo przekierowań.", "too_many_redirects", 502);
      const next = new URL(res.headers.location, url);
      // Each hop is validated again (scheme, port, host, literal IP); DNS is checked in lookup.
      url = validateExternalUrl(next.toString());
      if (opts.method === "POST") throw new SafeFetchError("Serwer przekierował zapytanie POST. Sprawdź adres API.", "redirect_post", 502);
      continue;
    }
    const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
    if (status >= 200 && status < 300 && opts.accept?.length && !opts.accept.some((a) => contentType.startsWith(a))) {
      res.resume();
      throw new SafeFetchError(`Serwer zwrócił nieoczekiwany typ danych (${contentType || "brak"}).`, "bad_content_type", 415);
    }
    const body = await readBody(res, maxBytes, deadline, req);
    return { url: url.toString(), status, headers: res.headers, contentType, body, text: () => body.toString("utf8") };
  }
}
