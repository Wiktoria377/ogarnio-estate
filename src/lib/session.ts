import "server-only";
import "@/lib/observability";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, type ServerSupabase } from "@/lib/supabase/server";
import type { WorkspaceRole, WorkspaceRow, BrandProfileRow } from "@/lib/supabase/database.types";
import { AppError } from "@/lib/errors";
import { can, type Permission } from "@/core/auth/permissions";

export const WORKSPACE_COOKIE = "oe_ws";

export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
});

export async function requireUser() {
  const { supabase, user } = await getSessionUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export interface WorkspaceContext {
  supabase: ServerSupabase;
  userId: string;
  userEmail: string;
  userName: string;
  workspace: WorkspaceRow;
  role: WorkspaceRole;
  memberships: { workspace: WorkspaceRow; role: WorkspaceRole }[];
  /**
   * "worker": background job running with the service-role client on behalf of
   * the job's author. RLS is bypassed, so every query MUST filter by workspace.id
   * (all shared helpers do), and membership is re-checked before each job.
   */
  actor?: "user" | "worker";
}

const loadMemberships = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role, workspaces(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? [])
    .filter((m) => m.workspaces)
    .map((m) => ({ role: m.role, workspace: m.workspaces as unknown as WorkspaceRow }));
});

/**
 * Resolves the active workspace for the signed-in user. The cookie only
 * *selects* a workspace; membership is always re-verified from the database.
 */
export const getWorkspaceContext = cache(async (): Promise<WorkspaceContext | null> => {
  const { supabase, user } = await getSessionUser();
  if (!user) return null;
  const memberships = await loadMemberships(user.id);
  if (memberships.length === 0) return null;
  const selected = (await cookies()).get(WORKSPACE_COOKIE)?.value;
  const active = memberships.find((m) => m.workspace.id === selected) ?? memberships[0]!;
  const meta = (user.user_metadata ?? {}) as { full_name?: string };
  return {
    supabase,
    userId: user.id,
    userEmail: user.email ?? "",
    userName: meta.full_name?.trim() || (user.email ?? "").split("@")[0] || "",
    workspace: active.workspace,
    role: active.role,
    memberships,
  };
});

/** For pages: redirects to login / onboarding when needed. */
export async function requireWorkspace(): Promise<WorkspaceContext> {
  const { user } = await getSessionUser();
  if (!user) redirect("/login");
  const ctx = await getWorkspaceContext();
  if (!ctx) redirect("/onboarding");
  return ctx;
}

const EDITOR_ROLES: WorkspaceRole[] = ["owner", "admin", "agent", "marketing"];
const ADMIN_ROLES: WorkspaceRole[] = ["owner", "admin"];

/** For actions and route handlers: throws AppError instead of redirecting. */
export async function authorize(level: "member" | "editor" | "admin" = "member"): Promise<WorkspaceContext> {
  const ctx = await getWorkspaceContext();
  if (!ctx) throw new AppError("Sesja wygasła. Zaloguj się ponownie.", "unauthenticated", 401);
  if (level === "editor" && !EDITOR_ROLES.includes(ctx.role))
    throw new AppError("Twoja rola pozwala tylko na podgląd.", "forbidden", 403);
  if (level === "admin" && !ADMIN_ROLES.includes(ctx.role))
    throw new AppError("Tę operację może wykonać tylko właściciel lub administrator biura.", "forbidden", 403);
  return ctx;
}

/** Permission-based check (matrix in src/core/auth/permissions.ts, mirrored by RLS). */
export async function authorizePerm(permission: Permission): Promise<WorkspaceContext> {
  const ctx = await getWorkspaceContext();
  if (!ctx) throw new AppError("Sesja wygasła. Zaloguj się ponownie.", "unauthenticated", 401);
  if (!can(ctx.role, permission)) throw new AppError(PERMISSION_DENIED[permission] ?? "Twoja rola w biurze nie pozwala na tę operację.", "forbidden", 403);
  return ctx;
}

/** For pages: a missing permission sends the user to the dashboard with a readable notice. */
export async function pagePerm(permission: Permission): Promise<WorkspaceContext> {
  const ctx = await requireWorkspace();
  if (!can(ctx.role, permission)) redirect(`/dashboard?denied=${encodeURIComponent(permission)}`);
  return ctx;
}

const PERMISSION_DENIED: Partial<Record<Permission, string>> = {
  "billing.manage": "Płatnościami biura zarządza tylko właściciel.",
  "team.manage": "Zespołem zarządza tylko właściciel biura.",
  "publish.approve": "Publikacje zatwierdza właściciel, administrator lub osoba z rolą Marketing.",
  "social.manage": "Konta społecznościowe łączy właściciel lub administrator biura.",
  "import.run": "Import ofert może uruchomić właściciel lub administrator biura.",
};

export function canEdit(role: WorkspaceRole) {
  return EDITOR_ROLES.includes(role);
}
export function canAdmin(role: WorkspaceRole) {
  return ADMIN_ROLES.includes(role);
}

export async function loadBrand(ctx: WorkspaceContext): Promise<BrandProfileRow> {
  const { data, error } = await ctx.supabase
    .from("brand_profiles")
    .select("*")
    .eq("workspace_id", ctx.workspace.id)
    .single();
  if (error || !data) throw new AppError("Nie znaleziono profilu marki.", "brand_missing", 404);
  return data;
}
