"use client";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, EnvelopeSimple, UserMinus, UserPlus } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, NativeSelect } from "@/components/ui/field";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/core/auth/permissions";
import { changeMemberRole, inviteMember, resendInvitation, revokeInvitation, setMemberActive, transferOwnership } from "@/app/(app)/settings/team/actions";
import type { ActionResult } from "@/lib/errors";

export interface TeamMember { id: string; name: string; email: string; role: Role; status: "active" | "deactivated"; isMe: boolean; assigned: number }
export interface TeamInvite { id: string; email: string; role: Role; expiresAt: string; expired: boolean }

const ROLES: Role[] = ["admin", "agent", "marketing", "viewer"];

function useRun() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult<unknown>>, onLink?: (l: string) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else {
        if (r.message) toast.success(r.message);
        const link = (r.data as { link?: string } | undefined)?.link;
        if (link) onLink?.(link);
      }
    });
  return { pending, run };
}

function LinkBox({ link }: { link: string }) {
  return (
    <div className="mt-3 rounded-md border border-warning/20 bg-warning-soft p-3 text-[12.5px] text-warning" role="status">
      <p className="font-medium">Wysyłka e-maili nie jest skonfigurowana (SMTP). Przekaż ten link zapraszanej osobie. Pokazujemy go tylko raz.</p>
      <div className="mt-2 flex gap-2">
        <Input readOnly value={link} aria-label="Link zaproszenia" data-testid="invite-link" className="h-8 bg-surface text-[12px]" />
        <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Skopiowano"))}><Copy /> Kopiuj</Button>
      </div>
    </div>
  );
}

export function InviteForm({ canInvite, seatsLeft }: { canInvite: boolean; seatsLeft: number }) {
  const [state, action, pending] = useActionState(inviteMember, null);
  const [role, setRole] = useState<Role>("agent");
  const link = state?.ok ? state.data.link : undefined;
  return (
    <form action={action} className="flex flex-col gap-3">
      {state && !state.ok && <div role="alert" className="rounded-md border border-danger/20 bg-danger-soft px-3 py-2 text-[13px] text-danger">{state.error}</div>}
      {state?.ok && !link && <div role="status" className="rounded-md border border-success/20 bg-success-soft px-3 py-2 text-[13px] text-success">{state.message}</div>}
      <div className="grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
        <Field label="E-mail osoby zapraszanej" htmlFor="invite-email">
          <Input id="invite-email" name="email" type="email" required disabled={!canInvite} maxLength={254} />
        </Field>
        <Field label="Rola" htmlFor="invite-role">
          <NativeSelect id="invite-role" name="role" value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={!canInvite}>
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </NativeSelect>
        </Field>
        <Button type="submit" loading={pending} disabled={!canInvite || seatsLeft <= 0}><UserPlus /> Zaproś</Button>
      </div>
      <p className="text-[12px] text-ink-3">{ROLE_DESCRIPTIONS[role]}</p>
      {seatsLeft <= 0 && <p className="text-[12.5px] text-warning">Wykorzystano liczbę użytkowników w planie. Zmień plan w zakładce „Plan i płatności”, aby zaprosić kolejne osoby.</p>}
      {link && <LinkBox link={link} />}
    </form>
  );
}

function TransferDialog({ member, workspaceName }: { member: TeamMember; workspaceName: string }) {
  const [confirm, setConfirm] = useState("");
  const { pending, run } = useRun();
  return (
    <Dialog>
      <DialogTrigger asChild><Button size="sm" variant="ghost">Przekaż własność</Button></DialogTrigger>
      <DialogContent title={`Przekazać własność ${member.name}?`} description="Nowy właściciel przejmie płatności, zespół i ustawienia firmy. Ty zostaniesz administratorem.">
        <Field label={`Wpisz nazwę biura: ${workspaceName}`} htmlFor="transfer-confirm"><Input id="transfer-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></Field>
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose asChild><Button variant="secondary">Anuluj</Button></DialogClose>
          <Button variant="danger" loading={pending} disabled={confirm.trim() !== workspaceName} onClick={() => run(() => transferOwnership(member.id, confirm))}>Przekaż własność</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MemberRow({ m, manage, workspaceName }: { m: TeamMember; manage: boolean; workspaceName: string }) {
  const { pending, run } = useRun();
  const editable = manage && !m.isMe && m.role !== "owner";
  return (
    <li className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center" data-testid="team-member">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-medium text-ink">{m.name}{m.isMe && <span className="font-normal text-ink-3"> (Ty)</span>}</p>
        <p className="truncate text-[12px] text-ink-3">{m.email}{m.assigned > 0 ? ` · ${m.assigned} przypisanych ofert` : ""}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {m.status === "deactivated" && <Badge tone="muted">Dezaktywowany</Badge>}
        {editable && m.status === "active" ? (
          <NativeSelect aria-label={`Rola: ${m.name}`} value={m.role} disabled={pending} onChange={(e) => run(() => changeMemberRole(m.id, e.target.value))} className="h-8 w-40 text-[13px]">
            {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </NativeSelect>
        ) : (
          <Badge tone="outline">{ROLE_LABELS[m.role]}</Badge>
        )}
        {editable && (m.status === "active" ? (
          <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => setMemberActive(m.id, false))}><UserMinus /> Dezaktywuj</Button>
        ) : (
          <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => setMemberActive(m.id, true))}>Aktywuj</Button>
        ))}
        {manage && !m.isMe && m.status === "active" && m.role !== "owner" && <TransferDialog member={m} workspaceName={workspaceName} />}
      </div>
    </li>
  );
}

export function InviteRow({ inv }: { inv: TeamInvite }) {
  const { pending, run } = useRun();
  const [link, setLink] = useState<string | null>(null);
  return (
    <li className="px-3 py-3" data-testid="team-invite">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 truncate text-[13.5px] text-ink"><EnvelopeSimple size={15} className="text-ink-3" /> {inv.email}</p>
          <p className="text-[12px] text-ink-3">{ROLE_LABELS[inv.role]} · {inv.expired ? "zaproszenie wygasło" : `ważne do ${new Date(inv.expiresAt).toLocaleDateString("pl-PL")}`}</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => resendInvitation(inv.id), setLink)}>Wyślij ponownie</Button>
          <Button size="sm" variant="ghost" loading={pending} onClick={() => run(() => revokeInvitation(inv.id))}>Anuluj</Button>
        </div>
      </div>
      {link && <LinkBox link={link} />}
    </li>
  );
}
