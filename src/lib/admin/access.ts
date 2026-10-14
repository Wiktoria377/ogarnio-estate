import "server-only";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AppError } from "@/lib/errors";
import { clientIp } from "@/lib/observability";
import { getSessionUser } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

export interface PlatformAdmin {
  userId: string;
  email: string;
  role: "admin" | "viewer";
}

/**
 * Platform administrators are listed in platform_admins (service-role only,
 * granted with `npm run admin:grant`). Office roles never give access here.
 */
export async function getPlatformAdmin(): Promise<PlatformAdmin | null> {
  const { user } = await getSessionUser();
  if (!user) return null;
  const { data } = await createAdminClient().from("platform_admins").select("role").eq("user_id", user.id).maybeSingle();
  return data ? { userId: user.id, email: user.email ?? "", role: data.role } : null;
}

/** Pages: anyone else gets a plain 404, so the panel's existence is not revealed. */
export async function adminPage(): Promise<PlatformAdmin> {
  const a = await getPlatformAdmin();
  if (!a) notFound();
  return a;
}

/** Actions and API routes; write=true requires the "admin" role (viewer is read-only). */
export async function requirePlatformAdmin(write = false): Promise<PlatformAdmin> {
  const a = await getPlatformAdmin();
  if (!a) throw new AppError("Nie znaleziono.", "not_found", 404);
  if (write && a.role !== "admin") throw new AppError("Rola „podgląd” w panelu administratora nie pozwala na zmiany.", "forbidden", 403);
  return a;
}

export async function logAdmin(
  admin: PlatformAdmin | null,
  action: string,
  t: { targetType?: string; targetId?: string; workspaceId?: string | null; reason?: string | null; detail?: Record<string, unknown> } = {},
) {
  let ip: string | null = null;
  try {
    const h = await headers();
    ip = clientIp(new Request("http://x", { headers: h })).slice(0, 64);
  } catch {
    ip = null;
  }
  const { error } = await createAdminClient().from("admin_audit_log").insert({
    actor: admin?.userId ?? null,
    actor_email: admin?.email.slice(0, 200) ?? null,
    action: action.slice(0, 80),
    target_type: t.targetType ?? null,
    target_id: t.targetId?.slice(0, 120) ?? null,
    workspace_id: t.workspaceId ?? null,
    reason: t.reason?.slice(0, 500) ?? null,
    detail: (t.detail ?? {}) as Json,
    ip,
  });
  // An action that cannot be audited must not happen silently.
  if (error) throw new AppError("Nie udało się zapisać wpisu w dzienniku administratora. Operacja przerwana.", "audit_failed", 500);
}
