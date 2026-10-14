import { DownloadSimple } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { BrandNav } from "@/components/brand/brand-nav";
import { VersionHistory, type VersionItem } from "@/components/brand/version-history";
import { diffSnapshots, type ProfileSnapshot } from "@/core/brand/profile";
import { canAdmin, requireWorkspace } from "@/lib/session";

export const metadata = { title: "Historia profilu marki" };

export default async function BrandHistoryPage() {
  const ctx = await requireWorkspace();
  const ws = ctx.workspace.id;
  const { data: rows } = await ctx.supabase.from("brand_profile_versions").select("id, version, status, source, note, snapshot, created_at, created_by, decided_by, decided_at").eq("workspace_id", ws).order("version", { ascending: false }).limit(100);
  const list = rows ?? [];
  const people = [...new Set(list.flatMap((r) => [r.created_by, r.decided_by]).filter((x): x is string => !!x))];
  const { data: profiles } = people.length ? await ctx.supabase.from("profiles").select("id, full_name").in("id", people) : { data: [] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
  // Changes are shown against the previous approved state (drafts against the version before them).
  const versions: VersionItem[] = list.map((r, i) => {
    const prev = list.slice(i + 1).find((x) => x.status === "approved" || x.status === "superseded");
    return {
      id: r.id,
      version: r.version,
      status: r.status,
      source: r.source,
      note: r.note,
      at: r.decided_at ?? r.created_at,
      author: names.get(r.decided_by ?? r.created_by ?? "") ?? null,
      changes: diffSnapshots((prev?.snapshot ?? null) as Partial<ProfileSnapshot> | null, r.snapshot as Partial<ProfileSnapshot>),
    };
  });
  return (
    <>
      <PageHeader
        title="Historia zmian profilu"
        description="Każda zatwierdzona zmiana profilu marki jest zapisana jako wersja. Możesz przywrócić dowolną wcześniejszą wersję; bieżąca zostanie zachowana."
        actions={
          <Button asChild variant="secondary">
            <a href="/api/brand/export" download>
              <DownloadSimple /> Eksportuj profil (JSON)
            </a>
          </Button>
        }
      />
      <BrandNav />
      <VersionHistory versions={versions} editable={canAdmin(ctx.role)} />
    </>
  );
}
