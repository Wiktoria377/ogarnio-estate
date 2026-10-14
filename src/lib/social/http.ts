import "server-only";
import { AppError } from "@/lib/errors";

/**
 * HTTP to platform APIs with timeouts and a single error vocabulary.
 *
 * `uncertain` marks failures where the platform MAY have executed the request
 * (timeout or connection lost after sending, 5xx on a write). Such operations
 * are never retried blindly: the publisher first checks on the platform whether
 * the post exists.
 */
export type SocialErrorCode =
  | "token_expired"
  | "permission"
  | "rate_limited"
  | "network"
  | "timeout"
  | "platform_down"
  | "media_rejected"
  | "aspect_ratio"
  | "bad_request"
  | "not_found"
  | "publish_limit"
  | "unknown";

/** User-facing (Polish message) error from a platform; `opts.detail` is for logs only. */
export class SocialError extends AppError {
  constructor(
    message: string,
    readonly socialCode: SocialErrorCode,
    readonly opts: { retryable?: boolean; uncertain?: boolean; retryAfterMs?: number; status?: number; detail?: string } = {},
  ) {
    super(message, `social_${socialCode}`, 502);
    this.name = "SocialError";
  }
  get retryable() {
    return !!this.opts.retryable;
  }
  get uncertain() {
    return !!this.opts.uncertain;
  }
}

export const ERROR_MESSAGES: Record<SocialErrorCode, string> = {
  token_expired: "Autoryzacja konta wygasła lub została cofnięta. Połącz konto ponownie w zakładce Połączone konta.",
  permission: "Brakuje uprawnień do publikacji na tym koncie. Połącz konto ponownie i zaakceptuj wszystkie wymagane uprawnienia.",
  rate_limited: "Platforma tymczasowo ogranicza liczbę zapytań. Ponowimy automatycznie.",
  network: "Brak połączenia z platformą. Ponowimy automatycznie.",
  timeout: "Platforma nie odpowiedziała na czas.",
  platform_down: "Platforma ma chwilowe problemy. Ponowimy automatycznie.",
  media_rejected: "Platforma odrzuciła plik (format, rozmiar lub dostępność pliku).",
  aspect_ratio: "Platforma odrzuciła proporcje obrazu. Wybierz format 4:5 lub kwadrat.",
  bad_request: "Platforma odrzuciła publikację jako nieprawidłową.",
  not_found: "Nie znaleziono konta lub obiektu na platformie.",
  publish_limit: "Osiągnięto dobowy limit publikacji przez API na tym koncie.",
  unknown: "Nieoczekiwany błąd platformy.",
};

export interface HttpResult<T> {
  status: number;
  data: T;
  headers: Headers;
}

/** Network wrapper: classifies transport failures; the caller maps API error bodies. */
export async function socialFetch<T>(
  url: string,
  init: RequestInit & { timeoutMs?: number; write?: boolean },
  mapError: (status: number, body: unknown, headers: Headers) => SocialError,
): Promise<HttpResult<T>> {
  const { timeoutMs = Number(process.env.SOCIAL_HTTP_TIMEOUT_MS) || 20_000, write = false, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs), redirect: "error", cache: "no-store" });
  } catch (error) {
    const timeout = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    // A write that may have reached the server is uncertain; a read is just retryable.
    throw new SocialError(ERROR_MESSAGES[timeout ? "timeout" : "network"], timeout ? "timeout" : "network", { retryable: true, uncertain: write });
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text.slice(0, 500);
  }
  if (!res.ok) {
    const err = mapError(res.status, body, res.headers);
    if (write && res.status >= 500 && !err.uncertain) throw new SocialError(err.message, err.socialCode, { ...err.opts, uncertain: true, retryable: true });
    throw err;
  }
  return { status: res.status, data: body as T, headers: res.headers };
}

export function retryAfter(headers: Headers, fallbackMs: number): number {
  const v = headers.get("retry-after");
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(n * 1000, 3600_000) : fallbackMs;
}
