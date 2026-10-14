import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check } from "@phosphor-icons/react/dist/ssr";
import { BrandMark } from "@/components/brand-mark";
import { ContactForm } from "@/components/site/contact-form";
import { StatsConsent, StatsSettingsLink } from "@/components/site/stats-consent";
import { getSessionUser } from "@/lib/session";
import { CONTACT_CONSENT } from "@/lib/site/service";
import { createAdminClient } from "@/lib/supabase/admin";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const TITLE = "Ogarnio Estate: marketing nieruchomości w jednej aplikacji";
const DESCRIPTION = "Od oferty do publikacji: teksty, grafiki, wideo, broszury PDF, planer i publikacja na Facebooku, Instagramie i LinkedIn. Aplikacja dla biur nieruchomości.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  metadataBase: new URL(SITE),
  alternates: { canonical: "/" },
  openGraph: { type: "website", locale: "pl_PL", url: "/", siteName: "Ogarnio Estate", title: TITLE, description: DESCRIPTION, images: [{ url: "/og.png", width: 1200, height: 630, alt: "Ogarnio Estate: kampania wygenerowana z jednej oferty" }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/og.png"] },
  robots: { index: true, follow: true },
};
export const dynamic = "force-dynamic";

const STEPS = [
  { title: "Dodaj ofertę", text: "Ręcznie, z pliku CSV, XML lub JSON albo z ASARI i EstiCRM przez ich oficjalne API." },
  { title: "Wygeneruj kampanię", text: "Posty, karuzela, Stories, Reels, opis do portali i broszura PDF z danych oferty i Twojej marki." },
  { title: "Zatwierdź materiały", text: "Nic nie wychodzi bez akceptacji. Każdy tekst i grafikę możesz poprawić, a wersje są zapisywane." },
  { title: "Opublikuj", text: "Na połączonych kontach Facebook, Instagram i LinkedIn albo pobierz pliki i opublikuj sam." },
  { title: "Analizuj wyniki", text: "Statystyki z oficjalnych API platform, kliknięcia linków UTM i zapytania z formularzy ofert." },
];

const TOOLS = ["edytor grafik", "aplikacja do montażu wideo", "czat AI do tekstów", "osobny planer postów", "panel publikacji w każdym serwisie", "arkusz z linkami i wynikami", "CRM z ofertami", "edytor PDF do broszur"];

const FEATURES = [
  { img: "campaign", title: "Campaign Studio", text: "Jedna oferta, komplet materiałów. Brief kampanii pokazuje, z jakich danych powstał każdy argument." },
  { img: "graphics", title: "Studio grafik", text: "Szablony w kolorach i fontach marki, formaty dla feedu, Stories i karuzel. Eksport PNG, JPG i PDF." },
  { img: "video", title: "Video Studio", text: "Reels i TikTok ze zdjęć oferty. Scenariusz zatwierdzasz przed renderowaniem, plik MP4 powstaje w tle." },
  { img: "planner", title: "Planer", text: "Kalendarz miesiąca i tygodnia, plany kampanii, statusy od pomysłu do publikacji, wykrywanie konfliktów." },
  { img: "publish", title: "Publikacja", text: "Reguły formatów sprawdzane osobno dla każdej platformy. Publikacja jest oznaczana jako zakończona dopiero po potwierdzeniu z platformy." },
  { img: "analytics", title: "Analityka", text: "Metryka, której platforma nie zwraca, ma wartość „Brak danych”, nie zero. Wnioski AI oddzielają obserwacje od hipotez." },
];

const FAQ = [
  { q: "Jak wyglądają płatności?", a: "Abonament miesięczny obsługuje Stripe (karta). Plan zmienisz albo anulujesz w ustawieniach biura; dostęp premium włącza się dopiero po potwierdzeniu płatności przez Stripe, nie po samym powrocie ze strony płatności." },
  { q: "Czy aplikacja publikuje bez mojej zgody?", a: "Nie. Każda publikacja wymaga akceptacji osoby z odpowiednią rolą. Po zmianie ceny oferty zaplanowane posty wracają do akceptacji. Płatnych kampanii reklamowych aplikacja nie uruchamia." },
  { q: "Na jakich platformach mogę publikować?", a: "Facebook (strony), Instagram (konta firmowe i twórców) i LinkedIn (profil i strony firmowe) przez oficjalne API. Połączenie wymaga zatwierdzonej aplikacji u danej platformy. TikTok: na razie pobierasz gotowy plik i publikujesz w aplikacji TikTok." },
  { q: "Jak chronione są dane?", a: "Każde biuro ma oddzielone dane na poziomie bazy (Row Level Security), role w zespole są sprawdzane na serwerze, tokeny kont społecznościowych są szyfrowane i nie trafiają do przeglądarki. Możesz pobrać kopię swoich danych i usunąć konto w ustawieniach." },
  { q: "Z jakimi CRM-ami działa import?", a: "Z plikami CSV, XML i JSON oraz z ASARI (Site API) i EstiCRM (EstiAPI) przez oficjalne interfejsy, po podaniu danych dostępowych biura. Zmiany z CRM-a (np. cena) czekają na Twoją decyzję, zanim trafią do ofert." },
  { q: "Jak działa okres próbny?", a: "Po założeniu konta masz 14 dni okresu próbnego bez podawania karty, z limitami planu próbnego. Po jego końcu wybierasz plan; dane biura zostają zachowane." },
];

const nf = new Intl.NumberFormat("pl-PL");

export default async function SalesPage() {
  const [{ user }, { data: plans }] = await Promise.all([getSessionUser(), createAdminClient().from("plans").select("id, name, description, price_minor, currency, price_tax_mode, billing_interval, trial_days, max_users, max_properties, monthly_text_generations, monthly_graphic_exports, monthly_video_renders, storage_mb, max_social_accounts").eq("is_public", true).eq("is_active", true).order("sort")]);
  const cta = user ? { href: "/dashboard", label: "Przejdź do aplikacji" } : { href: "/signup", label: "Wypróbuj Ogarnio Estate" };
  const taxNote = (mode: string) => (mode === "net" ? "netto" : mode === "gross" ? "brutto" : null);
  return (
    <div className="bg-canvas text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link href="/" aria-label="Ogarnio Estate"><BrandMark /></Link>
          <nav className="hidden items-center gap-6 text-[14px] text-ink-2 md:flex" aria-label="Sekcje">
            <a href="#jak-dziala" className="hover:text-ink">Jak działa</a>
            <a href="#funkcje" className="hover:text-ink">Funkcje</a>
            <a href="#cennik" className="hover:text-ink">Cennik</a>
            <a href="#faq" className="hover:text-ink">FAQ</a>
            <a href="#kontakt" className="hover:text-ink">Kontakt</a>
          </nav>
          <div className="flex items-center gap-2">
            {!user && <Link href="/login" className="rounded-md px-3 py-1.5 text-[14px] text-ink-2 hover:bg-sunken">Zaloguj się</Link>}
            <Link href={cta.href} className="rounded-md bg-accent px-3.5 py-1.5 text-[14px] font-medium text-white hover:bg-accent/90">{user ? "Aplikacja" : "Wypróbuj"}</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-5 pt-16 pb-12 md:pt-24">
          <p className="text-[13px] font-medium tracking-wide text-accent-ink uppercase">Aplikacja dla biur nieruchomości</p>
          <h1 className="mt-3 max-w-4xl text-[38px] leading-[1.08] font-semibold tracking-tight md:text-[58px]" data-testid="hero">
            Marketing nieruchomości.<br />Od oferty do publikacji.<br /><span className="font-display font-normal italic">W jednej aplikacji</span>
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-2">Dodajesz ofertę, a Ogarnio Estate przygotowuje teksty, grafiki, wideo i broszurę w stylu Twojej marki. Zatwierdzasz, planujesz i publikujesz, a potem sprawdzasz, które materiały przyniosły zapytania.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href={cta.href} className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-3 text-[15px] font-medium text-white shadow-sm hover:bg-accent/90" data-testid="cta-hero">{cta.label} <ArrowRight /></Link>
            <a href="#jak-dziala" className="rounded-lg border border-line bg-surface px-5 py-3 text-[15px] font-medium hover:bg-sunken">Zobacz, jak działa</a>
          </div>
          <p className="mt-3 text-[13px] text-ink-3">14 dni okresu próbnego, bez karty.</p>
          <figure className="mt-12 overflow-hidden rounded-xl border border-line bg-surface shadow-md">
            <Image src="/screenshots/campaign.webp" alt="Campaign Studio: kampania wygenerowana z jednej oferty" width={1280} height={800} priority className="h-auto w-full" />
          </figure>
          <p className="mt-2 text-[12px] text-ink-4">Zrzuty ekranu z działającej aplikacji w środowisku testowym (teksty oznaczone jako testowe powstały bez klucza AI).</p>
        </section>

        <section className="border-y border-line bg-surface" aria-labelledby="problem">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 id="problem" className="text-[28px] font-semibold tracking-tight md:text-[34px]">Jedna oferta, osiem narzędzi</h2>
            <p className="mt-3 max-w-2xl text-[16px] text-ink-2">Żeby wypromować jedno mieszkanie, biuro zwykle przeskakuje między wieloma programami. Dane oferty przepisuje się ręcznie, a po zmianie ceny trzeba pamiętać, gdzie jeszcze wisi stara.</p>
            <ul className="mt-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {TOOLS.map((t) => <li key={t} className="rounded-lg border border-line bg-canvas px-4 py-3 text-[14px] text-ink-2 line-through decoration-ink-4/60">{t}</li>)}
            </ul>
            <p className="mt-6 text-[16px]">W Ogarnio Estate te kroki dzieją się w jednym miejscu, na jednych danych oferty i jednej marce.</p>
          </div>
        </section>

        <section id="jak-dziala" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16" aria-labelledby="how">
          <h2 id="how" className="text-[28px] font-semibold tracking-tight md:text-[34px]">Jak działa</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-line bg-surface p-5">
                <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-[14px] font-semibold text-accent-ink">{i + 1}</span>
                <h3 className="mt-3 text-[16px] font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-ink-3">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="funkcje" className="scroll-mt-20 border-y border-line bg-surface" aria-labelledby="features">
          <div className="mx-auto max-w-6xl px-5 py-16">
            <h2 id="features" className="text-[28px] font-semibold tracking-tight md:text-[34px]">Funkcje</h2>
            <div className="mt-8 grid gap-8 md:grid-cols-2">
              {FEATURES.map((f) => (
                <article key={f.title}>
                  <div className="overflow-hidden rounded-xl border border-line bg-canvas shadow-sm"><Image src={`/screenshots/${f.img}.webp`} alt={`${f.title}: zrzut ekranu`} width={1280} height={800} className="h-auto w-full" loading="lazy" /></div>
                  <h3 className="mt-4 text-[18px] font-semibold">{f.title}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-ink-3">{f.text}</p>
                </article>
              ))}
            </div>
            <p className="mt-6 text-[12px] text-ink-4">Zrzuty ze środowiska testowego: publikacja i statystyki działały tam na symulatorze API platform, oznaczonym w aplikacji.</p>
          </div>
        </section>

        <section id="cennik" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-16" aria-labelledby="pricing">
          <h2 id="pricing" className="text-[28px] font-semibold tracking-tight md:text-[34px]">Cennik</h2>
          <p className="mt-3 text-[16px] text-ink-2">Każdy plan zaczyna się od okresu próbnego. Limity są liczone miesięcznie i widoczne w ustawieniach biura.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {(plans ?? []).map((p, i) => (
              <div key={p.id} className={`flex flex-col rounded-xl border bg-surface p-6 ${i === 1 ? "border-accent shadow-md" : "border-line"}`} data-testid="plan-card">
                <h3 className="text-[20px] font-semibold">{p.name}</h3>
                {p.description && <p className="mt-1 text-[14px] text-ink-3">{p.description}</p>}
                <p className="mt-4"><span className="text-[34px] font-semibold tabular-nums">{nf.format(p.price_minor / 100)} {p.currency === "PLN" ? "zł" : p.currency}</span> <span className="text-[14px] text-ink-3">/ {p.billing_interval === "year" ? "rok" : "mies."}{taxNote(p.price_tax_mode) ? ` ${taxNote(p.price_tax_mode)}` : ""}</span></p>
                <ul className="mt-5 flex flex-col gap-2 text-[14px] text-ink-2">
                  {[`${p.max_users === 1 ? "1 osoba" : `do ${p.max_users} osób`} w zespole`, `do ${nf.format(p.max_properties)} ofert`, `${nf.format(p.monthly_text_generations)} generowań AI miesięcznie`, `${nf.format(p.monthly_graphic_exports)} eksportów grafik miesięcznie`, `${nf.format(p.monthly_video_renders)} filmów miesięcznie`, `${p.max_social_accounts} kont social media`, `${nf.format(Math.round(p.storage_mb / 1024))} GB na pliki`].map((x) => <li key={x} className="flex gap-2"><Check className="mt-0.5 shrink-0 text-accent" weight="bold" />{x}</li>)}
                </ul>
                <Link href={user ? "/settings/billing" : "/signup"} className={`mt-6 rounded-lg px-4 py-2.5 text-center text-[14px] font-medium ${i === 1 ? "bg-accent text-white hover:bg-accent/90" : "border border-line hover:bg-sunken"}`}>{user ? "Zmień plan" : `Zacznij ${p.trial_days} dni za darmo`}</Link>
              </div>
            ))}
          </div>
          {(plans ?? []).some((p) => p.price_tax_mode === "unspecified") && <p className="mt-4 text-[12.5px] text-ink-4">Informacja, czy ceny są netto czy brutto, zostanie uzupełniona przed uruchomieniem sprzedaży.</p>}
        </section>

        <section id="faq" className="scroll-mt-20 border-y border-line bg-surface" aria-labelledby="faq-h">
          <div className="mx-auto max-w-3xl px-5 py-16">
            <h2 id="faq-h" className="text-[28px] font-semibold tracking-tight md:text-[34px]">Najczęstsze pytania</h2>
            <div className="mt-6 divide-y divide-line">
              {FAQ.map((f) => (
                <details key={f.q} className="group py-4">
                  <summary className="cursor-pointer list-none text-[16px] font-medium marker:hidden">{f.q}</summary>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-3">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 py-16 text-center">
          <h2 className="text-[28px] font-semibold tracking-tight md:text-[34px]">Pierwszy materiał w kilka minut</h2>
          <p className="mx-auto mt-3 max-w-xl text-[16px] text-ink-2">Załóż konto, dodaj logo, kolory i jedną ofertę. Kreator przeprowadzi Cię do pierwszego posta.</p>
          <Link href={cta.href} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-3 text-[15px] font-medium text-white shadow-sm hover:bg-accent/90" data-testid="cta-bottom">{cta.label} <ArrowRight /></Link>
        </section>

        <section id="kontakt" className="scroll-mt-20 border-t border-line bg-surface" aria-labelledby="contact">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-16 md:grid-cols-2">
            <div>
              <h2 id="contact" className="text-[28px] font-semibold tracking-tight md:text-[34px]">Kontakt</h2>
              <p className="mt-3 text-[16px] text-ink-2">Chcesz zobaczyć aplikację na swoich ofertach albo zapytać o integrację z CRM? Napisz, odpowiemy e-mailem.</p>
            </div>
            <ContactForm consent={CONTACT_CONSENT} />
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-[13px] text-ink-3">
          <BrandMark />
          <nav className="flex flex-wrap gap-4" aria-label="Informacje prawne">
            <Link href="/regulamin" className="underline-offset-2 hover:underline">Regulamin</Link>
            <Link href="/polityka-prywatnosci" className="underline-offset-2 hover:underline">Polityka prywatności</Link>
            <StatsSettingsLink />
          </nav>
        </div>
      </footer>
      <StatsConsent />
    </div>
  );
}
