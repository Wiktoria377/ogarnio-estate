/**
 * UI dictionary (Polish). Components read copy through `t`, so adding a locale
 * means adding a file with the same shape and choosing it per profile.locale.
 */
export const pl = {
  app: { name: "Ogarnio Estate", tagline: "Marketing biura nieruchomości" },
  nav: {
    dashboard: "Pulpit",
    director: "AI Marketing Director",
    autopilot: "Campaign Autopilot",
    recommendations: "Rekomendacje",
    campaigns: "Campaign Studio",
    campaignsHint: "Stwórz kampanię",
    video: "Video Studio",
    brochures: "Broszury PDF",
    planner: "Planer",
    publications: "Publikacje",
    analytics: "Analityka",
    leads: "Zapytania",
    connections: "Połączone konta",
    studio: "Studio treści",
    graphics: "Studio grafik",
    library: "Biblioteka",
    properties: "Nieruchomości",
    brand: "Marka",
    skills: "Kompetencje AI",
    settings: "Ustawienia",
    signOut: "Wyloguj się",
    workspaces: "Biura",
    newWorkspace: "Nowe biuro",
    create: "Stwórz nowy materiał",
  },
  common: {
    save: "Zapisz",
    saving: "Zapisywanie…",
    saved: "Zapisano",
    cancel: "Anuluj",
    delete: "Usuń",
    edit: "Edytuj",
    copy: "Kopiuj",
    copied: "Skopiowano do schowka",
    duplicate: "Duplikuj",
    open: "Otwórz",
    back: "Wróć",
    next: "Dalej",
    search: "Szukaj",
    all: "Wszystkie",
    none: "Brak",
    retry: "Spróbuj ponownie",
    loading: "Ładowanie…",
    error: "Coś poszło nie tak.",
    confirmDelete: "Tej operacji nie można cofnąć.",
  },
  status: { draft: "Szkic", review: "Do akceptacji", ready: "Gotowe" },
  ai: {
    testMode: "Tryb testowy: teksty są składane mechanicznie z danych (bez AI). Ustaw ANTHROPIC_API_KEY, aby generować prawdziwe treści.",
    unconfigured: "Generowanie AI nie jest jeszcze skonfigurowane. Administrator musi dodać ANTHROPIC_API_KEY na serwerze.",
  },
} as const;

export type Dictionary = typeof pl;
export const t = pl;
