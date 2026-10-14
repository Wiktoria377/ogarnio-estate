import "server-only";
import type { WorkspaceContext } from "@/lib/session";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Onboarding wizard state. Progress is derived from real data (logo uploaded,
 * first offer, first material…) plus explicit flags for steps the user saved
 * or skipped, so the wizard can be paused and resumed at any time and never
 * reports a step as done that did not happen.
 */
export const ONBOARDING_STEPS = [
  { id: "account", label: "Konto", optional: false },
  { id: "office", label: "Nazwa biura", optional: false },
  { id: "logo", label: "Logo", optional: true },
  { id: "colors", label: "Kolory marki", optional: true },
  { id: "property", label: "Pierwsza oferta", optional: false },
  { id: "post", label: "Pierwszy post", optional: false },
  { id: "save", label: "Zapis i pobranie", optional: false },
  { id: "social", label: "Social media", optional: true },
  { id: "plan", label: "Plan lub okres próbny", optional: false },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]["id"];
export type StepStatus = "done" | "skipped" | "todo";

interface Flags {
  skipped?: string[];
  colors_saved?: boolean;
  saved?: boolean;
  trial_accepted?: boolean;
  paused_at?: string;
}

export interface OnboardingState {
  steps: { id: OnboardingStepId; label: string; optional: boolean; status: StepStatus }[];
  current: OnboardingStepId | null;
  doneCount: number;
  total: number;
  completed: boolean;
  firstPropertyId: string | null;
  firstItem: { id: string; kind: string } | null;
}

export async function getOnboarding(ctx: WorkspaceContext): Promise<OnboardingState> {
  const ws = ctx.workspace.id;
  const sb = ctx.supabase;
  const [brand, prop, item, exp, sub, social] = await Promise.all([
    sb.from("brand_profiles").select("logo_asset_id").eq("workspace_id", ws).maybeSingle(),
    sb.from("properties").select("id").eq("workspace_id", ws).order("created_at").limit(1),
    sb.from("content_items").select("id, kind").eq("workspace_id", ws).order("created_at").limit(1),
    sb.from("export_events").select("id", { count: "exact", head: true }).eq("workspace_id", ws),
    sb.from("workspace_subscriptions").select("provider_subscription_id").eq("workspace_id", ws).maybeSingle(),
    sb.from("social_connections").select("id", { count: "exact", head: true }).eq("workspace_id", ws).in("status", ["connected", "limited", "reauth_required"]),
  ]);
  const flags = (ctx.workspace.onboarding ?? {}) as Flags;
  const skipped = new Set(flags.skipped ?? []);
  const done: Record<OnboardingStepId, boolean> = {
    account: true,
    office: true,
    logo: !!brand.data?.logo_asset_id,
    colors: !!flags.colors_saved,
    property: (prop.data?.length ?? 0) > 0,
    post: (item.data?.length ?? 0) > 0,
    save: !!flags.saved || (exp.count ?? 0) > 0,
    social: !social.error && (social.count ?? 0) > 0,
    plan: !!flags.trial_accepted || !!sub.data?.provider_subscription_id,
  };
  const steps = ONBOARDING_STEPS.map((s) => ({ ...s, status: (done[s.id] ? "done" : s.optional && skipped.has(s.id) ? "skipped" : "todo") as StepStatus }));
  const doneCount = steps.filter((s) => s.status !== "todo").length;
  const current = steps.find((s) => s.status === "todo")?.id ?? null;
  return {
    steps,
    current,
    doneCount,
    total: steps.length,
    completed: !!ctx.workspace.onboarding_completed_at || current === null,
    firstPropertyId: prop.data?.[0]?.id ?? null,
    firstItem: item.data?.[0] ?? null,
  };
}

/** Merges flags into workspaces.onboarding; marks completion when nothing is left. */
export async function updateOnboarding(ctx: WorkspaceContext, patch: Partial<Flags> & { skip?: OnboardingStepId }) {
  const flags = { ...((ctx.workspace.onboarding ?? {}) as Flags) };
  if (patch.skip) flags.skipped = [...new Set([...(flags.skipped ?? []), patch.skip])];
  for (const k of ["colors_saved", "saved", "trial_accepted", "paused_at"] as const) if (patch[k] !== undefined) (flags as Record<string, unknown>)[k] = patch[k];
  ctx.workspace = { ...ctx.workspace, onboarding: flags as Json };
  const state = await getOnboarding(ctx);
  const { error } = await ctx.supabase
    .from("workspaces")
    .update({ onboarding: flags as Json, ...(state.current === null && !ctx.workspace.onboarding_completed_at ? { onboarding_completed_at: new Date().toISOString() } : {}) })
    .eq("id", ctx.workspace.id);
  return { state, error };
}
