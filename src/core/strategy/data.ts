import type { InsightFact } from "@/core/analytics/insights";

/**
 * The office's situation as numbers we computed ourselves. This is the only
 * "data" a strategy may cite; anything unknown is "Brak danych", never zero.
 */
export interface StrategyStats {
  windowDays: number;
  properties: {
    active: number;
    byType: Record<string, number>;
    sale: number;
    rent: number;
    withoutPhotos: number;
    withoutMaterials: number;
    listedOver60Days: number;
    newInWindow: number;
  };
  selected: {
    id: string;
    title: string;
    daysListed: number;
    photos: number;
    materials: number;
    publications: number;
    leads: number;
    clicks: number;
  }[];
  content: { inWindow: number; byKind: Record<string, number>; carousels: number; expert: number; video: number; ready: number };
  publications: { published: number; byPlatform: Record<string, number>; lastDaysAgo: number | null; weeksWithPost: number; weeksInWindow: number };
  planned: { next30: number };
  leads: { inWindow: number; byChannel: Record<string, number> };
  traffic: { clicks: number; pageViews: number };
  metrics: { withStats: number; views: number | null; simulated: boolean };
  connectedChannels: string[];
  brand: { profileApproved: boolean; memoryEntries: number };
}

const nf = (n: number) => new Intl.NumberFormat("pl-PL").format(n);
const list = (r: Record<string, number>, labels: Record<string, string> = {}) =>
  Object.entries(r).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${labels[k] ?? k}: ${v}`).join(", ");

const TYPE: Record<string, string> = { apartment: "mieszkania", house: "domy", plot: "działki", commercial: "lokale użytkowe", office: "biura", premises: "lokale", garage: "garaże", room: "pokoje", other: "inne" };
const KIND: Record<string, string> = { text: "teksty", graphic: "grafiki", video: "wideo", document: "dokumenty PDF" };

export function buildStrategyFacts(s: StrategyStats): InsightFact[] {
  const w = s.windowDays;
  const f: InsightFact[] = [];
  const add = (key: string, label: string, value: number | null, extra = "") =>
    f.push({ key, label, value: value === null ? "Brak danych" : `${nf(value)}${extra}`, numbers: value === null ? [] : [value] });

  add("properties_active", "Aktywne oferty", s.properties.active);
  if (s.properties.active) {
    f.push({ key: "properties_by_type", label: "Aktywne oferty według rodzaju", value: list(s.properties.byType, TYPE) || "Brak danych", numbers: Object.values(s.properties.byType) });
    f.push({ key: "properties_transaction", label: "Aktywne oferty: sprzedaż / najem", value: `${s.properties.sale} / ${s.properties.rent}`, numbers: [s.properties.sale, s.properties.rent] });
    add("properties_without_materials", "Aktywne oferty bez żadnego materiału marketingowego", s.properties.withoutMaterials);
    add("properties_without_photos", "Aktywne oferty bez zdjęć", s.properties.withoutPhotos);
    add("properties_listed_over_60", "Aktywne oferty dodane ponad 60 dni temu", s.properties.listedOver60Days);
  }
  add("properties_new", `Nowe oferty w ostatnich ${w} dniach`, s.properties.newInWindow);

  add("content_created", `Materiały utworzone w ostatnich ${w} dniach`, s.content.inWindow);
  if (s.content.inWindow) f.push({ key: "content_by_kind", label: `Materiały z ${w} dni według rodzaju`, value: list(s.content.byKind, KIND), numbers: Object.values(s.content.byKind) });
  add("content_carousels", `Karuzele w ostatnich ${w} dniach`, s.content.carousels);
  add("content_expert", `Materiały eksperckie i edukacyjne w ostatnich ${w} dniach`, s.content.expert);
  add("content_video", `Filmy i scenariusze wideo w ostatnich ${w} dniach`, s.content.video);
  add("content_ready", `Materiały oznaczone jako gotowe w ostatnich ${w} dniach`, s.content.ready);

  add("publications", `Publikacje potwierdzone przez platformy w ostatnich ${w} dniach`, s.publications.published);
  if (s.publications.published) f.push({ key: "publications_by_platform", label: "Publikacje według platformy", value: list(s.publications.byPlatform), numbers: Object.values(s.publications.byPlatform) });
  add("last_publication_days", "Dni od ostatniej publikacji", s.publications.lastDaysAgo);
  f.push({ key: "weeks_with_post", label: `Tygodnie z co najmniej jedną publikacją (z ${s.publications.weeksInWindow})`, value: `${s.publications.weeksWithPost}`, numbers: [s.publications.weeksWithPost, s.publications.weeksInWindow] });
  add("planned_next_30", "Wpisy w planerze na najbliższe 30 dni", s.planned.next30);

  add("leads", `Zapytania (leady) w ostatnich ${w} dniach`, s.leads.inWindow);
  if (s.leads.inWindow) f.push({ key: "leads_by_channel", label: "Zapytania według kanału", value: list(s.leads.byChannel), numbers: Object.values(s.leads.byChannel) });
  add("clicks", `Kliknięcia linków śledzących w ostatnich ${w} dniach (bez botów)`, s.traffic.clicks);
  add("page_views", `Wyświetlenia stron ofert w ostatnich ${w} dniach`, s.traffic.pageViews);
  f.push({
    key: "platform_views",
    label: `Wyświetlenia postów według statystyk platform (${s.metrics.withStats} publikacji ze statystykami)`,
    value: s.metrics.views === null ? "Brak danych" : nf(s.metrics.views),
    numbers: s.metrics.views === null ? [s.metrics.withStats] : [s.metrics.views, s.metrics.withStats],
  });
  if (s.metrics.simulated) f.push({ key: "simulator", label: "Uwaga", value: "Część statystyk platform pochodzi z symulatora API (dane testowe)", numbers: [] });
  f.push({ key: "connected_channels", label: "Połączone konta do publikacji", value: s.connectedChannels.length ? s.connectedChannels.join(", ") : "Brak", numbers: [] });
  f.push({ key: "brand_profile", label: "Profil marki", value: s.brand.profileApproved ? "zatwierdzony" : "niezatwierdzony (strategia opiera się na ustawieniach Brand Studio)", numbers: [] });
  add("brand_memory", "Zapisane preferencje w pamięci marki", s.brand.memoryEntries);

  for (const p of s.selected) {
    const k = `offer_${p.id.slice(0, 8)}`;
    f.push({
      key: k,
      label: `Oferta „${p.title.slice(0, 80)}”: dni od dodania / zdjęcia / materiały / publikacje / kliknięcia / zapytania`,
      value: `${p.daysListed} / ${p.photos} / ${p.materials} / ${p.publications} / ${p.clicks} / ${p.leads}`,
      numbers: [p.daysListed, p.photos, p.materials, p.publications, p.clicks, p.leads],
    });
  }
  return f;
}
