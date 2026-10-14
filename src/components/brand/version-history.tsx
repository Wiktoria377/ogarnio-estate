"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { ArrowCounterClockwise } from "@phosphor-icons/react/dist/ssr";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { restoreBrandVersion } from "@/app/(app)/brand/intelligence/actions";

export interface VersionItem {
  id: string;
  version: number;
  status: "draft" | "approved" | "superseded" | "discarded";
  source: "initial" | "manual" | "analysis" | "restore";
  note: string | null;
  at: string;
  author: string | null;
  changes: string[];
}

const STATUS: Record<VersionItem["status"], { label: string; tone: BadgeTone }> = {
  approved: { label: "Obowiązująca", tone: "success" },
  draft: { label: "Propozycja", tone: "warning" },
  superseded: { label: "Archiwalna", tone: "muted" },
  discarded: { label: "Odrzucona", tone: "muted" },
};
const SOURCE = { initial: "Profil początkowy", manual: "Edycja ręczna", analysis: "Analiza strony", restore: "Przywrócenie" } as const;

export function VersionHistory({ versions, editable }: { versions: VersionItem[]; editable: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const restore = (v: number) =>
    start(async () => {
      if (!confirm(`Przywrócić ustawienia z wersji ${v}? Obecny profil zostanie zachowany w historii.`)) return;
      const r = await restoreBrandVersion(v);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      router.refresh();
    });
  return (
    <ol className="flex flex-col divide-y divide-line rounded-lg border border-line bg-surface" data-testid="versions">
      {versions.map((v) => (
        <li key={v.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4" data-testid={`version-${v.version}`}>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-semibold">Wersja {v.version}</span>
              <Badge tone={STATUS[v.status].tone}>{STATUS[v.status].label}</Badge>
              <span className="text-[12.5px] text-ink-3">{SOURCE[v.source]}</span>
            </div>
            <div className="mt-0.5 text-[12.5px] text-ink-3">
              {new Date(v.at).toLocaleString("pl-PL")}
              {v.author ? ` · ${v.author}` : ""}
              {v.note ? ` · ${v.note}` : ""}
            </div>
            {v.changes.length > 0 && <div className="mt-1 text-[12.5px] text-ink-2">Zmienione: {v.changes.join(", ")}</div>}
          </div>
          <div className="flex items-center gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link href={`/brand/versions/${v.id}`}>{v.status === "draft" ? "Przejrzyj" : "Podgląd"}</Link>
            </Button>
            {editable && (v.status === "superseded" || (v.status === "discarded" && v.source === "analysis")) && (
              <Button size="sm" variant="secondary" onClick={() => restore(v.version)} loading={pending}>
                <ArrowCounterClockwise /> Przywróć
              </Button>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
