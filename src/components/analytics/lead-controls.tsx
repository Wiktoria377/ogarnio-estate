"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, NativeSelect, Textarea } from "@/components/ui/field";
import { LEAD_STATUSES, type LeadStatus } from "@/core/analytics/metrics";
import { changeLead } from "@/app/(app)/leads/actions";

export function LeadControls({ id, status, assignedTo, agents, canManage, canAssign }: { id: string; status: LeadStatus; assignedTo: string | null; agents: { id: string; name: string }[]; canManage: boolean; canAssign: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const run = (patch: Parameters<typeof changeLead>[1]) => start(async () => {
    const r = await changeLead(id, patch);
    if (r.ok) toast.success(r.message ?? "Zapisano.");
    else toast.error(r.error);
    if (r.ok && patch.note) setNote("");
    router.refresh();
  });
  if (!canManage) return <Card className="p-5 text-[13px] text-ink-3">Status: {LEAD_STATUSES[status].label}</Card>;
  return (
    <Card className="flex flex-col gap-4 p-5">
      <Field label="Status" htmlFor="lead-status">
        <NativeSelect id="lead-status" value={status} disabled={pending} onChange={(e) => run({ status: e.target.value as LeadStatus })}>
          {(Object.keys(LEAD_STATUSES) as LeadStatus[]).map((s) => <option key={s} value={s}>{LEAD_STATUSES[s].label}</option>)}
        </NativeSelect>
      </Field>
      {canAssign && (
        <Field label="Prowadzi" htmlFor="lead-assign">
          <NativeSelect id="lead-assign" value={assignedTo ?? ""} disabled={pending} onChange={(e) => run({ assignedTo: e.target.value || null })}>
            <option value="">Nieprzypisane</option>
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </NativeSelect>
        </Field>
      )}
      <Field label="Notatka" htmlFor="lead-note">
        <Textarea id="lead-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
      </Field>
      <Button size="sm" variant="secondary" disabled={!note.trim()} loading={pending} onClick={() => run({ note })}>Dodaj notatkę</Button>
    </Card>
  );
}
