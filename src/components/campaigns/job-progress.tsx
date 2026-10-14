"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowClockwise, CheckCircle, Clock, Prohibit, WarningCircle, X } from "@phosphor-icons/react/dist/ssr";
import { Button, Spinner } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface JobItem {
  id: string;
  kind: string;
  deliverable: string | null;
  label: string;
  status: "queued" | "running" | "succeeded" | "failed" | "canceled";
  attempts: number;
  max_attempts: number;
  manual_retries: number;
  progress: number;
  error_message: string | null;
  content_item_id: string | null;
  created_at: string;
  finished_at: string | null;
}

const ACTIVE = new Set(["queued", "running"]);

/**
 * Polls job statuses while anything is pending; refreshes the server view when
 * a job finishes so previews of new materials appear without a reload.
 */
export function useJobs(scope: { campaign?: string; item?: string }, initial: JobItem[]) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initial);
  const prev = useRef(new Map(initial.map((j) => [j.id, j.status])));
  const query = scope.campaign ? `campaign=${scope.campaign}` : `item=${scope.item}`;

  const load = useCallback(async () => {
    const res = await fetch(`/api/jobs?${query}`, { cache: "no-store" });
    if (!res.ok) return;
    const { jobs: next } = (await res.json()) as { jobs: JobItem[] };
    let finished = false;
    for (const j of next) {
      const before = prev.current.get(j.id);
      // Any change into a final state counts, including failed → succeeded when a retried
      // job finishes before the first poll ever sees it queued.
      if (before !== j.status && !ACTIVE.has(j.status)) finished = true;
    }
    prev.current = new Map(next.map((j) => [j.id, j.status]));
    setJobs(next);
    if (finished) router.refresh();
  }, [query, router]);

  const active = jobs.some((j) => ACTIVE.has(j.status));
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [active, load]);

  useEffect(() => setJobs((cur) => (initial.length > cur.length ? initial : cur)), [initial]);

  async function act(id: string, action: "retry" | "cancel") {
    const res = await fetch(`/api/jobs/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) toast.error(json.error ?? "Operacja nie powiodła się.");
    else toast.success(action === "retry" ? "Ponawiam generowanie" : "Anulowano");
    await load();
  }

  return { jobs, active, reload: load, retry: (id: string) => act(id, "retry"), cancel: (id: string) => act(id, "cancel") };
}

export function JobStatusBadge({ job }: { job: Pick<JobItem, "status" | "progress" | "attempts"> }) {
  const map = {
    queued: { icon: <Clock size={13} />, label: "W kolejce", cls: "bg-sunken text-ink-3" },
    running: { icon: <Spinner className="size-3" />, label: `W trakcie${job.progress ? ` · ${job.progress}%` : ""}`, cls: "bg-accent-soft text-accent-ink" },
    succeeded: { icon: <CheckCircle size={13} weight="fill" />, label: "Gotowe", cls: "bg-success-soft text-success" },
    failed: { icon: <WarningCircle size={13} weight="fill" />, label: "Błąd", cls: "bg-danger-soft text-danger" },
    canceled: { icon: <Prohibit size={13} />, label: "Anulowane", cls: "bg-sunken text-ink-3" },
  }[job.status];
  return <span className={cn("inline-flex h-5.5 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium whitespace-nowrap", map.cls)}>{map.icon}{map.label}</span>;
}

/** Error message + retry/cancel controls for one job. */
export function JobControls({ job, onRetry, onCancel, editable }: { job: JobItem; onRetry: () => void; onCancel: () => void; editable: boolean }) {
  if (job.status === "failed" || job.status === "canceled") {
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-md border border-danger/15 bg-danger-soft/60 px-3 py-2 text-[12.5px] leading-snug text-danger">
        <span>{job.error_message ?? "Generowanie nie powiodło się."}</span>
        {editable && (job.manual_retries < 5 ? <Button size="sm" variant="secondary" className="self-start" onClick={onRetry}><ArrowClockwise /> Spróbuj ponownie</Button> : <span className="text-ink-3">Wykorzystano limit ponowień.</span>)}
      </div>
    );
  }
  if (job.status === "queued" && editable) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-ink-3">
        {job.error_message ? <span className="text-warning">{job.error_message}</span> : <span>Czeka w kolejce</span>}
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 rounded px-1 text-ink-3 hover:bg-sunken hover:text-ink"><X size={12} /> Anuluj</button>
      </div>
    );
  }
  if (job.status === "running") {
    return (
      <div className="h-1.5 overflow-hidden rounded-full bg-sunken" aria-label={`Postęp ${job.progress}%`}>
        <div className="h-full rounded-full bg-accent transition-[width] duration-700" style={{ width: `${Math.max(6, job.progress)}%` }} />
      </div>
    );
  }
  return null;
}
