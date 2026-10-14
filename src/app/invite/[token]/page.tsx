import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { AcceptInvite } from "./accept";
import { getSessionUser } from "@/lib/session";
import { sha256 } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { ROLE_LABELS, type Role } from "@/core/auth/permissions";

export const metadata = { title: "Zaproszenie do zespołu", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const valid = /^[A-Za-z0-9_-]{30,80}$/.test(token);
  // Server-side lookup by hash only: shows office name and role, never other data.
  const { data: inv } = valid
    ? await createAdminClient().from("workspace_invitations").select("email, role, expires_at, accepted_at, revoked_at, workspaces(name)").eq("token_hash", sha256(token)).maybeSingle()
    : { data: null };
  const { user } = await getSessionUser();
  const usable = inv && !inv.accepted_at && !inv.revoked_at && new Date(inv.expires_at) > new Date();
  const wsName = (inv?.workspaces as unknown as { name: string } | null)?.name ?? "";
  const next = `/invite/${token}`;
  return (
    <div className="flex min-h-dvh flex-col items-center px-6 py-10">
      <BrandMark />
      <main className="flex w-full max-w-md flex-1 flex-col justify-center py-12">
        {!usable ? (
          <>
            <h1 className="text-[24px] font-semibold">Zaproszenie jest nieaktualne</h1>
            <p className="mt-2 text-[14px] text-ink-3">{inv?.accepted_at ? "To zaproszenie zostało już wykorzystane." : "Link wygasł, został anulowany albo jest nieprawidłowy. Poproś właściciela biura o nowe zaproszenie."}</p>
            <Button asChild className="mt-6 self-start"><Link href="/login">Przejdź do logowania</Link></Button>
          </>
        ) : (
          <>
            <p className="text-[13px] font-medium text-accent">Zaproszenie do zespołu</p>
            <h1 className="mt-1 text-[26px] leading-tight font-semibold">Dołącz do biura „{wsName}”</h1>
            <p className="mt-2 text-[14px] text-ink-3">Rola: <strong className="text-ink">{ROLE_LABELS[inv.role as Role]}</strong>. Zaproszenie dotyczy adresu {inv.email}.</p>
            {user ? (
              user.email?.toLowerCase() === inv.email ? (
                <AcceptInvite token={token} />
              ) : (
                <div className="mt-6 rounded-md border border-warning/20 bg-warning-soft p-3 text-[13px] text-warning">Jesteś zalogowana/zalogowany jako {user.email}. Wyloguj się i zaloguj na konto {inv.email}, aby przyjąć zaproszenie.
                  <form action="/auth/signout" method="post" className="mt-2"><Button size="sm" variant="secondary" type="submit">Wyloguj się</Button></form>
                </div>
              )
            ) : (
              <div className="mt-6 flex flex-wrap gap-2">
                <Button asChild><Link href={`/signup?next=${encodeURIComponent(next)}&email=${encodeURIComponent(inv.email)}`}>Załóż konto</Link></Button>
                <Button asChild variant="secondary"><Link href={`/login?next=${encodeURIComponent(next)}`}>Mam już konto</Link></Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
