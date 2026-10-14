"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, Info } from "@phosphor-icons/react/dist/ssr";
import { decide } from "@/app/(app)/recommendations/actions";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RECO_CODES, type Recommendation, type RecoPriority } from "@/core/recommendations/engine";

const PRIORITY: Record<RecoPriority, { label: string; tone: BadgeTone }> = {
  high: { label: "Ważne", tone: "danger" },
  medium: { label: "Warto", tone: "warning" },
  low: { label: "Do rozważenia", tone: "muted" },
};

function useDecide() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (key: string, action: "dismissed" | "done" | "restore") =>
    start(async () => {
      const r = await decide(key, action);
      if (!r.ok) return void toast.error(r.error);
      if (r.message) toast.success(r.message);
      router.refresh();
    });
  return { pending, run };
}

export function RecommendationCard({ r, editable, compact = false }: { r: Recommendation; editable: boolean; compact?: boolean }) {
  const { pending, run } = useDecide();
  return (
    <Card className="flex flex-col gap-3 p-5" data-testid="reco" data-code={r.code} data-key={r.key}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={PRIORITY[r.priority].tone}>{PRIORITY[r.priority].label}</Badge>
        <span className="text-[12px] font-medium text-ink-3">{RECO_CODES[r.code]}</span>
      </div>
      <h3 className="text-[15px] font-semibold text-ink" data-testid="reco-title">{r.title}</h3>
      <div className="text-[13px] text-ink-2">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Na jakiej podstawie</p>
        <p className="mt-0.5" data-testid="reco-why">{r.why}</p>
      </div>
      {!compact && (
        <div className="text-[13px]">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Użyte dane</p>
          <dl className="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2" data-testid="reco-data">
            {r.data.map((d) => {
              const long = d.value.length > 32;
              return (
                <div key={d.label} className={long ? "flex flex-col gap-0.5 border-b border-line/70 py-1 sm:col-span-2" : "flex justify-between gap-3 border-b border-line/70 py-1"}>
                  <dt className="text-ink-3">{d.label}</dt>
                  <dd className={long ? "font-medium text-ink" : "text-right font-medium text-ink"}>{d.value}</dd>
                </div>
              );
            })}
          </dl>
        </div>
      )}
      <div className="text-[13px] text-ink-2">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-3">Co warto mierzyć</p>
        <p className="mt-0.5" data-testid="reco-measure">{r.measure}</p>
      </div>
      {r.caveat && !compact && (
        <p className="flex items-start gap-1.5 rounded-md bg-sunken/70 px-3 py-2 text-[12.5px] text-ink-3" data-testid="reco-caveat"><Info className="mt-0.5 shrink-0" /> {r.caveat}</p>
      )}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {r.actions.map((a, i) => (
          <Button key={a.href} size="sm" variant={i === 0 ? "primary" : "secondary"} asChild>
            <Link href={a.href}>{a.label} {i === 0 && <ArrowRight />}</Link>
          </Button>
        ))}
        {editable && !compact && (
          <span className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(r.key, "done")}><Check /> Zrobione</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(r.key, "dismissed")}>Nie teraz</Button>
          </span>
        )}
      </div>
    </Card>
  );
}

export function RestoreButton({ recoKey }: { recoKey: string }) {
  const { pending, run } = useDecide();
  return <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(recoKey, "restore")}>Pokaż ponownie</Button>;
}
