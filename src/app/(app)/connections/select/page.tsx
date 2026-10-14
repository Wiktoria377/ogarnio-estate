import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { SelectAccounts } from "@/components/social/select-accounts";
import { PLATFORMS, SOCIAL_STATUS } from "@/core/publishing/platforms";
import { AppError } from "@/lib/errors";
import { pagePerm } from "@/lib/session";
import { loadGrant } from "@/lib/social/connections";

export const metadata = { title: "Wybierz konta" };

export default async function SelectAccountsPage({ searchParams }: { searchParams: Promise<{ grant?: string }> }) {
  const ctx = await pagePerm("social.manage");
  const { grant: id } = await searchParams;
  if (!id || !/^[0-9a-f-]{36}$/.test(id)) redirect("/connections");
  let grant;
  try {
    grant = await loadGrant(ctx, id);
  } catch (error) {
    redirect(`/connections?error=${encodeURIComponent(error instanceof AppError ? error.message : "Wybór kont wygasł.")}`);
  }
  const accounts = grant.discovered.map((d) => ({ key: d.key, name: d.name, platform: PLATFORMS[d.platform].label, status: SOCIAL_STATUS[d.status].label, ok: d.status === "connected" || d.status === "limited", note: [d.note, d.missing_scopes.length ? `Brakujące uprawnienia: ${d.missing_scopes.join(", ")}` : null].filter(Boolean).join(" "), parent: d.parent_key }));
  return (
    <div className="max-w-2xl">
      <PageHeader eyebrow="Połączone konta" title="Wybierz konta do połączenia" description="Platforma udostępniła poniższe strony i konta. Zaznacz te, na których biuro ma publikować." />
      <Card className="p-5">
        {accounts.length === 0 ? (
          <p className="text-[13.5px] text-ink-2">Nie znaleziono stron ani kont, którymi możesz zarządzać. Na Facebooku musisz mieć dostęp do strony (z uprawnieniem do tworzenia treści), a konto Instagram musi być kontem firmowym lub twórcy połączonym ze stroną.</p>
        ) : (
          <SelectAccounts grantId={grant.id} accounts={accounts} />
        )}
      </Card>
    </div>
  );
}
