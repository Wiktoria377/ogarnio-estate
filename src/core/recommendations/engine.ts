/**
 * Marketing recommendations from the office's own records. Deterministic
 * rules, no AI and no invented numbers: every number a recommendation shows
 * is in its `data`, and a rule that lacks the data it needs stays silent.
 * Recommendations describe what was observed; they never claim a cause.
 */

export const RECO_VERSION = "reco-1.0.0";

export interface RecoProperty {
  id: string;
  title: string;
  daysListed: number;
  photos: number;
  materials: number;
  carousels: number;
  /** Publications confirmed by a platform, all time. */
  publications: number;
  lastPublicationDaysAgo: number | null;
  clicks30: number;
  leads30: number;
}

export interface RecoPublication {
  id: string;
  contentItemId: string | null;
  contentKind: string | null;
  title: string;
  platform: string;
  daysAgo: number;
  /** Latest platform statistics; null when the platform returned none. */
  views: number | null;
  interactions: number | null;
  simulated: boolean;
}

export interface RecoData {
  windowDays: number;
  properties: RecoProperty[];
  /** Confirmed publications in the window. */
  publications: RecoPublication[];
  /** Days since the last confirmed publication ever; null = never. */
  lastPublicationDaysAgo: number | null;
  /** Confirmed publications per week, index 0 = the last 7 days, 8 weeks. */
  weekly: number[];
  plannedNext14: number;
  /** Educational materials created in the window, by content type. */
  education: Record<string, number>;
  connectedChannels: number;
  trackedLinks: number;
  leadsInWindow: number;
}

export type RecoCode =
  | "publication_gap"
  | "irregular_frequency"
  | "empty_planner"
  | "unused_property"
  | "unpublished_material"
  | "repromote_property"
  | "missing_carousel"
  | "missing_photos"
  | "headline_test"
  | "missing_education"
  | "connect_channels"
  | "tracking_links";

export type RecoPriority = "high" | "medium" | "low";

export interface Recommendation {
  /** Stable per subject, so a dismissal applies to this case only. */
  key: string;
  code: RecoCode;
  priority: RecoPriority;
  /** 1. Co proponujemy. */
  title: string;
  /** 2. Na jakiej podstawie (only numbers present in `data`). */
  why: string;
  /** 3. Jakie dane wykorzystano. */
  data: { label: string; value: string }[];
  /** 4. Co możesz zrobić (real links in the app). */
  actions: { label: string; href: string }[];
  /** 5. Jaki rezultat warto mierzyć. */
  measure: string;
  /** What these data cannot show. */
  caveat?: string;
  subject?: { type: "property" | "publication"; id: string; title: string };
}

export const RECO_CODES: Record<RecoCode, string> = {
  publication_gap: "Przerwa w komunikacji",
  irregular_frequency: "Częstotliwość publikacji",
  empty_planner: "Pusty planer",
  unused_property: "Niewykorzystana oferta",
  unpublished_material: "Materiał bez publikacji",
  repromote_property: "Ponowna promocja oferty",
  missing_carousel: "Karuzela oferty",
  missing_photos: "Oferta bez zdjęć",
  headline_test: "Test nagłówka",
  missing_education: "Brakujące tematy edukacyjne",
  connect_channels: "Pomiar wyników",
  tracking_links: "Pomiar wyników",
};

/** Educational topics the office can cover (Studio content types). */
export const EDUCATION_TOPICS: { type: string; label: string; topic: string }[] = [
  { type: "buying_content", label: "kupowanie mieszkania", topic: "Jak przygotować się do zakupu mieszkania" },
  { type: "selling_content", label: "sprzedaż nieruchomości", topic: "Jak przygotować mieszkanie do sprzedaży" },
  { type: "faq", label: "najczęstsze pytania klientów", topic: "Najczęstsze pytania klientów biura" },
  { type: "guide_content", label: "poradnik krok po kroku", topic: "Formalności przy zakupie nieruchomości krok po kroku" },
  { type: "market_post", label: "sytuacja na lokalnym rynku", topic: "Co dzieje się na lokalnym rynku nieruchomości" },
  { type: "educational_post", label: "porady dla kupujących i sprzedających", topic: "Na co zwrócić uwagę podczas oglądania mieszkania" },
];

const PRIORITY_ORDER: Record<RecoPriority, number> = { high: 0, medium: 1, low: 2 };
const MAX_PER_RULE = 5;
const nf = (n: number) => new Intl.NumberFormat("pl-PL").format(n);
const pct = (n: number) => `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(n * 100)}%`;
const days = (n: number) => `${nf(n)} ${n === 1 ? "dzień" : "dni"}`;
const enc = encodeURIComponent;

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function communication(d: RecoData): Recommendation[] {
  const out: Recommendation[] = [];
  const recent4 = d.weekly.slice(0, 4).reduce((a, b) => a + b, 0);
  const total8 = d.weekly.reduce((a, b) => a + b, 0);
  const weeksWith = d.weekly.filter((n) => n > 0).length;

  if (d.lastPublicationDaysAgo !== null && d.lastPublicationDaysAgo > 14) {
    out.push({
      key: "publication_gap", code: "publication_gap", priority: d.lastPublicationDaysAgo > 30 ? "high" : "medium",
      title: "Wznów regularne publikacje",
      why: `Ostatnia publikacja potwierdzona przez platformę była ${days(d.lastPublicationDaysAgo)} temu. W planerze na najbliższe 14 dni jest ${nf(d.plannedNext14)} wpisów.`,
      data: [
        { label: "Dni od ostatniej potwierdzonej publikacji", value: nf(d.lastPublicationDaysAgo) },
        { label: "Wpisy w planerze na 14 dni", value: nf(d.plannedNext14) },
      ],
      actions: [{ label: "Przygotuj plan w Autopilocie", href: "/autopilot" }, { label: "Otwórz planer", href: "/planner" }],
      measure: "Liczba tygodni z co najmniej jedną publikacją w kolejnych 8 tygodniach.",
    });
  } else if (d.lastPublicationDaysAgo === null && d.connectedChannels > 0) {
    out.push({
      key: "publication_gap", code: "publication_gap", priority: "high",
      title: "Opublikuj pierwszy materiał",
      why: `Biuro ma ${nf(d.connectedChannels)} połączonych kont, ale aplikacja nie ma jeszcze żadnej publikacji potwierdzonej przez platformę.`,
      data: [{ label: "Połączone konta", value: nf(d.connectedChannels) }, { label: "Potwierdzone publikacje", value: "0" }],
      actions: [{ label: "Otwórz planer", href: "/planner" }, { label: "Przygotuj plan w Autopilocie", href: "/autopilot" }],
      measure: "Liczba potwierdzonych publikacji i tygodni z publikacją.",
    });
  }

  // Irregular rhythm: posts exist in the last 8 weeks, but fewer than half of the weeks had one.
  if (total8 >= 2 && weeksWith < 4 && recent4 > 0) {
    out.push({
      key: "irregular_frequency", code: "irregular_frequency", priority: "medium",
      title: "Ustal stały rytm publikacji",
      why: `W ostatnich 8 tygodniach opublikowano ${nf(total8)} materiałów, ale tylko w ${nf(weeksWith)} z 8 tygodni. Publikacje są skupione w kilku tygodniach zamiast rozłożone.`,
      data: [
        { label: "Publikacje w 8 tygodniach", value: nf(total8) },
        { label: "Tygodnie z publikacją (z 8)", value: nf(weeksWith) },
        { label: "Publikacje tydzień po tygodniu (od najnowszego)", value: d.weekly.join(", ") },
      ],
      actions: [{ label: "Rozłóż publikacje w planerze", href: "/planner" }, { label: "Przygotuj plan w Autopilocie", href: "/autopilot" }],
      measure: "Tygodnie z publikacją oraz wyświetlenia na publikację (jeśli platforma je podaje) przed zmianą i po niej.",
      caveat: "Dane pokazują rozkład publikacji, nie dowodzą, że inny rytm da lepsze wyniki. To propozycja do sprawdzenia.",
    });
  }

  if (d.plannedNext14 === 0 && d.properties.length > 0 && !out.some((r) => r.code === "publication_gap")) {
    out.push({
      key: "empty_planner", code: "empty_planner", priority: "medium",
      title: "Zaplanuj najbliższe dwa tygodnie",
      why: `Planer nie ma wpisów na najbliższe 14 dni. Liczba aktywnych ofert biura: ${nf(d.properties.length)}.`,
      data: [{ label: "Wpisy w planerze na 14 dni", value: "0" }, { label: "Aktywne oferty", value: nf(d.properties.length) }],
      actions: [{ label: "Przygotuj plan w Autopilocie", href: "/autopilot" }, { label: "Otwórz planer", href: "/planner" }],
      measure: "Liczba zaplanowanych i potwierdzonych publikacji w najbliższych 14 dniach.",
    });
  }
  return out;
}

function properties(d: RecoData): Recommendation[] {
  const out: Recommendation[] = [];
  const ps = [...d.properties].sort((a, b) => b.daysListed - a.daysListed);
  const subject = (p: RecoProperty) => ({ type: "property" as const, id: p.id, title: p.title });
  const facts = (p: RecoProperty, extra: { label: string; value: string }[] = []) => [
    { label: "Dni od dodania oferty", value: nf(p.daysListed) },
    { label: "Zdjęcia", value: nf(p.photos) },
    { label: "Materiały marketingowe", value: nf(p.materials) },
    { label: "Potwierdzone publikacje", value: nf(p.publications) },
    ...extra,
  ];

  for (const p of ps.filter((x) => x.photos === 0).slice(0, MAX_PER_RULE)) {
    out.push({
      key: `missing_photos:${p.id}`, code: "missing_photos", priority: "high", subject: subject(p),
      title: `Dodaj zdjęcia oferty „${p.title}”`,
      why: `Oferta jest aktywna od ${days(p.daysListed)} i nie ma żadnego zdjęcia, więc nie da się przygotować dla niej grafiki, karuzeli ani filmu.`,
      data: facts(p),
      actions: [{ label: "Dodaj zdjęcia", href: `/properties/${p.id}` }],
      measure: "Liczba materiałów i publikacji tej oferty po dodaniu zdjęć.",
    });
  }

  for (const p of ps.filter((x) => x.publications === 0 && x.daysListed >= 7).slice(0, MAX_PER_RULE)) {
    const noMaterial = p.materials === 0;
    out.push({
      key: `${noMaterial ? "unused_property" : "unpublished_material"}:${p.id}`, code: noMaterial ? "unused_property" : "unpublished_material",
      priority: p.daysListed >= 30 ? "high" : "medium", subject: subject(p),
      title: noMaterial ? `Przygotuj pierwszy materiał dla oferty „${p.title}”` : `Opublikuj przygotowany materiał oferty „${p.title}”`,
      why: noMaterial
        ? `Oferta jest aktywna od ${days(p.daysListed)}, nie ma żadnego materiału marketingowego ani potwierdzonej publikacji.`
        : `Oferta jest aktywna od ${days(p.daysListed)}, ma ${nf(p.materials)} materiałów, ale żaden nie został opublikowany z potwierdzeniem platformy.`,
      data: facts(p),
      actions: noMaterial
        ? [{ label: "Utwórz post sprzedażowy", href: `/studio/new?type=property_sales_post&property=${p.id}` }, ...(p.photos ? [{ label: "Utwórz grafikę", href: `/graphics/new?property=${p.id}` }] : [])]
        : [{ label: "Zobacz materiały oferty", href: `/library?property=${p.id}` }, { label: "Otwórz planer", href: "/planner" }],
      measure: "Kliknięcia linków śledzących i zapytania dotyczące tej oferty w 30 dni po publikacji.",
    });
  }

  for (const p of ps.filter((x) => x.publications > 0 && x.lastPublicationDaysAgo !== null && x.lastPublicationDaysAgo >= 30 && x.leads30 === 0).slice(0, MAX_PER_RULE)) {
    out.push({
      key: `repromote_property:${p.id}`, code: "repromote_property", priority: "medium", subject: subject(p),
      title: `Ponownie wypromuj ofertę „${p.title}”`,
      why: `Ostatnia publikacja tej oferty była ${days(p.lastPublicationDaysAgo!)} temu, a w ostatnich 30 dniach aplikacja nie odnotowała zapytań o nią (kliknięcia: ${nf(p.clicks30)}).`,
      data: facts(p, [
        { label: "Dni od ostatniej publikacji oferty", value: nf(p.lastPublicationDaysAgo!) },
        { label: "Kliknięcia w 30 dniach", value: nf(p.clicks30) },
        { label: "Zapytania w 30 dniach", value: nf(p.leads30) },
      ]),
      actions: [
        ...(p.photos >= 3 && p.carousels === 0 ? [{ label: "Utwórz karuzelę", href: `/graphics/new?property=${p.id}&format=carousel` }] : []),
        { label: "Napisz nowy post z innym ujęciem", href: `/studio/new?type=property_sales_post&property=${p.id}` },
      ],
      measure: "Kliknięcia i zapytania o tę ofertę w 30 dni po ponownej publikacji, w porównaniu z ostatnimi 30 dniami.",
      caveat: "Liczone są tylko zapytania z formularzy i linków aplikacji; telefony i portale ogłoszeniowe nie są tu widoczne.",
    });
  }

  for (const p of ps.filter((x) => x.photos >= 5 && x.carousels === 0).slice(0, MAX_PER_RULE)) {
    out.push({
      key: `missing_carousel:${p.id}`, code: "missing_carousel", priority: "low", subject: subject(p),
      title: `Dodaj karuzelę oferty „${p.title}”`,
      why: `Oferta ma ${nf(p.photos)} zdjęć i ${nf(p.materials)} materiałów, ale żadnej karuzeli, która pozwala pokazać kilka pomieszczeń w jednej publikacji.`,
      data: facts(p, [{ label: "Karuzele", value: "0" }]),
      actions: [{ label: "Utwórz karuzelę", href: `/graphics/new?property=${p.id}&format=carousel` }],
      measure: "Zapisania i interakcje karuzeli w porównaniu z innymi publikacjami tej oferty.",
    });
  }
  return out;
}

function headlines(d: RecoData): Recommendation[] {
  const rated = d.publications
    .filter((p) => p.views !== null && p.views >= 50 && p.interactions !== null && p.daysAgo >= 3)
    .map((p) => ({ ...p, rate: p.interactions! / p.views! }));
  if (rated.length < 5) return [];
  const med = median(rated.map((p) => p.rate));
  if (med <= 0) return [];
  const low = rated.filter((p) => p.rate < med / 2 && p.contentItemId).sort((a, b) => a.rate - b.rate).slice(0, 2);
  const simulated = rated.some((p) => p.simulated);
  return low.map((p) => ({
    key: `headline_test:${p.id}`, code: "headline_test" as const, priority: "low" as const,
    subject: { type: "publication" as const, id: p.id, title: p.title },
    title: `Przetestuj inny nagłówek materiału „${p.title}”`,
    why: `Wskaźnik interakcji tej publikacji (${pct(p.rate)}) jest niższy niż połowa mediany ${nf(rated.length)} publikacji ze statystykami (${pct(med)}).`,
    data: [
      { label: "Wyświetlenia", value: nf(p.views!) },
      { label: "Interakcje", value: nf(p.interactions!) },
      { label: "Wskaźnik interakcji", value: pct(p.rate) },
      { label: `Mediana wskaźnika (${nf(rated.length)} publikacji)`, value: pct(med) },
      { label: "Platforma", value: p.platform },
      ...(simulated ? [{ label: "Źródło statystyk", value: "część z symulatora API (dane testowe)" }] : []),
    ],
    actions: [
      ...(p.contentKind === "text" ? [{ label: "Otwórz materiał", href: `/studio/${p.contentItemId}` }] : p.contentKind === "graphic" ? [{ label: "Otwórz grafikę", href: `/graphics/${p.contentItemId}` }] : []),
      { label: "Przygotuj warianty nagłówków", href: `/studio/new?type=headline_variants&topic=${enc(p.title.slice(0, 120))}` },
    ],
    measure: "Wskaźnik interakcji (interakcje / wyświetlenia) nowej wersji w porównaniu z obecną, przy podobnej porze i platformie.",
    caveat: "Różnica nie musi wynikać z nagłówka: wpływ mają też pora publikacji, format, zdjęcie i sama oferta.",
  }));
}

function education(d: RecoData): Recommendation[] {
  const total = EDUCATION_TOPICS.reduce((a, t) => a + (d.education[t.type] ?? 0), 0);
  const missing = EDUCATION_TOPICS.filter((t) => !(d.education[t.type] ?? 0));
  if (!missing.length) return [];
  const first = missing[0]!;
  return [{
    key: "missing_education", code: "missing_education", priority: total === 0 ? "medium" : "low",
    title: total === 0 ? "Dodaj treści edukacyjne" : "Uzupełnij brakujące tematy edukacyjne",
    why: total === 0
      ? `W ostatnich ${nf(d.windowDays)} dniach biuro nie utworzyło żadnego materiału edukacyjnego.`
      : `Liczba materiałów edukacyjnych z ostatnich ${nf(d.windowDays)} dni: ${nf(total)}. Brakuje materiału dla ${nf(missing.length)} z ${nf(EDUCATION_TOPICS.length)} tematów.`,
    data: [
      { label: `Materiały edukacyjne w ${nf(d.windowDays)} dniach`, value: nf(total) },
      { label: `Tematy bez materiału (${nf(missing.length)} z ${nf(EDUCATION_TOPICS.length)})`, value: missing.map((t) => t.label).join(", ") },
    ],
    actions: missing.slice(0, 3).map((t) => ({ label: `Napisz: ${t.label}`, href: `/studio/new?type=${t.type}&topic=${enc(t.topic)}` })),
    measure: first.type === "faq" ? "Zapytania i pytania klientów po publikacji." : "Zapisania i udostępnienia materiałów edukacyjnych (jeśli platforma je podaje) oraz zapytania w kolejnych 30 dniach.",
  }];
}

function measurement(d: RecoData): Recommendation[] {
  if (d.connectedChannels === 0) {
    return [{
      key: "connect_channels", code: "connect_channels", priority: "medium",
      title: "Połącz konta społecznościowe, aby mierzyć wyniki",
      why: "Biuro nie ma połączonego konta. Bez niego aplikacja nie zna potwierdzonych publikacji ani statystyk, więc nie może porównywać materiałów.",
      data: [{ label: "Połączone konta", value: "0" }, { label: "Publikacje ze statystykami", value: "0" }],
      actions: [{ label: "Połącz konto", href: "/connections" }],
      measure: "Liczba publikacji ze statystykami platform.",
    }];
  }
  if (d.trackedLinks === 0 && d.publications.length > 0) {
    return [{
      key: "tracking_links", code: "tracking_links", priority: "low",
      title: "Dodawaj linki śledzące do publikacji",
      why: `W ostatnich ${nf(d.windowDays)} dniach jest ${nf(d.publications.length)} potwierdzonych publikacji, ale biuro nie ma żadnego linku śledzącego, więc kliknięć i zapytań nie da się przypisać do publikacji.`,
      data: [{ label: "Potwierdzone publikacje", value: nf(d.publications.length) }, { label: "Linki śledzące", value: "0" }],
      actions: [{ label: "Utwórz link śledzący", href: "/analytics" }],
      measure: "Kliknięcia i zapytania przypisane do publikacji.",
    }];
  }
  return [];
}

/** All applicable recommendations, most important first. */
export function buildRecommendations(d: RecoData): Recommendation[] {
  const all = [...communication(d), ...properties(d), ...headlines(d), ...education(d), ...measurement(d)];
  return all.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
}

/** What the data cannot tell (shown next to the list instead of guessed numbers). */
export function dataGaps(d: RecoData): string[] {
  const gaps: string[] = [];
  const withStats = d.publications.filter((p) => p.views !== null).length;
  if (withStats < 5) gaps.push(`Statystyki platform ma ${nf(withStats)} publikacji (potrzeba co najmniej 5), więc nie ma porównań skuteczności treści.`);
  if (d.trackedLinks === 0) gaps.push("Brak linków śledzących: kliknięcia nie są przypisane do publikacji.");
  if (d.leadsInWindow === 0) gaps.push(`Brak zapytań z formularzy aplikacji w ostatnich ${nf(d.windowDays)} dniach.`);
  if (d.publications.some((p) => p.simulated)) gaps.push("Część statystyk pochodzi z symulatora API (dane testowe), nie z prawdziwych platform.");
  return gaps;
}
