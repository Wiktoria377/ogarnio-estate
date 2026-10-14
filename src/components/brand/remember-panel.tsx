"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Brain, Check, X } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { MEMORY_KINDS, type Candidate } from "@/core/brand-memory/learn";
import { rememberPreference } from "@/app/(app)/brand/memory/actions";

/**
 * Offered after a manual edit: the person decides which change is a lasting
 * preference. Nothing is remembered without a click.
 */
export function RememberPanel({ candidates, onClose }: { candidates: Candidate[]; onClose: () => void }) {
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  if (!candidates.length) return null;
  const save = (i: number) =>
    start(async () => {
      const c = candidates[i]!;
      const r = await rememberPreference({ kind: c.kind, content: c.content, detail: c.detail, source: "decision" });
      if (!r.ok) return void toast.error(r.error);
      setSaved((s) => new Set(s).add(i));
      toast.success(r.message);
    });
  return (
    <div className="rounded-lg border border-accent/25 bg-accent-soft/40 p-4" data-testid="remember-panel">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[13.5px] font-semibold text-accent-ink"><Brain size={16} /> Zapamiętać tę zmianę na przyszłość?</div>
          <p className="mt-0.5 text-[12.5px] text-ink-3">Pojedyncza poprawka nie zmienia ustawień marki. Zapisz tylko to, co ma obowiązywać w kolejnych materiałach.</p>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Zamknij" onClick={onClose}><X /></Button>
      </div>
      <ul className="flex flex-col gap-2">
        {candidates.map((c, i) => (
          <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-surface px-3 py-2 text-[13px]" data-testid="remember-candidate">
            <div className="min-w-0">
              <span className="font-medium text-ink-2">{MEMORY_KINDS[c.kind].label}: </span>
              <span>{c.content}</span>
              <div className="text-[12px] text-ink-3">{c.reason}</div>
            </div>
            {saved.has(i) ? (
              <span className="flex items-center gap-1 text-[12.5px] text-success"><Check size={14} /> Zapamiętano</span>
            ) : (
              <Button size="sm" variant="soft" onClick={() => save(i)} disabled={pending}>Zapamiętaj</Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
