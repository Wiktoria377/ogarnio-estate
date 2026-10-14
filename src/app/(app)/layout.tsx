import { requireWorkspace } from "@/lib/session";
import { aiAvailability } from "@/lib/env";
import { accessMessage, getUsageSummary } from "@/lib/billing/usage";
import { AppShell } from "@/components/shell/app-shell";
import { t } from "@/i18n/pl";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireWorkspace();
  const { data: brand } = await ctx.supabase.from("brand_profiles").select("company_name, logo_asset_id").eq("workspace_id", ctx.workspace.id).maybeSingle();
  let logoUrl: string | null = null;
  if (brand?.logo_asset_id) {
    const { data } = await ctx.supabase.from("brand_assets").select("storage_path").eq("id", brand.logo_asset_id).maybeSingle();
    if (data) logoUrl = `/api/files/${data.storage_path}`;
  }
  const ai = aiAvailability();
  const usage = await getUsageSummary(ctx).catch(() => null);
  let planAlert = null;
  if (usage && usage.access !== "full") planAlert = { text: accessMessage(usage.accessReason), tone: "danger" as const, href: "/settings/billing", cta: "Plan i płatności" };
  else if (usage?.status === "past_due") planAlert = { text: "Płatność za subskrypcję nie powiodła się. Stripe ponowi próbę; zaktualizuj metodę płatności, aby uniknąć blokady.", tone: "warning" as const, href: "/settings/billing", cta: "Zaktualizuj płatność" };
  else if (usage?.status === "trialing" && usage.trialEndsAt && new Date(usage.trialEndsAt).getTime() - Date.now() < 3 * 86400_000)
    planAlert = { text: `Okres próbny kończy się ${new Date(usage.trialEndsAt).toLocaleDateString("pl-PL", { day: "numeric", month: "long" })}. Wybierz plan, aby nie stracić możliwości generowania.`, tone: "warning" as const, href: "/settings/billing", cta: "Wybierz plan" };
  return (
    <AppShell
      user={{ name: ctx.userName, email: ctx.userEmail }}
      workspace={{ id: ctx.workspace.id, name: brand?.company_name || ctx.workspace.name, logoUrl, role: ctx.role }}
      workspaces={ctx.memberships.map((m) => ({ id: m.workspace.id, name: m.workspace.name }))}
      planAlert={planAlert}
      banner={ai.mode === "test" ? t.ai.testMode : ai.mode === "unconfigured" ? t.ai.unconfigured : null}
    >
      {children}
    </AppShell>
  );
}
