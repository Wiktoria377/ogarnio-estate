"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { decideStrategy, removeStrategy } from "@/app/(app)/director/actions";

export function StrategyActions({ id, status, canDelete }: { id: string; status: "draft" | "accepted" | "archived"; canDelete: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Zapisano.");
      if (after) after();
      else router.refresh();
    });
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "accepted" && <Button size="sm" loading={pending} onClick={() => run(() => decideStrategy(id, "accepted"))}>Akceptuj strategię</Button>}
      {status !== "archived" && <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => decideStrategy(id, "archived"))}>Archiwizuj</Button>}
      {status === "archived" && <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => decideStrategy(id, "draft"))}>Przywróć</Button>}
      {canDelete && (
        <Button size="sm" variant="danger-ghost" disabled={pending} onClick={() => { if (confirm("Usunąć tę strategię? Tej operacji nie można cofnąć.")) run(() => removeStrategy(id), () => router.push("/director")); }}>
          Usuń
        </Button>
      )}
    </div>
  );
}
