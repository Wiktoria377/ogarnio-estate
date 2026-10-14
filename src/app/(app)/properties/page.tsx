import Link from "next/link";
import { House, Image as ImageIcon, MagnifyingGlass, Plus, UploadSimple } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty";
import { Input, NativeSelect } from "@/components/ui/field";
import { canEdit, requireWorkspace } from "@/lib/session";
import { can } from "@/core/auth/permissions";
import { PROPERTY_STATUSES, PROPERTY_TYPES, TRANSACTIONS } from "@/verticals/real-estate/labels";
import { floorLabel } from "@/verticals/real-estate/property";
import { formatArea, formatPrice } from "@/lib/utils";

export const metadata = { title: "Nieruchomości" };

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; tx?: string }> }) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  let query = ctx.supabase.from("properties").select("*").eq("workspace_id", ctx.workspace.id).order("updated_at", { ascending: false }).limit(200);
  if (sp.status && sp.status in PROPERTY_STATUSES) query = query.eq("status", sp.status as never);
  if (sp.tx === "sale" || sp.tx === "rent") query = query.eq("transaction_type", sp.tx);
  const q = (sp.q ?? "").trim().slice(0, 80);
  if (q) {
    const safe = q.replace(/[%,()_\\]/g, " ");
    query = query.or(`title.ilike.%${safe}%,city.ilike.%${safe}%,district.ilike.%${safe}%`);
  }
  const { data: properties } = await query;
  const ids = (properties ?? []).map((p) => p.id);
  const { data: photos } = ids.length
    ? await ctx.supabase.from("property_photos").select("property_id, storage_path, position").in("property_id", ids).order("position")
    : { data: [] };
  const cover = new Map<string, string>();
  const count = new Map<string, number>();
  for (const ph of photos ?? []) {
    if (!cover.has(ph.property_id)) cover.set(ph.property_id, ph.storage_path);
    count.set(ph.property_id, (count.get(ph.property_id) ?? 0) + 1);
  }
  const filtered = !!(q || sp.status || sp.tx);
  const editable = canEdit(ctx.role);

  return (
    <>
      <PageHeader
        title="Nieruchomości"
        description="Oferty biura i ich dane. Każdą ofertę możesz zamienić w opis, post, karuzelę lub reklamę."
        actions={editable && (
          <div className="flex gap-2">
            {can(ctx.role, "import.run") && (
              <Button asChild variant="secondary">
                <Link href="/import"><UploadSimple /> Importuj oferty</Link>
              </Button>
            )}
            <Button asChild>
              <Link href="/properties/new"><Plus weight="bold" /> Dodaj nieruchomość</Link>
            </Button>
          </div>
        )}
      />
      <form className="mb-6 flex flex-col gap-2 sm:flex-row" role="search">
        <div className="relative flex-1">
          <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-4" />
          <Input name="q" defaultValue={q} placeholder="Szukaj po nazwie, mieście, dzielnicy" className="pl-9" aria-label="Szukaj" />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <NativeSelect name="status" defaultValue={sp.status ?? ""} aria-label="Status" className="sm:w-40">
            <option value="">Każdy status</option>
            {Object.entries(PROPERTY_STATUSES).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </NativeSelect>
          <NativeSelect name="tx" defaultValue={sp.tx ?? ""} aria-label="Transakcja" className="sm:w-36">
            <option value="">Sprzedaż i wynajem</option>
            {Object.entries(TRANSACTIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </NativeSelect>
        </div>
        <Button type="submit" variant="secondary">Filtruj</Button>
      </form>

      {!properties?.length ? (
        <EmptyState
          icon={<House />}
          title={filtered ? "Brak wyników" : "Dodaj pierwszą nieruchomość"}
          description={filtered ? "Zmień filtry lub wyszukiwaną frazę." : "Wpisz parametry i dodaj zdjęcia. Z jednej oferty wygenerujesz opis, posty, karuzele i reklamy."}
          action={!filtered && editable ? <Button asChild><Link href="/properties/new"><Plus weight="bold" /> Dodaj nieruchomość</Link></Button> : filtered ? <Button asChild variant="secondary"><Link href="/properties">Wyczyść filtry</Link></Button> : undefined}
        />
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {properties.map((p) => {
            const st = PROPERTY_STATUSES[p.status];
            const img = cover.get(p.id);
            const params = [formatArea(p.area_m2), p.rooms != null ? `${p.rooms} pok.` : null, floorLabel(p.floor, p.total_floors)].filter(Boolean).join(" · ");
            return (
              <li key={p.id}>
                <Link href={`/properties/${p.id}`} className="group block overflow-hidden rounded-lg border border-line bg-surface shadow-xs transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  <div className="relative aspect-[4/3] bg-sunken">
                    {img ? <img src={`/api/files/${img}`} alt="" loading="lazy" className="size-full object-cover" /> : (
                      <div className="flex size-full flex-col items-center justify-center gap-2 text-ink-4"><ImageIcon size={28} /><span className="text-[12.5px]">Brak zdjęć</span></div>
                    )}
                    <div className="absolute top-3 left-3 flex gap-1.5">
                      <Badge tone={st.tone === "success" ? "success" : st.tone === "warning" ? "warning" : st.tone === "accent" ? "accent" : "muted"} className="bg-surface/95 shadow-xs" dot>{st.label}</Badge>
                    </div>
                    {(count.get(p.id) ?? 0) > 0 && <span className="absolute right-3 bottom-3 rounded-full bg-ink/70 px-2 py-0.5 text-[11.5px] font-medium text-white">{count.get(p.id)} zdj.</span>}
                  </div>
                  <div className="p-4">
                    <div className="text-[12px] text-ink-3">{PROPERTY_TYPES[p.property_type]} · {TRANSACTIONS[p.transaction_type]}{p.city ? ` · ${[p.district, p.city].filter(Boolean).join(", ")}` : ""}</div>
                    <h3 className="mt-1 line-clamp-1 text-[15px] font-semibold text-ink group-hover:text-accent-ink">{p.title}</h3>
                    <div className="mt-3 flex items-end justify-between gap-3">
                      <span className="text-[13px] text-ink-2">{params || "Uzupełnij parametry"}</span>
                      <span className="tabular text-[15px] font-semibold whitespace-nowrap text-ink">{formatPrice(p.price, p.currency) ?? "—"}</span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
