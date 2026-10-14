"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowSquareOut, CalendarBlank, CheckCircle, FacebookLogo, InstagramLogo, LinkedinLogo, TiktokLogo, X } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { approve, cancel, confirmAbsent, edit, retry, submitForApproval } from "@/app/(app)/publications/actions";
import { CANCELABLE_STATES, PLATFORMS, PUBLICATION_STATE, formatRule } from "@/core/publishing/platforms";
import { isoToWarsaw, warsawToIso } from "@/core/planner/time";
import type { PublicationFormat, PublicationState, SocialPlatform } from "@/lib/supabase/database.types";

export interface PublicationView {
  id: string;
  state: PublicationState;
  platform: SocialPlatform;
  account: string;
  accountStatus: string;
  format: PublicationFormat;
  caption: string;
  scheduledAt: string;
  publishedAt: string | null;
  externalId: string | null;
  externalUrl: string | null;
  error: string | null;
  uncertain: boolean;
  mediaCount: number;
  approvedBy: string | null;
  requestedBy: string | null;
  history: { at: string; action: string; outcome: string; message: string | null }[];
}

const ICON: Record<SocialPlatform, typeof FacebookLogo> = { facebook_page: FacebookLogo, instagram: InstagramLogo, linkedin_org: LinkedinLogo, linkedin_member: LinkedinLogo, tiktok: TiktokLogo };
const fmt = (iso: string) => new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function Row({ p, canApprove, canEdit }: { p: PublicationView; canApprove: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [moving, setMoving] = useState(false);
  const w = isoToWarsaw(p.scheduledAt);
  const [date, setDate] = useState(w.date);
  const [time, setTime] = useState(w.time);
  const I = ICON[p.platform];
  const st = PUBLICATION_STATE[p.state];
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => {
    const r = await fn();
    if (r.ok) toast.success(r.message ?? "Gotowe");
    else toast.error(r.error ?? "Błąd");
    router.refresh();
  });
  return (
    <li className="flex flex-col gap-2 px-4 py-3" data-testid="publication-row" data-state={p.state}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <I size={18} className="shrink-0 text-ink-2" />
        <span className="text-[13.5px] font-medium">{p.account}</span>
        <span className="text-[12.5px] text-ink-3">{formatRule(p.platform, p.format)?.label ?? p.format}{p.mediaCount ? ` · plików: ${p.mediaCount}` : ""}</span>
        <span className="inline-flex items-center gap-1 text-[12.5px] text-ink-2 tabular-nums"><CalendarBlank size={13} /> {fmt(p.scheduledAt)}</span>
        <Badge tone={st.tone === "accent" ? "accent" : st.tone} data-testid="publication-state" className="ml-auto">{st.label}</Badge>
      </div>
      {p.caption && <p className="line-clamp-2 text-[12.5px] text-ink-2">{p.caption}</p>}
      {p.error && <p className="text-[12.5px] text-danger" data-testid="publication-error">{p.error}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
        {p.requestedBy && <span>Do akceptacji: {p.requestedBy}</span>}
        {p.approvedBy && <span>Zatwierdził(a): {p.approvedBy}</span>}
        {p.state === "published" && p.externalId && <span data-testid="external-id">ID na platformie: {p.externalId}</span>}
        {p.externalUrl && <a href={p.externalUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-accent-ink hover:underline">Zobacz post <ArrowSquareOut size={12} /></a>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {canApprove && ["draft", "pending_approval"].includes(p.state) && <Button size="sm" loading={pending} onClick={() => run(() => approve(p.id))}><CheckCircle /> Zatwierdź</Button>}
        {canEdit && p.state === "draft" && <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => submitForApproval(p.id))}>Wyślij do akceptacji</Button>}
        {canApprove && p.uncertain && p.state === "action_required" && <Button size="sm" variant="secondary" loading={pending} onClick={() => { if (confirm(`Sprawdziłeś(-aś) konto ${p.account} i tego posta tam NIE ma?`)) run(() => confirmAbsent(p.id)); }}>Potwierdzam, że posta nie ma</Button>}
        {canApprove && ["failed", "action_required"].includes(p.state) && !p.uncertain && <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => retry(p.id))}>Ponów</Button>}
        {canEdit && ["draft", "pending_approval", "scheduled", "failed", "action_required"].includes(p.state) && <Button size="sm" variant="ghost" onClick={() => setMoving((m) => !m)}>Zmień termin</Button>}
        {canEdit && CANCELABLE_STATES.includes(p.state) && <Button size="sm" variant="ghost" className="text-danger" loading={pending} onClick={() => { if (confirm("Anulować tę publikację?")) run(() => cancel(p.id)); }}><X /> Anuluj</Button>}
      </div>
      {moving && (
        <div className="flex flex-wrap items-end gap-2">
          <Input type="date" aria-label="Nowa data" className="h-8 w-40" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input type="time" aria-label="Nowa godzina" className="h-8 w-28" value={time} onChange={(e) => setTime(e.target.value)} />
          <Button size="sm" loading={pending} onClick={() => run(async () => { const r = await edit(p.id, { scheduledAt: warsawToIso(date, time) }); if (r.ok) setMoving(false); return r; })}>Zapisz termin</Button>
        </div>
      )}
      {p.history.length > 0 && (
        <details className="text-[12px] text-ink-3">
          <summary className="cursor-pointer">Historia ({p.history.length})</summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {p.history.map((h, i) => <li key={i}><span className="tabular-nums">{fmt(h.at)}</span> · {h.message ?? `${h.action}: ${h.outcome}`}</li>)}
          </ul>
        </details>
      )}
      {p.platform && !PLATFORMS[p.platform].available && <p className="text-[12px] text-ink-3">{PLATFORMS[p.platform].unavailableReason}</p>}
    </li>
  );
}

export function PublicationList({ items, canApprove, canEdit }: { items: PublicationView[]; canApprove: boolean; canEdit: boolean }) {
  return (
    <Card className="p-0">
      <ul className="divide-y divide-line">{items.map((p) => <Row key={p.id} p={p} canApprove={canApprove} canEdit={canEdit} />)}</ul>
    </Card>
  );
}
