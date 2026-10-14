"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowClockwise, CalendarPlus, Check, PencilSimple, Sparkle, X } from "@phosphor-icons/react/dist/ssr";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { archive, decide, prepareMaterials, regenerate, schedule } from "@/app/(app)/autopilot/actions";
import type { AutopilotItemStatus } from "@/lib/supabase/database.types";

export interface QueueItem {
  id: string;
  position: number;
  kind: string;
  kindLabel: string;
  platform: string;
  pillar: string;
  goal: string;
  property: string | null;
  topic: string;
  rationale: string;
  date: string;
  time: string;
  status: AutopilotItemStatus;
  error: string | null;
  generations: number;
  content: { id: string; kind: string; title: string; href: string; thumb: string | null; preview: string | null; qa: { problems: number; warnings: number; stale: boolean } | null } | null;
}

const STATUS: Record<AutopilotItemStatus, { label: string; tone: BadgeTone }> = {
  proposed: { label: "Do przygotowania", tone: "muted" },
  generating: { label: "W przygotowaniu", tone: "accent" },
  ready: { label: "Do akceptacji", tone: "warning" },
  failed: { label: "Błąd", tone: "danger" },
  accepted: { label: "Zaakceptowane", tone: "success" },
  rejected: { label: "Odrzucone", tone: "outline" },
  scheduled: { label: "W planerze", tone: "success" },
};

export function AutopilotQueue({ runId, items, editable, limitLeft, archived }: { runId: string; items: QueueItem[]; editable: boolean; limitLeft: number; archived: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const generating = items.some((i) => i.status === "generating");
  useEffect(() => {
    if (!generating) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [generating, router]);

  const run = (key: string, f: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    setBusy(key);
    start(async () => {
      const r = await f();
      setBusy(null);
      if (!r.ok) return void toast.error(r.error ?? "Nie udało się.");
      if (r.message) toast.success(r.message);
      router.refresh();
    });
  };
  const toPrepare = items.filter((i) => i.status === "proposed" || i.status === "failed").length;
  const accepted = useMemo(() => items.filter((i) => i.status === "accepted" && i.kind !== "ad_proposal"), [items]);
  const can = editable && !archived;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold text-ink">Kolejka akceptacji</h2>
        {can && (
          <div className="flex flex-wrap gap-2">
            {toPrepare > 0 && (
              <Button size="sm" loading={busy === "prepare"} disabled={pending || limitLeft <= 0} title={limitLeft <= 0 ? "Wykorzystano limit AI tego planu" : undefined} onClick={() => run("prepare", () => prepareMaterials(runId))} data-testid="autopilot-prepare">
                <Sparkle weight="fill" /> Przygotuj materiały ({Math.min(toPrepare, Math.max(0, limitLeft))} z {toPrepare})
              </Button>
            )}
            <Button size="sm" variant="secondary" loading={busy === "schedule-all"} disabled={pending || !accepted.length} onClick={() => run("schedule-all", () => schedule(runId, accepted.map((a) => a.id)))} data-testid="autopilot-schedule-all">
              <CalendarPlus /> Zaplanuj zaakceptowane ({accepted.length})
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run("archive", () => archive(runId))}>Archiwizuj</Button>
          </div>
        )}
      </div>
      {generating && <p className="text-[12.5px] text-ink-3" role="status">Przygotowuję materiały w tle. Lista odświeża się sama.</p>}
      <ul className="flex flex-col gap-2">
        {items.map((i) => (
          <li key={i.id}>
            <Card className="flex flex-col gap-3 p-4 md:flex-row" data-testid="autopilot-item" data-status={i.status} data-kind={i.kind}>
              <div className="w-full shrink-0 md:w-40">
                {i.content?.thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={i.content.thumb} alt={`Podgląd: ${i.content.title}`} className="aspect-square w-full rounded-md border border-line bg-sunken object-contain" loading="lazy" />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-md border border-dashed border-line bg-sunken/60 p-2 text-center text-[12px] text-ink-3">{i.kindLabel}</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-semibold text-ink-3">#{i.position}</span>
                  <span className="text-[13.5px] font-medium text-ink">{i.date} {i.time} · {i.platform} · {i.kindLabel}</span>
                  <Badge tone={STATUS[i.status].tone} data-testid="autopilot-status">{STATUS[i.status].label}</Badge>
                  {i.content?.qa && (
                    <Badge tone={i.content.qa.problems ? "danger" : i.content.qa.warnings ? "warning" : "success"} data-testid="autopilot-qa" title="Kontrola jakości (reguły i pomiary)">
                      {i.content.qa.problems ? `QA: ${i.content.qa.problems} problemy` : i.content.qa.warnings ? `QA: ${i.content.qa.warnings} uwagi` : "QA bez zastrzeżeń"}{i.content.qa.stale ? " (starsza wersja)" : ""}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-[12.5px] text-ink-3">{i.pillar}{i.property ? ` · ${i.property}` : ""}{i.topic ? ` · Temat: ${i.topic}` : ""}</p>
                <p className="mt-1 text-[12.5px] text-ink-2" data-testid="autopilot-rationale-item"><span className="font-medium">Dlaczego: </span>{i.rationale}</p>
                {i.content?.preview && <p className="mt-2 line-clamp-4 whitespace-pre-line rounded-md bg-sunken/60 px-3 py-2 text-[12.5px] text-ink-2" data-testid="autopilot-preview">{i.content.preview}</p>}
                {i.error && <p className="mt-2 text-[12.5px] text-danger" role="alert">{i.error}</p>}
                {can && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(i.status === "ready" || (i.status === "rejected" && i.content)) && (
                      <Button size="sm" loading={busy === `a${i.id}`} disabled={pending} onClick={() => run(`a${i.id}`, () => decide(runId, i.id, "accept"))}><Check /> Akceptuj</Button>
                    )}
                    {["proposed", "ready", "failed", "accepted"].includes(i.status) && (
                      <Button size="sm" variant="secondary" loading={busy === `r${i.id}`} disabled={pending} onClick={() => run(`r${i.id}`, () => decide(runId, i.id, "reject"))}><X /> Odrzuć</Button>
                    )}
                    {i.status === "rejected" && !i.content && (
                      <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(`p${i.id}`, () => decide(runId, i.id, "restore"))}>Przywróć</Button>
                    )}
                    {i.content && i.status !== "generating" && (
                      <Button size="sm" variant="secondary" asChild><Link href={i.content.href}><PencilSimple /> Edytuj</Link></Button>
                    )}
                    {i.content && ["ready", "failed", "rejected", "accepted"].includes(i.status) && (
                      <Button size="sm" variant="ghost" loading={busy === `g${i.id}`} disabled={pending || limitLeft <= 0 || i.generations >= 5} title={limitLeft <= 0 ? "Wykorzystano limit AI tego planu" : "Zużywa 1 generowanie AI"} onClick={() => run(`g${i.id}`, () => regenerate(runId, i.id))}><ArrowClockwise /> Generuj ponownie</Button>
                    )}
                    {i.status === "accepted" && i.kind !== "ad_proposal" && (
                      <Button size="sm" variant="soft" loading={busy === `s${i.id}`} disabled={pending} onClick={() => run(`s${i.id}`, () => schedule(runId, [i.id]))}><CalendarPlus /> Zaplanuj</Button>
                    )}
                    {i.kind === "ad_proposal" && i.status === "accepted" && <span className="self-center text-[12px] text-ink-3">Reklamy nie są uruchamiane przez system. Użyj tekstu w Menedżerze reklam.</span>}
                  </div>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
