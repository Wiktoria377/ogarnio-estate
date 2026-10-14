import "server-only";
import { logError } from "@/lib/observability";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const g = globalThis as typeof globalThis & { __oeRetentionAt?: number };

/** Deletes data past its retention period (policy in docs/PRIVACY_RETENTION.md). Runs at most every 6 hours per process; idempotent. */
export async function retentionTick(force = false): Promise<Json | null> {
  if (!force && Date.now() - (g.__oeRetentionAt ?? 0) < 6 * 3600_000) return null;
  g.__oeRetentionAt = Date.now();
  const { data, error } = await createAdminClient().rpc("run_retention");
  if (error) {
    await logError("retention", error);
    return null;
  }
  return data;
}
