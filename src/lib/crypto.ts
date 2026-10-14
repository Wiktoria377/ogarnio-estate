import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/errors";

/**
 * Secrets at rest (OAuth tokens, feed credentials): AES-256-GCM with a key from
 * TOKEN_ENCRYPTION_KEY (32 bytes, base64). Ciphertext format: "v1:<iv>:<tag>:<data>"
 * (base64url parts). The key never leaves the server; rows store ciphertext only.
 * Rotation: set TOKEN_ENCRYPTION_KEY_PREVIOUS to the old key while re-encrypting.
 */
function keyFrom(value: string | undefined): Buffer | null {
  if (!value) return null;
  const buf = Buffer.from(value, "base64");
  return buf.length === 32 ? buf : null;
}

export function encryptionConfigured(): boolean {
  return keyFrom(process.env.TOKEN_ENCRYPTION_KEY) !== null;
}

function currentKey(): Buffer {
  const key = keyFrom(process.env.TOKEN_ENCRYPTION_KEY);
  if (!key) throw new AppError("Szyfrowanie tokenów nie jest skonfigurowane (TOKEN_ENCRYPTION_KEY, 32 bajty w base64). Skontaktuj się z administratorem.", "encryption_unconfigured", 503);
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", currentKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), data.toString("base64url")].join(":");
}

export function decryptSecret(payload: string): string {
  const [v, iv, tag, data] = payload.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new AppError("Uszkodzony zaszyfrowany sekret.", "bad_secret", 500);
  const keys = [currentKey(), keyFrom(process.env.TOKEN_ENCRYPTION_KEY_PREVIOUS)].filter((k): k is Buffer => !!k);
  for (const key of keys) {
    try {
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8");
    } catch {
      // try the previous key
    }
  }
  throw new AppError("Nie udało się odszyfrować sekretu (zmieniony klucz?). Połącz konto ponownie.", "bad_secret", 500);
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Server-side signing secret for short-lived links (public media URLs, unsubscribe, etc.). */
function signingKey(): Buffer {
  const raw = process.env.APP_SIGNING_SECRET || process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw || raw.length < 24) throw new AppError("Brak APP_SIGNING_SECRET na serwerze.", "signing_unconfigured", 503);
  return Buffer.from(raw);
}

export function signingConfigured(): boolean {
  const raw = process.env.APP_SIGNING_SECRET || process.env.TOKEN_ENCRYPTION_KEY;
  return !!raw && raw.length >= 24;
}

export function hmac(value: string): string {
  return createHmac("sha256", signingKey()).update(value).digest("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Signed, expiring token: base64url(json).signature */
export function signPayload(payload: Record<string, unknown>, ttlSeconds: number): string {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString("base64url");
  return `${body}.${hmac(body)}`;
}

export function verifyPayload<T extends Record<string, unknown>>(token: string): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig || !safeEqual(sig, hmac(body))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T & { exp?: number };
    if (typeof data.exp !== "number" || data.exp < Date.now() / 1000) return null;
    return data;
  } catch {
    return null;
  }
}

/** PKCE (RFC 7636) S256 pair. */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/** Privacy-preserving visitor hash: salted daily, never the raw IP. */
export function visitorHash(ip: string, userAgent: string, day = new Date().toISOString().slice(0, 10)): string {
  return createHmac("sha256", signingKeySafe()).update(`${day}|${ip}|${userAgent}`).digest("hex").slice(0, 32);
}

function signingKeySafe(): Buffer {
  const raw = process.env.APP_SIGNING_SECRET || process.env.TOKEN_ENCRYPTION_KEY || "ogarnio-dev-only-salt";
  return Buffer.from(raw);
}
