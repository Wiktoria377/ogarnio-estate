import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { LeadForm } from "@/components/public/lead-form";
import { consentText } from "@/core/analytics/metrics";
import { recordPageView } from "@/lib/analytics/service";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatArea, formatPrice } from "@/lib/utils";
import { PROPERTY_TYPES, TRANSACTIONS } from "@/verticals/real-estate/labels";
import { floorLabel, locationLabel } from "@/verticals/real-estate/property";

/**
 * Public offer page (enabled per offer by the office). Shows only data the
 * office entered; the lead form stores consent text and version as proof.
 */
async function load(slug: string) {
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return null;
  const admin = createAdminClient();
  const { data: p } = await admin.from("properties").select("*").eq("public_slug", slug).eq("public_enabled", true).neq("status", "archived").maybeSingle();
  if (!p) return null;
  const [{ data: photos }, { data: brand }] = await Promise.all([
    admin.from("property_photos").select("id, is_visualization, width, height").eq("property_id", p.id).order("position").limit(20),
    admin.from("brand_profiles").select("company_name, colors, contact_email, contact_phone").eq("workspace_id", p.workspace_id).maybeSingle(),
  ]);
  return { p, photos: photos ?? [], brand };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const d = await load((await params).slug);
  if (!d) return { title: "Oferta niedostępna", robots: { index: false } };
  return { title: d.p.title, description: d.p.description?.slice(0, 160) ?? undefined, robots: { index: false, follow: false } };
}

export default async function PublicOfferPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { slug } = await params;
  const sp = await searchParams;
  if (slug === "niedostepna") {
    return <main className="mx-auto max-w-xl px-6 py-24 text-center"><h1 className="text-2xl font-semibold">Oferta jest już niedostępna</h1><p className="mt-2 text-ink-3">Biuro wyłączyło tę stronę albo oferta została zakończona.</p></main>;
  }
  const d = await load(slug);
  if (!d) notFound();
  const { p, photos, brand } = d;
  await recordPageView(p, sp.l ?? null, await headers()).catch(() => undefined);
  const office = brand?.company_name ?? "Biuro nieruchomości";
  const color = ((brand?.colors ?? {}) as { primary?: string }).primary ?? "#6D4AFF";
  const facts = [
    [PROPERTY_TYPES[p.property_type], TRANSACTIONS[p.transaction_type]].join(" · "),
    locationLabel(p),
    p.area_m2 != null ? formatArea(p.area_m2) : null,
    p.rooms != null ? `${p.rooms} pok.` : null,
    floorLabel(p.floor, p.total_floors),
    p.year_built ? `rok budowy ${p.year_built}` : null,
  ].filter(Boolean);
  const utm = Object.fromEntries(Object.entries(sp).filter(([k, v]) => /^utm_/.test(k) && typeof v === "string").map(([k, v]) => [k, String(v).slice(0, 120)]));
  return (
    <main className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <span className="text-[15px] font-semibold" style={{ color }}>{office}</span>
          {brand?.contact_phone && <a href={`tel:${brand.contact_phone.replace(/\s/g, "")}`} className="text-[13px] text-ink-2">{brand.contact_phone}</a>}
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl gap-8 px-5 py-8 lg:grid-cols-[1fr_360px]">
        <article>
          <h1 className="text-[26px] font-semibold leading-tight" data-testid="offer-title">{p.title}</h1>
          {p.price != null && <p className="mt-2 text-[20px] font-medium" style={{ color }}>{formatPrice(p.price, p.currency)}{p.transaction_type === "rent" ? " / mies." : ""}</p>}
          <p className="mt-2 text-[14px] text-ink-3">{facts.join(" · ")}</p>
          {photos.length > 0 && (
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {photos.map((ph, i) => (
                <figure key={ph.id} className={i === 0 ? "sm:col-span-2" : ""}>
                  <img src={`/api/public/photos/${slug}/${ph.id}`} alt={`${p.title}, zdjęcie ${i + 1}`} className="w-full rounded-lg object-cover" loading={i ? "lazy" : "eager"} width={ph.width} height={ph.height} />
                  {ph.is_visualization && <figcaption className="mt-1 text-[12px] text-ink-3">Wizualizacja poglądowa</figcaption>}
                </figure>
              ))}
            </div>
          )}
          {p.description && <div className="mt-6 whitespace-pre-line text-[15px] leading-relaxed text-ink-2">{p.description}</div>}
          {(p.features.length > 0 || p.amenities.length > 0) && (
            <ul className="mt-5 flex flex-wrap gap-1.5">{[...p.features, ...p.amenities].map((f) => <li key={f} className="rounded-full bg-sunken px-3 py-1 text-[12.5px] text-ink-2">{f}</li>)}</ul>
          )}
        </article>
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <LeadForm slug={slug} link={sp.l && /^[A-Za-z0-9]{8,16}$/.test(sp.l) ? sp.l : ""} utm={utm} consent={consentText(office)} color={color} />
        </aside>
      </div>
      <footer className="border-t border-line py-6 text-center text-[12px] text-ink-4">{office} · strona oferty przygotowana w Ogarnio Estate</footer>
    </main>
  );
}
