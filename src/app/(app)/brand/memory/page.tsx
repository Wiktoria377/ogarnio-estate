import { PageHeader } from "@/components/ui/page-header";
import { BrandNav } from "@/components/brand/brand-nav";
import { BrandMemoryPanel, type DecisionItem, type MemoryItem } from "@/components/brand/brand-memory";
import { can } from "@/core/auth/permissions";
import type { BrandFeedbackEventRow, BrandMemoryRow } from "@/lib/supabase/database.types";
import { loadBrand, requireWorkspace } from "@/lib/session";

export const metadata = { title: "Pamięć marki" };

const KIND_LABEL: Record<BrandFeedbackEventRow["kind"], string> = {
  content_edited: "Poprawka tekstu",
  variant_selected: "Wybór wariantu",
  variant_rejected: "Odrzucony wariant",
  content_accepted: "Tekst oznaczony jako gotowy",
  graphic_template: "Wybór szablonu grafiki",
  graphic_edited: "Edycja grafiki",
  graphic_accepted: "Grafika zaakceptowana",
  material_approved: "Materiał zatwierdzony",
  material_rejected: "Materiał odrzucony",
};

function describe(e: BrandFeedbackEventRow): string {
  const d = (e.data ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  const cta = d.cta as { before?: string; after?: string } | null;
  const h = d.headline as { before?: string; after?: string } | null;
  if (cta?.after) parts.push(`CTA: „${cta.after}”`);
  if (h?.after) parts.push(`nagłówek: „${h.after.slice(0, 80)}”`);
  if (Array.isArray(d.removed) && d.removed.length) parts.push(`usunięte słowa: ${(d.removed as string[]).slice(0, 4).join(", ")}`);
  if (typeof d.templateLabel === "string") parts.push(`szablon: ${d.templateLabel}`);
  if (Array.isArray(d.colors) && d.colors.length) parts.push(`kolory: ${(d.colors as string[]).join(", ")}`);
  if (typeof d.angle === "string" && e.kind !== "content_edited") parts.push(d.angle);
  if (typeof d.headline === "string") parts.push(`„${d.headline.slice(0, 80)}”`);
  return parts.join(" · ");
}

export default async function BrandMemoryPage() {
  const ctx = await requireWorkspace();
  const ws = ctx.workspace.id;
  const [brand, { data: rows }, { data: events }] = await Promise.all([
    loadBrand(ctx),
    ctx.supabase.from("brand_memory").select("*").eq("workspace_id", ws).eq("status", "active").order("updated_at", { ascending: false }).limit(300),
    ctx.supabase.from("brand_feedback_events").select("*").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(30),
  ]);
  const admin = can(ctx.role, "brand.edit");
  const toItem = (m: BrandMemoryRow): MemoryItem => ({
    id: m.id,
    kind: m.kind,
    content: m.content,
    source: m.source,
    evidenceCount: m.evidence_count,
    evidence: (Array.isArray(m.evidence) ? m.evidence : []) as { summary: string; at: string }[],
    at: m.decided_at ?? m.created_at,
    canDelete: admin || (m.level === "explicit" && m.created_by === ctx.userId),
  });
  const all = (rows ?? []) as BrandMemoryRow[];
  const decisions: DecisionItem[] = ((events ?? []) as BrandFeedbackEventRow[]).map((e) => ({ id: e.id, label: KIND_LABEL[e.kind], detail: describe(e), at: e.created_at }));
  return (
    <>
      <PageHeader title="Pamięć marki" description="Co Ogarnio zapamiętało z decyzji Twojego zespołu: preferowane CTA, nagłówki, słowa do unikania, szablony i odrzucone propozycje." />
      <BrandNav />
      <BrandMemoryPanel
        enabled={brand.memory_enabled}
        canManage={admin}
        canEdit={can(ctx.role, "content.edit")}
        explicit={all.filter((m) => m.level === "explicit").map(toItem)}
        suggested={brand.memory_enabled ? all.filter((m) => m.level === "suggested").map(toItem) : []}
        decisions={decisions}
      />
    </>
  );
}
