import { FacebookLogo, InstagramLogo, LinkedinLogo, TiktokLogo, Warning } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConnectionActions } from "@/components/social/connection-actions";
import { PLATFORMS, SOCIAL_STATUS, formatRule, type Provider } from "@/core/publishing/platforms";
import { providerConfigured, socialMock } from "@/lib/social/config";
import { getUsageSummary } from "@/lib/billing/usage";
import { requireWorkspace } from "@/lib/session";
import { can } from "@/core/auth/permissions";
import { formatRelative } from "@/lib/utils";
import type { SocialPlatform } from "@/lib/supabase/database.types";
import { startConnect } from "./actions";

export const metadata = { title: "Połączone konta" };

const ICON: Record<SocialPlatform, typeof FacebookLogo> = { facebook_page: FacebookLogo, instagram: InstagramLogo, linkedin_org: LinkedinLogo, linkedin_member: LinkedinLogo, tiktok: TiktokLogo };

const PROVIDERS: { id: Provider; label: string; platforms: SocialPlatform[]; button: string; env: string }[] = [
  { id: "meta", label: "Meta: Facebook i Instagram", platforms: ["facebook_page", "instagram"], button: "Połącz Facebook / Instagram", env: "META_APP_ID, META_APP_SECRET" },
  { id: "linkedin", label: "LinkedIn", platforms: ["linkedin_member", "linkedin_org"], button: "Połącz LinkedIn", env: "LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET" },
  { id: "tiktok", label: "TikTok", platforms: ["tiktok"], button: "Połącz TikTok", env: "" },
];

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const manage = can(ctx.role, "social.manage");
  const [{ data: rows }, usage] = await Promise.all([
    ctx.supabase.from("social_connections").select("*").eq("workspace_id", ctx.workspace.id).neq("status", "disconnected").order("created_at"),
    getUsageSummary(ctx),
  ]);
  const mock = socialMock();
  const used = rows?.length ?? 0;
  const limit = usage.social.limit;

  return (
    <>
      <PageHeader title="Połączone konta" description="Konta, na których Ogarnio Estate może publikować zaplanowane i zaakceptowane posty. Łączymy się wyłącznie przez oficjalne API i autoryzację OAuth; tokeny są przechowywane zaszyfrowane po stronie serwera." />
      {mock && (
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[13px] text-warning" role="alert" data-testid="social-mock-banner">
          <Warning className="mt-0.5 shrink-0" /> Tryb testowy: zamiast prawdziwych API Meta i LinkedIn używany jest lokalny symulator kontraktu ({mock}). Publikacje nie trafiają na prawdziwe konta, a wyniki nie są prawdziwymi danymi.
        </div>
      )}
      {sp.error && <div className="mb-5 rounded-lg border border-danger/25 bg-danger-soft px-4 py-3 text-[13.5px] text-danger" role="alert">{sp.error.slice(0, 300)}</div>}
      <p className="mb-4 text-[13px] text-ink-3" data-testid="social-usage">Połączone konta: {used} z {limit} w planie.{!manage && " Konta łączy właściciel lub administrator biura."}</p>
      <div className="flex flex-col gap-5">
        {PROVIDERS.map((p) => {
          const configured = p.id !== "tiktok" && providerConfigured(p.id);
          const accounts = (rows ?? []).filter((r) => p.platforms.includes(r.platform));
          const available = p.platforms.some((x) => PLATFORMS[x].available);
          return (
            <Card key={p.id} className="p-5 sm:p-6" data-testid={`provider-${p.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                    {p.platforms.filter((x, i, a) => a.findIndex((y) => ICON[y] === ICON[x]) === i).map((x) => { const I = ICON[x]; return <I key={x} size={20} weight="fill" className="text-ink-2" />; })}
                    {p.label}
                  </h2>
                  {!available ? (
                    <Badge tone="neutral" className="mt-2">Niedostępne</Badge>
                  ) : !configured ? (
                    <p className="mt-1 text-[13px] text-warning">Wymaga konfiguracji: administrator Ogarnio musi ustawić {p.env} na serwerze (instrukcja: docs/SOCIAL_SETUP.md).</p>
                  ) : null}
                </div>
                {manage && available && (
                  <form action={startConnect}>
                    <input type="hidden" name="provider" value={p.id} />
                    <Button type="submit" variant={accounts.length ? "secondary" : "primary"} disabled={!configured || used >= limit}>{accounts.length ? "Połącz kolejne konto" : p.button}</Button>
                  </form>
                )}
              </div>
              <ul className="mt-4 grid gap-2 text-[12.5px] text-ink-3">
                {p.platforms.map((x) => (
                  <li key={x}><span className="font-medium text-ink-2">{PLATFORMS[x].label}:</span> {PLATFORMS[x].available ? PLATFORMS[x].formats.map((f) => f.label).join(", ") : PLATFORMS[x].unavailableReason} <span className="block text-ink-4">{PLATFORMS[x].review}</span></li>
                ))}
              </ul>
              {accounts.length > 0 && (
                <ul className="mt-4 divide-y divide-line rounded-lg border border-line">
                  {accounts.map((a) => {
                    const I = ICON[a.platform];
                    const st = SOCIAL_STATUS[a.status];
                    return (
                      <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3" data-testid="social-account">
                        {a.avatar_url ? <img src={a.avatar_url} alt="" className="size-9 rounded-full border border-line object-cover" /> : <span className="flex size-9 items-center justify-center rounded-full bg-sunken"><I size={18} /></span>}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-medium text-ink">{a.name} <span className="font-normal text-ink-3">· {PLATFORMS[a.platform].label}</span></p>
                          <p className="text-[12px] text-ink-3">
                            Publikacje: {a.capabilities.map((c) => formatRule(a.platform, c as never)?.label ?? c).join(", ") || "brak"}
                            {a.last_sync_at && <> · ostatnia synchronizacja {formatRelative(a.last_sync_at)}</>}
                            {a.token_expires_at && <> · autoryzacja ważna do {new Date(a.token_expires_at).toLocaleDateString("pl-PL")}</>}
                          </p>
                          {a.missing_scopes.length > 0 && <p className="text-[12px] text-warning">Brakujące uprawnienia: {a.missing_scopes.join(", ")}</p>}
                          {a.last_error && <p className="text-[12px] text-danger">{a.last_error}</p>}
                        </div>
                        <Badge tone={st.tone} data-testid="social-status">{st.label}</Badge>
                        {manage && <ConnectionActions id={a.id} name={a.name} reconnect={a.status === "reauth_required" || a.status === "limited" ? PLATFORMS[a.platform].provider : null} />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
