"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CalendarBlank, CaretLeft, CaretRight, CheckCircle, Lightning, LinkSimple, ListBullets, Plus, Rows, SquaresFour, Trash, Warning, X } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/empty";
import { createEntry, createPlan, deleteEntry, deletePlan, moveEntry, setEntryStatus, updateEntry, type EntryInput } from "@/app/(app)/planner/actions";
import { cancel as cancelPublication } from "@/app/(app)/publications/actions";
import { CANCELABLE_STATES, PLATFORMS } from "@/core/publishing/platforms";
import type { PublicationState, SocialPlatform } from "@/lib/supabase/database.types";
import { MONTHS, PLAN_LENGTHS, SCHEDULE_CHANNELS, SCHEDULE_CHANNEL_IDS, SCHEDULE_STATUSES, SCHEDULE_STATUS_IDS, WEEKDAYS_SHORT, dayLabel, type PlanLength } from "@/core/planner/model";
import { addDays } from "@/core/planner/time";
import type { ScheduleChannel, ScheduleStatus } from "@/lib/supabase/database.types";
import { itemHref, ITEM_KIND_LABELS, type ItemKind } from "@/lib/routes";
import { cn } from "@/lib/utils";

export type PlannerView = "month" | "week" | "list" | "plans";
export interface PlannerEntry {
  id: string;
  title: string;
  channel: ScheduleChannel;
  status: ScheduleStatus;
  date: string;
  time: string;
  notes: string;
  contentItemId: string | null;
  content: { id: string; title: string; kind: ItemKind } | null;
  campaign: { id: string; name: string } | null;
  planId: string | null;
  externalUrl: string;
  publishedAt: string | null;
  campaignId?: string | null;
  /** Automatic publications attached to this entry (their states own the entry status). */
  auto?: { id: string; state: PublicationState; stateLabel: string; account: string; platform: SocialPlatform; caption: string; conflict: string | null }[];
}
interface PlanRow { id: string; name: string; startDate: string; days: number; postsPerWeek: number; channels: string[]; campaign: { id: string; name: string } | null }
interface Props {
  view: PlannerView;
  anchor: string;
  today: string;
  days: string[] | null;
  entries: PlannerEntry[];
  plans: PlanRow[];
  items: { id: string; title: string; kind: ItemKind }[];
  campaigns: { id: string; name: string }[];
  properties: { id: string; title: string }[];
  editable: boolean;
}

const STATUS_DOT: Record<ScheduleStatus, string> = { idea: "bg-ink-4", in_progress: "bg-ink-2", for_approval: "bg-warning", ready: "bg-accent", published: "bg-success" };
const STATUS_CHIP: Record<ScheduleStatus, string> = {
  idea: "border-dashed border-line-strong bg-surface text-ink-3",
  in_progress: "border-line bg-sunken text-ink-2",
  for_approval: "border-warning/25 bg-warning-soft text-warning",
  ready: "border-accent/25 bg-accent-soft text-accent-ink",
  published: "border-success/25 bg-success-soft text-success",
};

type Draft = EntryInput & { id?: string };
const emptyDraft = (date: string): Draft => ({ title: "", channel: "instagram", date, time: SCHEDULE_CHANNELS.instagram.time, status: "idea", notes: "", contentItemId: null, externalUrl: "" });

function EntryChip({ e, onOpen, draggable }: { e: PlannerEntry; onOpen: () => void; draggable: boolean }) {
  const conflict = e.auto?.find((a) => a.conflict)?.conflict ?? null;
  const auto = !!e.auto?.length;
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(ev) => { ev.dataTransfer.setData("text/plain", e.id); ev.dataTransfer.effectAllowed = "move"; }}
      onClick={(ev) => { ev.stopPropagation(); onOpen(); }}
      className={cn("flex w-full items-center gap-1.5 truncate rounded-md border px-1.5 py-1 text-left text-[11.5px] leading-tight transition-shadow hover:shadow-sm", STATUS_CHIP[e.status], draggable && "cursor-grab active:cursor-grabbing", conflict && "ring-2 ring-danger/60")}
      data-testid="planner-entry"
      data-conflict={conflict ? "1" : undefined}
      title={`${e.time} · ${SCHEDULE_CHANNELS[e.channel].label} · ${e.title} (${auto ? e.auto!.map((a) => `${a.account}: ${a.stateLabel}`).join(", ") : SCHEDULE_STATUSES[e.status].label})${conflict ? ` · Konflikt: ${conflict}` : ""}`}
    >
      {conflict ? <Warning size={12} className="shrink-0 text-danger" aria-label="Konflikt" /> : auto ? <Lightning size={12} weight="fill" className="shrink-0" aria-label="Automatyczna publikacja" /> : null}
      <span className="tabular shrink-0 font-medium">{e.time}</span>
      <span className="truncate">{e.title}</span>
    </button>
  );
}

export function Planner({ view, anchor, today, days, entries, plans, items, campaigns, properties, editable }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [planOpen, setPlanOpen] = useState(false);
  const [channel, setChannel] = useState<ScheduleChannel | "">("");
  const [status, setStatus] = useState<ScheduleStatus | "">("");
  const [campaign, setCampaign] = useState("");
  const [busy, start] = useTransition();
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [local, setLocal] = useState(entries);
  const [seen, setSeen] = useState(entries);
  if (seen !== entries) {
    setSeen(entries);
    setLocal(entries);
  }

  const visible = useMemo(() => local.filter((e) => (!channel || e.channel === channel) && (!status || e.status === status) && (!campaign || (campaign === "none" ? !e.campaignId : e.campaignId === campaign))), [local, channel, status, campaign]);
  const byDay = useMemo(() => {
    const m = new Map<string, PlannerEntry[]>();
    for (const e of visible) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    for (const list of m.values()) list.sort((a, b) => a.time.localeCompare(b.time));
    return m;
  }, [visible]);

  const href = (v: PlannerView, d = anchor) => `/planner?view=${v}&date=${d}`;
  const step = view === "month" ? (dir: number) => { const [y, m] = anchor.split("-").map(Number); const n = new Date(Date.UTC(y!, m! - 1 + dir, 1)); return n.toISOString().slice(0, 10); } : (dir: number) => addDays(anchor, dir * (view === "week" ? 7 : 31));
  const title = view === "month" ? `${MONTHS[Number(anchor.slice(5, 7)) - 1]} ${anchor.slice(0, 4)}` : view === "week" && days ? `${dayLabel(days[0]!, false)} – ${dayLabel(days[6]!, false)} ${days[6]!.slice(0, 4)}` : view === "list" ? `Od ${dayLabel(anchor, false)}` : "Plany publikacji";

  const open = (e: PlannerEntry) => setDraft({ id: e.id, title: e.title, channel: e.channel, date: e.date, time: e.time, status: e.status, notes: e.notes, contentItemId: e.contentItemId, externalUrl: e.externalUrl });

  function drop(date: string, id: string) {
    setDragOver(null);
    const e = local.find((x) => x.id === id);
    if (!e || e.date === date) return;
    setLocal((cur) => cur.map((x) => (x.id === id ? { ...x, date } : x)));
    start(async () => {
      const r = await moveEntry(id, date);
      if (!r.ok) {
        toast.error(r.error);
        setLocal(entries);
      } else toast.success(`Przeniesiono na ${dayLabel(date)}`);
      router.refresh();
    });
  }

  const dayCell = (d: string, tall: boolean) => {
    const list = byDay.get(d) ?? [];
    const outside = view === "month" && d.slice(0, 7) !== anchor.slice(0, 7);
    return (
      <div
        key={d}
        role="gridcell"
        aria-label={dayLabel(d)}
        data-date={d}
        onDragOver={editable ? (ev) => { ev.preventDefault(); setDragOver(d); } : undefined}
        onDragLeave={() => setDragOver((x) => (x === d ? null : x))}
        onDrop={editable ? (ev) => { ev.preventDefault(); drop(d, ev.dataTransfer.getData("text/plain")); } : undefined}
        className={cn("group relative flex min-w-0 flex-col gap-1 border-line p-1.5", tall ? "min-h-[420px]" : "min-h-[118px]", outside && "bg-sunken/50", dragOver === d && "bg-accent-soft/60 ring-2 ring-accent/40 ring-inset")}
      >
        <div className="flex items-center justify-between">
          <span className={cn("flex size-6 items-center justify-center rounded-full text-[12px]", d === today ? "bg-accent font-semibold text-white" : outside ? "text-ink-4" : "text-ink-2")}>{Number(d.slice(8))}</span>
          {editable && <button type="button" onClick={() => setDraft(emptyDraft(d))} className="rounded p-0.5 text-ink-4 opacity-0 group-hover:opacity-100 hover:bg-sunken hover:text-ink focus:opacity-100" aria-label={`Dodaj wpis: ${dayLabel(d)}`}><Plus size={13} /></button>}
        </div>
        {(tall ? list : list.slice(0, 4)).map((e) => <EntryChip key={e.id} e={e} onOpen={() => open(e)} draggable={editable} />)}
        {!tall && list.length > 4 && <Link href={href("week", d)} className="px-1 text-[11px] text-ink-3 hover:text-accent">+{list.length - 4} więcej</Link>}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-line bg-surface p-0.5" role="tablist" aria-label="Widok">
          {([["month", "Miesiąc", SquaresFour], ["week", "Tydzień", Rows], ["list", "Lista", ListBullets], ["plans", "Plany kampanii", CalendarBlank]] as const).map(([v, label, Icon]) => (
            <Link key={v} role="tab" aria-selected={view === v} href={href(v)} className={cn("inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px]", view === v ? "bg-accent-soft font-medium text-accent-ink" : "text-ink-3 hover:text-ink")}><Icon size={14} /> {label}</Link>
          ))}
        </div>
        {view !== "plans" && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" asChild><Link href={href(view, step(-1))} aria-label="Poprzedni okres"><CaretLeft /></Link></Button>
            <Button variant="secondary" size="sm" asChild><Link href={href(view, today)}>Dziś</Link></Button>
            <Button variant="ghost" size="icon-sm" asChild><Link href={href(view, step(1))} aria-label="Następny okres"><CaretRight /></Link></Button>
            <h2 className="ml-2 text-[15px] font-semibold first-letter:uppercase" data-testid="planner-title">{title}</h2>
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <NativeSelect aria-label="Filtr kanału" className="h-8 w-36 text-[12.5px]" value={channel} onChange={(e) => setChannel(e.target.value as ScheduleChannel | "")}>
            <option value="">Wszystkie kanały</option>
            {SCHEDULE_CHANNEL_IDS.map((c) => <option key={c} value={c}>{SCHEDULE_CHANNELS[c].label}</option>)}
          </NativeSelect>
          <NativeSelect aria-label="Filtr statusu" className="h-8 w-40 text-[12.5px]" value={status} onChange={(e) => setStatus(e.target.value as ScheduleStatus | "")}>
            <option value="">Wszystkie statusy</option>
            {SCHEDULE_STATUS_IDS.map((s) => <option key={s} value={s}>{SCHEDULE_STATUSES[s].label}</option>)}
          </NativeSelect>
          <NativeSelect aria-label="Filtr kampanii" className="h-8 w-44 text-[12.5px]" value={campaign} onChange={(e) => setCampaign(e.target.value)}>
            <option value="">Wszystkie kampanie</option>
            <option value="none">Bez kampanii</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
          {editable && <Button size="sm" variant="secondary" onClick={() => setPlanOpen(true)}><CalendarBlank /> Nowy plan</Button>}
          {editable && <Button size="sm" variant="secondary" asChild><Link href={`/publications/new?date=${anchor < today ? today : anchor}`}><Lightning /> Publikacja automatyczna</Link></Button>}
          {editable && <Button size="sm" onClick={() => setDraft(emptyDraft(anchor < today ? today : anchor))}><Plus weight="bold" /> Nowy wpis</Button>}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-[12px] text-ink-3" aria-label="Legenda statusów">
        {SCHEDULE_STATUS_IDS.map((s) => <span key={s} className="inline-flex items-center gap-1.5"><span className={cn("size-2 rounded-full", STATUS_DOT[s])} />{SCHEDULE_STATUSES[s].label}</span>)}
        {editable && view !== "list" && view !== "plans" && <span className="text-ink-4">· Przeciągnij wpis, aby zmienić dzień</span>}
      </div>

      {(view === "month" || view === "week") && days && (
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-7 border-b border-line bg-sunken/60 text-[12px] font-medium text-ink-3">{WEEKDAYS_SHORT.map((d, i) => <div key={d} className="px-2 py-1.5">{d}{view === "week" ? ` ${Number(days[i]!.slice(8))}.${days[i]!.slice(5, 7)}` : ""}</div>)}</div>
          <div role="grid" aria-label="Kalendarz publikacji" className="grid grid-cols-7 divide-x divide-line [&>*:nth-child(n+8)]:border-t">{days.map((d) => dayCell(d, view === "week"))}</div>
        </Card>
      )}

      {view === "list" && (
        visible.length === 0 ? (
          <EmptyState icon={<ListBullets />} title="Brak wpisów w tym okresie" description="Dodaj wpis albo wygeneruj plan na 7, 14 lub 30 dni." />
        ) : (
          <Card className="divide-y divide-line p-0">
            {[...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, list]) => (
              <section key={d} className="px-4 py-3">
                <h3 className={cn("mb-2 text-[13px] font-semibold first-letter:uppercase", d === today && "text-accent-ink")}>{dayLabel(d)}{d === today ? " · dziś" : ""}</h3>
                <ul className="flex flex-col gap-1.5">
                  {list.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 hover:bg-sunken/60" data-testid="planner-row">
                      <span className="tabular w-11 text-[12.5px] font-medium">{e.time}</span>
                      <Badge tone="outline">{SCHEDULE_CHANNELS[e.channel].label}</Badge>
                      <button type="button" className="min-w-0 flex-1 truncate text-left text-[13px] hover:text-accent-ink" onClick={() => open(e)}>{e.title}</button>
                      {e.content && <Link href={itemHref(e.content)} className="inline-flex max-w-56 items-center gap-1 truncate text-[12px] text-ink-3 hover:text-accent"><LinkSimple size={12} /> {ITEM_KIND_LABELS[e.content.kind]}: {e.content.title}</Link>}
                      {e.externalUrl && <a href={e.externalUrl} target="_blank" rel="noreferrer noopener" className="text-[12px] text-success hover:underline">Publikacja ↗</a>}
                      <NativeSelect aria-label={`Status: ${e.title}`} className="h-7 w-40 text-[12px]" value={e.status} disabled={!editable} onChange={(ev) => {
                        const next = ev.target.value as ScheduleStatus;
                        setLocal((cur) => cur.map((x) => (x.id === e.id ? { ...x, status: next } : x)));
                        start(async () => { const r = await setEntryStatus(e.id, next); if (!r.ok) toast.error(r.error); else toast.success(`Status: ${SCHEDULE_STATUSES[next].label}`); router.refresh(); });
                      }}>
                        {SCHEDULE_STATUS_IDS.map((s) => <option key={s} value={s}>{SCHEDULE_STATUSES[s].label}</option>)}
                      </NativeSelect>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </Card>
        )
      )}

      {view === "plans" && (
        plans.length === 0 ? (
          <EmptyState icon={<CalendarBlank />} title="Nie masz jeszcze planów" description="Plan kampanii powstaje razem z kampanią. Możesz też wygenerować plan na 7, 14 lub 30 dni z wybraną częstotliwością i kanałami." action={editable ? <Button onClick={() => setPlanOpen(true)}><CalendarBlank /> Nowy plan</Button> : undefined} />
        ) : (
          <div className="flex flex-col gap-4">
            {plans.map((p) => {
              const list = visible.filter((e) => e.planId === p.id).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
              const done = list.filter((e) => e.status === "published").length;
              const end = addDays(p.startDate, p.days - 1);
              const span = Array.from({ length: p.days }, (_, i) => addDays(p.startDate, i));
              return (
                <Card key={p.id} className="flex flex-col gap-3 p-4" data-testid="planner-plan">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[14px] font-semibold">{p.name}</p>
                      <p className="text-[12.5px] text-ink-3">{dayLabel(p.startDate, false)} – {dayLabel(end, false)} · {p.days} dni · {p.postsPerWeek}× w tygodniu · {p.channels.map((c) => SCHEDULE_CHANNELS[c as ScheduleChannel]?.label ?? c).join(", ")}{p.campaign ? <> · <Link className="hover:text-accent" href={`/campaigns/${p.campaign.id}`}>{p.campaign.name}</Link></> : null}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={done === list.length && list.length ? "success" : "neutral"}>Opublikowane {done}/{list.length}</Badge>
                      <Button size="sm" variant="ghost" asChild><Link href={href("month", p.startDate)}>W kalendarzu</Link></Button>
                      {editable && <Button size="icon-sm" variant="ghost" aria-label={`Usuń plan ${p.name}`} onClick={() => { if (confirm(`Usunąć plan „${p.name}” razem z ${list.length} wpisami? Materiały w bibliotece zostaną.`)) start(async () => { const r = await deletePlan(p.id); if (r.ok) toast.success(r.message ?? "Usunięto"); else toast.error(r.error); router.refresh(); }); }}><Trash /></Button>}
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-success" style={{ width: `${list.length ? (done / list.length) * 100 : 0}%` }} /></div>
                  <div className="overflow-x-auto">
                    <div className="grid min-w-[640px] gap-px rounded-md bg-line" style={{ gridTemplateColumns: `repeat(${Math.min(p.days, 14)}, minmax(0, 1fr))` }}>
                      {span.map((d) => (
                        <div key={d} className={cn("flex min-h-20 flex-col gap-1 bg-surface p-1", d === today && "bg-accent-soft/40")}>
                          <span className="text-[10.5px] text-ink-4">{WEEKDAYS_SHORT[(new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7]} {Number(d.slice(8))}.{d.slice(5, 7)}</span>
                          {list.filter((e) => e.date === d).map((e) => <EntryChip key={e.id} e={e} onOpen={() => open(e)} draggable={false} />)}
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )
      )}

      {draft && <EntryDialog draft={draft} auto={local.find((x) => x.id === draft.id)?.auto ?? []} onClose={() => setDraft(null)} items={items} editable={editable} busy={busy} start={start} onDone={() => { setDraft(null); router.refresh(); }} />}
      {planOpen && <PlanDialog onClose={() => setPlanOpen(false)} today={today} campaigns={campaigns} properties={properties} onDone={(startDate) => { setPlanOpen(false); router.push(href("plans", startDate)); router.refresh(); }} />}
    </div>
  );
}

function EntryDialog({ draft: initial, auto, onClose, items, editable, busy, start, onDone }: { draft: Draft; auto: NonNullable<PlannerEntry["auto"]>; onClose: () => void; items: Props["items"]; editable: boolean; busy: boolean; start: (fn: () => Promise<void>) => void; onDone: () => void }) {
  const [d, setD] = useState(initial);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const item = items.find((i) => i.id === d.contentItemId);
  const save = (patch: Partial<Draft> = {}) => start(async () => {
    const next = { ...d, ...patch };
    const r = next.id ? await updateEntry(next.id, next) : await createEntry(next);
    if (!r.ok) return void toast.error(r.error);
    toast.success(r.message ?? "Zapisano");
    onDone();
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={d.id ? "Wpis w planie" : "Nowy wpis"} description="Publikujesz samodzielnie w serwisie; tutaj planujesz termin i oznaczasz status." wide>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
          <div>
            <Label htmlFor="pe-title">Tytuł</Label>
            <Input id="pe-title" className="mt-1.5" value={d.title} maxLength={200} disabled={!editable} onChange={(e) => set({ title: e.target.value })} placeholder="Np. Karuzela: mieszkanie na Mokotowie" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-1">
              <Label htmlFor="pe-channel">Kanał</Label>
              <NativeSelect id="pe-channel" className="mt-1.5" value={d.channel} disabled={!editable} onChange={(e) => { const c = e.target.value as ScheduleChannel; set({ channel: c, time: d.id ? d.time : SCHEDULE_CHANNELS[c].time }); }}>
                {SCHEDULE_CHANNEL_IDS.map((c) => <option key={c} value={c}>{SCHEDULE_CHANNELS[c].label}</option>)}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="pe-date">Data</Label>
              <Input id="pe-date" type="date" className="mt-1.5" value={d.date} disabled={!editable} onChange={(e) => set({ date: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="pe-time">Godzina</Label>
              <Input id="pe-time" type="time" className="mt-1.5" value={d.time} disabled={!editable} onChange={(e) => set({ time: e.target.value })} />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <Label htmlFor="pe-status">Status</Label>
              <NativeSelect id="pe-status" className="mt-1.5" value={d.status} disabled={!editable || auto.length > 0} onChange={(e) => set({ status: e.target.value as ScheduleStatus })}>
                {SCHEDULE_STATUS_IDS.map((s) => <option key={s} value={s}>{SCHEDULE_STATUSES[s].label}</option>)}
              </NativeSelect>
            </div>
          </div>
          <div>
            <Label htmlFor="pe-item">Materiał z biblioteki</Label>
            <NativeSelect id="pe-item" className="mt-1.5" value={d.contentItemId ?? ""} disabled={!editable} onChange={(e) => set({ contentItemId: e.target.value || null })}>
              <option value="">Bez materiału</option>
              {items.map((i) => <option key={i.id} value={i.id}>{ITEM_KIND_LABELS[i.kind]}: {i.title}</option>)}
            </NativeSelect>
            {item && <Link href={itemHref(item)} className="mt-1 inline-flex items-center gap-1 text-[12px] text-accent-ink hover:underline"><LinkSimple size={12} /> Otwórz materiał</Link>}
          </div>
          {auto.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-md border border-line p-3" data-testid="entry-auto">
              <p className="flex items-center gap-1.5 text-[13px] font-medium"><Lightning weight="fill" /> Automatyczna publikacja</p>
              {auto.map((a) => (
                <div key={a.id} className="flex flex-col gap-1 border-t border-line pt-2 first:border-0 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                    <span className="font-medium">{a.account}</span><span className="text-ink-3">{PLATFORMS[a.platform].short}</span>
                    <Badge tone={a.state === "published" ? "success" : a.state === "failed" ? "danger" : a.state === "action_required" || a.state === "pending_approval" ? "warning" : "accent"}>{a.stateLabel}</Badge>
                    {editable && CANCELABLE_STATES.includes(a.state) && <Button type="button" size="sm" variant="ghost" className="ml-auto text-danger" onClick={() => { if (confirm(`Anulować publikację na ${a.account}?`)) start(async () => { const r = await cancelPublication(a.id); if (!r.ok) return void toast.error(r.error); toast.success("Anulowano publikację"); onDone(); }); }}><X /> Anuluj</Button>}
                  </div>
                  {a.conflict && <p className="flex items-start gap-1 text-[12px] text-danger"><Warning className="mt-0.5 shrink-0" /> {a.conflict}</p>}
                  {a.caption && <p className="line-clamp-4 text-[12px] whitespace-pre-line text-ink-2">{a.caption}</p>}
                </div>
              ))}
              <Link href="/publications" className="text-[12px] text-accent-ink hover:underline">Szczegóły i akceptacja w zakładce Publikacje</Link>
            </div>
          ) : d.id && editable ? (
            <Link href={`/publications/new?date=${d.date}${d.contentItemId ? `&item=${d.contentItemId}` : ""}`} className="inline-flex items-center gap-1 text-[12.5px] text-accent-ink hover:underline"><Lightning /> Zaplanuj automatyczną publikację tego materiału</Link>
          ) : null}
          <div>
            <Label htmlFor="pe-notes">Notatki</Label>
            <Textarea id="pe-notes" className="mt-1.5" rows={3} maxLength={1000} value={d.notes ?? ""} disabled={!editable} onChange={(e) => set({ notes: e.target.value })} />
          </div>
          {(d.status === "published" || d.externalUrl) && (
            <div>
              <Label htmlFor="pe-url">Link do publikacji (opcjonalnie)</Label>
              <Input id="pe-url" className="mt-1.5" type="url" value={d.externalUrl ?? ""} maxLength={500} disabled={!editable} onChange={(e) => set({ externalUrl: e.target.value })} placeholder="https://www.instagram.com/p/…" />
            </div>
          )}
          {editable && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
              {d.id ? (
                <Button type="button" variant="ghost" className="text-danger" onClick={() => { if (confirm("Usunąć wpis z planu?")) start(async () => { const r = await deleteEntry(d.id!); if (!r.ok) return void toast.error(r.error); toast.success("Usunięto wpis"); onDone(); }); }}><Trash /> Usuń</Button>
              ) : <span />}
              <div className="flex gap-2">
                {d.status !== "published" && d.id && !auto.length && <Button type="button" variant="secondary" loading={busy} onClick={() => save({ status: "published" })}><CheckCircle /> Oznacz jako opublikowane</Button>}
                <Button type="submit" loading={busy}>{d.id ? "Zapisz" : "Dodaj wpis"}</Button>
              </div>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PlanDialog({ onClose, today, campaigns, properties, onDone }: { onClose: () => void; today: string; campaigns: Props["campaigns"]; properties: Props["properties"]; onDone: (startDate: string) => void }) {
  const [name, setName] = useState("Plan publikacji");
  const [startDate, setStartDate] = useState(addDays(today, 1));
  const [days, setDays] = useState<PlanLength>(14);
  const [ppw, setPpw] = useState(4);
  const [channels, setChannels] = useState<ScheduleChannel[]>(["instagram", "facebook"]);
  const [source, setSource] = useState<"none" | "campaign" | "property">(campaigns.length ? "campaign" : "none");
  const [sourceId, setSourceId] = useState(campaigns[0]?.id ?? "");
  const [busy, start] = useTransition();
  const total = Math.max(1, Math.round((ppw * days) / 7));
  const toggle = (c: ScheduleChannel) => setChannels((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : cur.length >= 6 ? cur : [...cur, c]));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title="Nowy plan publikacji" description="Rozłożymy wpisy równomiernie i przypiszemy pasujące materiały. Puste terminy oznaczymy jako pomysły do przygotowania." wide>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await createPlan({ name, startDate, days, postsPerWeek: ppw, channels, source, sourceId: source === "none" ? null : sourceId || null }); if (!r.ok) return void toast.error(r.error); toast.success(r.message ?? "Utworzono plan"); onDone(startDate); }); }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label htmlFor="pl-name">Nazwa</Label><Input id="pl-name" className="mt-1.5" value={name} maxLength={160} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label htmlFor="pl-start">Początek</Label><Input id="pl-start" type="date" min={today} className="mt-1.5" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
          </div>
          <div>
            <p className="text-[13px] font-medium">Długość</p>
            <div className="mt-1.5 flex gap-2" role="group" aria-label="Długość planu">{PLAN_LENGTHS.map((l) => <Button key={l} type="button" size="sm" variant={days === l ? "primary" : "secondary"} aria-pressed={days === l} onClick={() => setDays(l)}>{l} dni</Button>)}</div>
          </div>
          <div>
            <Label htmlFor="pl-ppw">Częstotliwość: {ppw} {ppw === 1 ? "wpis" : ppw < 5 ? "wpisy" : "wpisów"} tygodniowo ({total} w planie)</Label>
            <input id="pl-ppw" type="range" min={1} max={14} value={ppw} onChange={(e) => setPpw(Number(e.target.value))} className="mt-2 w-full accent-[var(--color-accent)]" />
          </div>
          <div>
            <p className="text-[13px] font-medium">Kanały</p>
            <div className="mt-1.5 flex flex-wrap gap-2">{SCHEDULE_CHANNEL_IDS.filter((c) => c !== "other").map((c) => <button key={c} type="button" aria-pressed={channels.includes(c)} onClick={() => toggle(c)} className={cn("rounded-full border px-3 py-1 text-[12.5px]", channels.includes(c) ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-ink-3 hover:border-line-strong")}>{SCHEDULE_CHANNELS[c].label}</button>)}</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pl-source">Materiały do przypisania</Label>
              <NativeSelect id="pl-source" className="mt-1.5" value={source} onChange={(e) => { const s = e.target.value as typeof source; setSource(s); setSourceId(s === "campaign" ? (campaigns[0]?.id ?? "") : s === "property" ? (properties[0]?.id ?? "") : ""); }}>
                <option value="none">Bez materiałów (same pomysły)</option>
                <option value="campaign" disabled={!campaigns.length}>Z kampanii</option>
                <option value="property" disabled={!properties.length}>Z nieruchomości</option>
              </NativeSelect>
            </div>
            {source !== "none" && (
              <div>
                <Label htmlFor="pl-source-id">{source === "campaign" ? "Kampania" : "Nieruchomość"}</Label>
                <NativeSelect id="pl-source-id" className="mt-1.5" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                  {(source === "campaign" ? campaigns.map((c) => ({ id: c.id, label: c.name })) : properties.map((p) => ({ id: p.id, label: p.title }))).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </NativeSelect>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>Anuluj</Button>
            <Button type="submit" loading={busy} disabled={!channels.length}>Utwórz plan ({total} wpisów)</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
