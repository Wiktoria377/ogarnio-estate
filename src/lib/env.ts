import "server-only";
import { z } from "zod";

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20).optional(),
  NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
  STORAGE_DRIVER: z.enum(["supabase", "local"]).default("supabase"),
  LOCAL_STORAGE_DIR: z.string().default(".data/uploads"),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default("claude-opus-5-5"),
  AI_REVIEW_MODEL: z.string().default("claude-haiku-5-5"),
  AI_USER_RATE_PER_MINUTE: z.coerce.number().int().min(1).max(120).default(8),
  // Offline test provider: deterministic, clearly labelled responses for automated
  // E2E tests without an API key. Refused when NODE_ENV=production.
  AI_TEST_PROVIDER: z.enum(["0", "1"]).default("0"),
  // Background job worker: "inline" runs a poll loop inside the Next.js server
  // process (single persistent Node server); "off" relies on POST /api/jobs/tick
  // (e.g. a cron calling it with JOB_TICK_SECRET) or a separate worker process.
  JOB_WORKER: z.enum(["inline", "off"]).default("inline"),
  JOB_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  JOB_TICK_SECRET: z.string().min(24).optional(),
  // Video rendering (Remotion + headless Chromium). Empty = Remotion's own download.
  REMOTION_BROWSER_EXECUTABLE: z.string().optional(),
  // Currency of cost rates and safety budgets in the platform admin panel.
  COST_CURRENCY: z.enum(["USD", "PLN", "EUR"]).default("USD"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Nieprawidłowa konfiguracja środowiska (${fields}). Zobacz .env.example.`);
  }
  if (parsed.data.STORAGE_DRIVER === "local" && parsed.data.NODE_ENV === "production" && !process.env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION) {
    throw new Error("STORAGE_DRIVER=local nie jest dozwolony w produkcji (ustaw supabase).");
  }
  cached = parsed.data;
  return cached;
}

export type AiAvailability =
  | { mode: "anthropic"; model: string; reviewModel: string }
  | { mode: "test" }
  | { mode: "unconfigured" };

export function aiAvailability(): AiAvailability {
  const env = serverEnv();
  if (env.ANTHROPIC_API_KEY) return { mode: "anthropic", model: env.AI_MODEL, reviewModel: env.AI_REVIEW_MODEL };
  if (env.AI_TEST_PROVIDER === "1" && env.NODE_ENV !== "production") return { mode: "test" };
  return { mode: "unconfigured" };
}
