"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowClockwise, Archive, Brain, CalendarBlank, CheckCircle, DotsThree, FilePdf, FilmSlate, ImageSquare, Note, PencilSimple, Sparkle, Trash, WarningCircle, Clock,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/field";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { deleteCampaign, regenerateDeliverable, renameCampaign, setCampaignStatus } from "@/app/(app)/campaigns/actions";
import type { StoredBrief } from "@/core/marketing-engine/director";
import type { QaCheck } from "@/lib/campaign-qa";
import { itemHref } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { JobControls, JobStatusBadge, useJobs, type JobItem } from "./job-progress";

export interface AssetView {
  deliverable: string;
  label: string;
  kind: "text" | "graphic" | "video" | "document" | "schedule";
  item: { id: string; kind: string; title: string; status: string; version: number; updatedAt: string } | null;
  excerpt: string | null;
  score: number | null;
}

const KIND_ICON = { text: Note, graphic: ImageSquare, video: FilmSlate, document: FilePdf, schedule: CalendarBlank } as const;

function Preview({ asset, campaignId }: { asset: AssetView; campaignId: string }) {
  const Icon = KIND_ICON[asset.kind];
  if (asset.kind === "schedule")
    return (
      <Link href={`/planner?campaign=${campaignId}&view=list`} className="flex aspect-[4/3] flex-col items-center justify-center gap-2 bg-sunken/60 text-[13px] text-ink-3 hover:text-accent-ink">
        <CalendarBlank size={28} /> Otwórz plan publikacji
      </Link>
    );
  if (!asset.item) return <div className="flex aspect-[4/3] items-center justify-center bg-sunken/60 text-ink-4"><Icon size={28} /></div>;
  if (asset.item.kind === "graphic")
    return <img src={`/api/graphics/${asset.item.id}/export?thumb=1&v=${encodeURIComponent(asset.item.updatedAt)}`} alt={`Podgląd: ${asset.label}`} className="aspect-[4/3] w-full bg-sunken object-contain p-3" loading="lazy" />;
  if (asset.item.kind === "video")
    return <img src={`/api/video/${asset.item.id}/poster?v=${encodeURIComponent(asset.item.updatedAt)}`} alt={`Kadr: ${asset.label}`} className="aspect-[4/3] w-full bg-ink object-contain" loading="lazy" />;
  if (asset.item.kind === "document")
    return <img src={`/api/brochures/${asset.item.id}/thumb?v=${encodeURIComponent(asset.item.updatedAt)}`} alt={`Podgląd: ${asset.label}`} className="aspect-[4/3] w-full bg-sunken object-contain p-3" loading="lazy" />;
  return <div className="aspect-[4/3] overflow-hidden bg-sunken/50 p-4"><p className="line-clamp-[8] text-[12.5px] leading-relaxed whitespace-pre-line text-ink-2">{asset.excerpt ?? "Brak treści"}</p></div>;
}

export function CampaignWorkspace({ campaign, brief, assets, jobs: initialJobs, qa, editable }: {
  campaign: { id: string; name: string; status: string; goal: string; style: string; audience: string; platforms: string[]; cover: string | null };
  brief: StoredBrief | null;
  assets: AssetView[];
  jobs: JobItem[];
  qa: QaCheck[];
  editable: boolean;
}) {
  const router = useRouter();
  const fresh = useSearchParams().get("new") === "1";
  const { jobs, retry, cancel, reload } = useJobs({ campaign: campaign.id }, initialJobs);
  const [pending, start] = useTransition();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(campaign.name);

  const latest = (deliverable: string | null, kind?: string) => [...jobs].reverse().find((j) => (kind ? j.kind === kind : j.deliverable === deliverable && j.kind === "campaign_asset"));
  const briefJob = latest(null, "campaign_brief");
  const tracked = [briefJob, ...assets.map((a) => latest(a.deliverable))].filter((j): j is JobItem => !!j);
  const done = tracked.filter((j) => j.status === "succeeded").length;
  const failed = tracked.filter((j) => j.status === "failed").length;
  const running = tracked.find((j) => j.status === "running");
  const pct = tracked.length ? Math.round(tracked.reduce((s, j) => s + (j.status === "succeeded" ? 100 : j.status === "running" ? j.progress : 0), 0) / tracked.length) : 0;

  function regenerate(deliverable: string) {
    start(async () => {
      const r = await regenerateDeliverable(campaign.id, deliverable);
      if (r.ok) {
        toast.success(r.message ?? "Dodano do kolejki");
        await reload();
        router.refresh();
      } else toast.error(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-3 p-5" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {campaign.cover && <img src={campaign.cover} alt="" className="size-11 rounded-md object-cover" />}
            <div>
              <div className="text-[14.5px] font-semibold text-ink">{done === tracked.length && tracked.length ? "Kampania gotowa" : running ? `Generuję: ${running.label}` : failed ? "Część materiałów wymaga ponowienia" : "Materiały w kolejce"}</div>
              <div className="text-[12.5px] text-ink-3">{done} z {tracked.length} zadań gotowe{failed ? ` · ${failed} z błędem` : ""} · {campaign.style} · {campaign.platforms.join(", ")}</div>
            </div>
          </div>
          {editable && (
            <Menu>
              <MenuTrigger asChild><Button variant="secondary" size="sm" aria-label="Opcje kampanii"><DotsThree size={18} /> Opcje</Button></MenuTrigger>
              <MenuContent align="end">
                <MenuItem onSelect={() => setRenameOpen(true)}><PencilSimple /> Zmień nazwę</MenuItem>
                <MenuItem onSelect={() => regenerate("brief")}><Brain /> Nowy brief</MenuItem>
                <MenuItem onSelect={() => start(async () => { const r = await setCampaignStatus(campaign.id, campaign.status === "archived" ? "active" : "archived"); if (r.ok) { toast.success(r.message ?? ""); router.refresh(); } else toast.error(r.error); })}><Archive /> {campaign.status === "archived" ? "Przywróć z archiwum" : "Przenieś do archiwum"}</MenuItem>
                <MenuSeparator />
                <MenuItem className="text-danger" onSelect={() => setDeleteOpen(true)}><Trash /> Usuń kampanię</MenuItem>
              </MenuContent>
            </Menu>
          )}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Postęp kampanii">
          <div className={cn("h-full rounded-full transition-[width] duration-700", failed ? "bg-warning" : "bg-accent")} style={{ width: `${Math.max(3, pct)}%` }} />
        </div>
        {fresh && pct < 100 && <p className="text-[12.5px] text-ink-3">Możesz zamknąć tę stronę: materiały powstają na serwerze i zapiszą się w bibliotece.</p>}
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <ul className="grid content-start gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {assets.map((a) => {
            const job = latest(a.deliverable);
            const Icon = KIND_ICON[a.kind];
            return (
              <li key={a.deliverable}>
                <Card className="flex h-full flex-col overflow-hidden p-0" data-testid={`asset-${a.deliverable}`}>
                  <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5">
                    <span className="flex min-w-0 items-center gap-2 text-[13.5px] font-medium text-ink"><Icon size={16} className="shrink-0 text-ink-3" /><span className="truncate">{a.label}</span></span>
                    {job && <JobStatusBadge job={job} />}
                  </div>
                  <div className="border-b border-line"><Preview asset={a} campaignId={campaign.id} /></div>
                  <div className="flex flex-1 flex-col gap-2.5 p-3.5">
                    {job && <JobControls job={job} editable={editable} onRetry={() => void retry(job.id)} onCancel={() => void cancel(job.id)} />}
                    {a.item && (
                      <div className="mt-auto flex flex-wrap items-center gap-2">
                        <Button asChild size="sm" variant="soft"><Link href={itemHref(a.item)}><PencilSimple /> Otwórz i edytuj</Link></Button>
                        {editable && a.kind !== "schedule" && job?.status !== "running" && job?.status !== "queued" && (
                          <Button size="sm" variant="ghost" onClick={() => regenerate(a.deliverable)} disabled={pending}><ArrowClockwise /> Nowa wersja</Button>
                        )}
                        <span className="ml-auto text-[11.5px] text-ink-4">v{a.item.version}{a.score != null ? ` · jakość ${a.score}` : ""}</span>
                      </div>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>

        <aside className="flex flex-col gap-6">
          <Card className="p-0">
            <CardHeader title={<span className="flex items-center gap-2"><Brain size={17} className="text-accent" /> Brief: AI Marketing Director</span>} description={brief ? `Wersja instrukcji ${brief.version}` : "Decyzje strategiczne przed generowaniem"} />
            <div className="flex flex-col gap-4 p-5 text-[13px] leading-relaxed">
              {briefJob && briefJob.status !== "succeeded" && <JobControls job={briefJob} editable={editable} onRetry={() => void retry(briefJob.id)} onCancel={() => void cancel(briefJob.id)} />}
              {brief ? (
                <>
                  <div><div className="text-[11.5px] font-medium tracking-wide text-ink-4 uppercase">Myśl przewodnia</div><p className="mt-0.5 font-medium text-ink">{brief.big_idea}</p></div>
                  <div><div className="text-[11.5px] font-medium tracking-wide text-ink-4 uppercase">Główny przekaz</div><p className="mt-0.5 text-ink-2">{brief.key_message}</p></div>
                  <div>
                    <div className="text-[11.5px] font-medium tracking-wide text-ink-4 uppercase">Argumenty z danych</div>
                    <ul className="mt-1 flex flex-col gap-1.5">{brief.selling_points.map((p, i) => <li key={i} className="text-ink-2"><span className="text-ink">{p.point}</span><span className="block text-[12px] text-ink-4">Dowód: {p.evidence}</span></li>)}</ul>
                  </div>
                  <dl className="grid grid-cols-[70px_1fr] gap-x-2 gap-y-1"><dt className="text-ink-4">CTA</dt><dd className="text-ink-2">{brief.cta}</dd><dt className="text-ink-4">Ton</dt><dd className="text-ink-2">{brief.tone}</dd><dt className="text-ink-4">Odbiorca</dt><dd className="text-ink-2">{campaign.audience}</dd></dl>
                  {brief.gaps.length > 0 && <div className="rounded-md bg-sunken px-3 py-2 text-[12.5px] text-ink-3">Braki w danych: {brief.gaps.join("; ")}</div>}
                  <details className="text-[12.5px]">
                    <summary className="cursor-pointer text-ink-3 hover:text-ink">Kompetencje użyte przez dyrektora ({brief.skills.length})</summary>
                    <ul className="mt-2 flex flex-col gap-1">{brief.skills.map((s) => <li key={s.id} className="flex items-center gap-1.5 text-ink-2"><Sparkle size={12} className="text-accent" />{s.name} <span className="text-ink-4">v{s.version}</span></li>)}</ul>
                  </details>
                </>
              ) : (
                <p className="flex items-center gap-2 text-ink-3"><Clock size={15} /> Brief powstaje jako pierwszy. Wszystkie materiały korzystają z tych samych decyzji.</p>
              )}
            </div>
          </Card>

          <Card className="p-0">
            <CardHeader title="Kontrola jakości kampanii" description="Fakty, cel, branding i spójność materiałów" />
            <ul className="flex flex-col divide-y divide-line">
              {qa.length === 0 && <li className="px-5 py-4 text-[13px] text-ink-3">Kontrola pojawi się po wygenerowaniu materiałów.</li>}
              {qa.map((c) => (
                <li key={c.label} className="flex gap-3 px-5 py-3 text-[13px]">
                  {c.status === "ok" ? <CheckCircle size={17} weight="fill" className="mt-px shrink-0 text-success" /> : c.status === "pending" ? <Clock size={17} className="mt-px shrink-0 text-ink-4" /> : <WarningCircle size={17} weight="fill" className={cn("mt-px shrink-0", c.status === "fail" ? "text-danger" : "text-warning")} />}
                  <div><div className="font-medium text-ink">{c.label}</div><div className="text-[12.5px] leading-snug text-ink-3">{c.detail}</div></div>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent title="Nazwa kampanii">
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} aria-label="Nazwa kampanii" />
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">Anuluj</Button></DialogClose>
            <Button loading={pending} onClick={() => start(async () => { const r = await renameCampaign(campaign.id, name); if (r.ok) { setRenameOpen(false); router.refresh(); } else toast.error(r.error); })}>Zapisz</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent title="Usunąć kampanię?" description="Usunięta zostanie kampania, jej brief, plan publikacji i historia zadań. Wygenerowane materiały zostaną w bibliotece.">
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild><Button variant="ghost">Anuluj</Button></DialogClose>
            <Button variant="danger" loading={pending} onClick={() => start(async () => { const r = await deleteCampaign(campaign.id); if (r && !r.ok) toast.error(r.error); })}>Usuń kampanię</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
