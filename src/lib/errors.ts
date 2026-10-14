import { usageError } from "@/lib/billing/messages";

/** Errors that are safe to show to the user (message is user-facing Polish copy). */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string = "app_error",
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Server-side sink for unexpected errors (registered by src/lib/observability.ts at startup). */
// Kept on globalThis: instrumentation and route bundles do not share module instances.
type Reporter = (area: string, error: unknown) => void;
const slot = globalThis as typeof globalThis & { __oeErrorReporter?: Reporter };
export function registerErrorReporter(fn: Reporter) {
  slot.__oeErrorReporter = fn;
}
export function reportUnexpected(area: string, error: unknown) {
  const reporter = slot.__oeErrorReporter;
  if (reporter) reporter(area, error);
  else console.error(`[${area}]`, error);
}

export function toActionError(error: unknown): { ok: false; error: string } {
  if (error instanceof AppError) return { ok: false, error: error.message };
  reportUnexpected("server_action", error);
  return { ok: false, error: "Coś poszło nie tak. Spróbuj ponownie za chwilę." };
}

/** Maps Postgres/PostgREST errors to user-facing messages without leaking internals. */
export function dbError(error: { code?: string; message?: string } | null, fallback = "Nie udało się zapisać danych."): AppError {
  if (!error) return new AppError(fallback);
  const map: Record<string, string> = {
    "42501": "Nie masz uprawnień do tej operacji w tym biurze.",
    "23505": "Taki rekord już istnieje.",
    "23503": "Powiązany rekord nie istnieje lub nie należy do Twojego biura.",
    "23514": "Dane nie spełniają wymagań walidacji.",
    "54000": "Osiągnięto limit dla tego konta.",
    PGRST116: "Nie znaleziono rekordu.",
  };
  const limit = error.message ? limitError(error.message) : null;
  if (limit) return limit;
  if (error.message?.includes("workspace_limit_reached")) return new AppError(map["54000"]!, "limit", 409);
  if (error.message?.includes("agent_not_in_workspace")) return new AppError("Wybrany agent nie należy do tego biura.", "agent", 400);
  const message = (error.code && map[error.code]) || fallback;
  if (!error.code || !map[error.code]) reportUnexpected("db", new Error(`${error.code ?? "?"}: ${error.message ?? ""}`));
  return new AppError(message, error.code ?? "db_error", error.code === "42501" ? 403 : 400);
}

/** Plan-limit errors raised by triggers and the usage ledger (messages in billing/messages). */
function limitError(message: string): AppError | null {
  if (!/plan_limit:|usage_limit_reached:|subscription_inactive/.test(message)) return null;
  return usageError(message);
}
