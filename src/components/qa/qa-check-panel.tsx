"use client";

import { useState } from "react";
import { CheckCircle, Info, ShieldCheck, Warning, XCircle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { QA_NOTE, type QaCheck, type QaReport } from "@/core/qa/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const METHOD = { rule: "reguła", measurement: "pomiar", estimate: "szacunek" } as const;

function Icon({ s }: { s: QaCheck["severity"] }) {
  if (s === "ok") return <CheckCircle size={16} weight="fill" className="shrink-0 text-success" />;
  if (s === "info") return <Info size={16} weight="fill" className="shrink-0 text-ink-3" />;
  if (s === "warning") return <Warning size={16} weight="fill" className="shrink-0 text-warning" />;
  return <XCircle size={16} weight="fill" className="shrink-0 text-danger" />;
}

/**
 * Quality assurance for one material: runs the deterministic checks on the
 * current version (server side) and lists problems with proposed fixes.
 */
export function QaCheckPanel({ itemId, initial, stale, dirty }: { itemId: string; initial: QaReport | null; stale: boolean; dirty?: boolean }) {
  const [report, setReport] = useState<QaReport | null>(initial);
  const [isStale, setStale] = useState(stale);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/qa/${itemId}`, { method: "POST" });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Nie udało się sprawdzić materiału.");
      setReport(j as QaReport);
      setStale(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się sprawdzić materiału.");
    } finally {
      setBusy(false);
    }
  };
  const areas = report ? [...new Set(report.checks.map((c) => c.area))] : [];
  return (
    <div className="flex flex-col gap-3" data-testid="qa-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-ink"><ShieldCheck size={16} className="text-accent" /> Kontrola jakości</p>
        <Button size="sm" variant="secondary" loading={busy} disabled={dirty} title={dirty ? "Najpierw zapisz zmiany" : undefined} onClick={run} data-testid="qa-run">
          {report ? "Sprawdź ponownie" : "Sprawdź jakość"}
        </Button>
      </div>
      {!report && <p className="text-[12.5px] text-ink-3">Sprawdza bieżącą wersję zapisanego materiału. Bez kosztu AI.</p>}
      {report && (
        <>
          <p className="text-[12.5px] text-ink-2" data-testid="qa-summary">
            {report.summary.problems ? <span className="font-medium text-danger">Problemy: {report.summary.problems}. </span> : null}
            {report.summary.warnings ? <span className="font-medium text-warning">Uwagi: {report.summary.warnings}. </span> : null}
            {report.summary.infos ? <span>Wskazówki: {report.summary.infos}. </span> : null}
            <span className="text-ink-3">Bez zastrzeżeń: {report.summary.passed}.</span>
            {isStale && <span className="block text-warning">Raport dotyczy wcześniejszej wersji. Sprawdź ponownie.</span>}
          </p>
          <div className="flex flex-col gap-3">
            {areas.map((a) => (
              <div key={a}>
                <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">{a}</p>
                <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
                  {report.checks.filter((c) => c.area === a).map((c, i) => (
                    <li key={`${c.code}-${i}`} className="flex gap-2 px-3 py-2 text-[12.5px] leading-snug" data-testid="qa-check" data-severity={c.severity} data-code={c.code}>
                      <Icon s={c.severity} />
                      <div className="min-w-0">
                        <p className={cn(c.severity === "ok" ? "text-ink-2" : "text-ink")}>
                          {c.where && <span className="font-medium">{c.where}: </span>}{c.message}
                        </p>
                        {c.measured && <p className="text-ink-3">{c.measured} · {METHOD[c.method]}</p>}
                        {!c.measured && c.severity !== "ok" && <p className="text-ink-3">{METHOD[c.method]}</p>}
                        {c.fix && c.severity !== "ok" && <p className="mt-0.5 text-accent-ink">Propozycja: {c.fix}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="text-[11.5px] text-ink-3">{QA_NOTE}</p>
        </>
      )}
    </div>
  );
}
