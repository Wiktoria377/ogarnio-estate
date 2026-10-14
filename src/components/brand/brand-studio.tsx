"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, Trash } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { Dropzone } from "@/components/common/dropzone";
import { useUpload } from "@/components/common/use-upload";
import { fontFamily, useFonts } from "@/components/common/font-loader";
import { saveBrand, deleteBrandAsset } from "@/app/(app)/brand/actions";
import { ADDRESS_FORMS, BRAND_STYLES, COMMUNICATION_STYLES, SOCIAL_NETWORKS, type BrandColors, type BrandStyle } from "@/core/brand/model";
import { FONTS } from "@/core/brand/fonts";
import { contrastRatio, readableOn } from "@/core/brand/color";
import { cn } from "@/lib/utils";

type FormState = {
  company_name: string;
  tagline: string;
  colors: BrandColors;
  heading_font: string;
  body_font: string;
  contact_email: string;
  contact_phone: string;
  address: string;
  website: string;
  socials: Record<string, string>;
  brand_style: BrandStyle;
  personality: string;
  target_audience: string;
  communication_style: keyof typeof COMMUNICATION_STYLES;
  address_form: keyof typeof ADDRESS_FORMS;
  emoji_policy: "none" | "sparing";
  preferred_phrases: string;
  avoided_phrases: string;
};

const COLOR_LABELS: Record<keyof BrandColors, { label: string; hint: string }> = {
  primary: { label: "Główny", hint: "Akcenty, przyciski, plakietki" },
  secondary: { label: "Uzupełniający", hint: "Ciemne tła, kontrast" },
  accent: { label: "Akcent", hint: "Detale, linie" },
  background: { label: "Tło", hint: "Jasne powierzchnie" },
  text: { label: "Tekst", hint: "Główny kolor pisma" },
};

const STYLE_PRESETS: Record<BrandStyle, { colors: BrandColors; heading: string; body: string }> = {
  luxury: { colors: { primary: "#1E1B18", secondary: "#14120F", accent: "#B89B6A", background: "#F6F2EC", text: "#1E1B18" }, heading: "cormorant-garamond", body: "manrope" },
  modern_minimal: { colors: { primary: "#1F1F1F", secondary: "#2B2B2B", accent: "#9C9C9C", background: "#F7F7F5", text: "#161616" }, heading: "geist", body: "geist" },
  elegant_corporate: { colors: { primary: "#1D3557", secondary: "#14213D", accent: "#A8B5C8", background: "#F7F8FA", text: "#1B2230" }, heading: "playfair-display", body: "work-sans" },
  warm_lifestyle: { colors: { primary: "#B5603B", secondary: "#3E2C23", accent: "#E7C9A9", background: "#FBF6F0", text: "#2E231D" }, heading: "fraunces", body: "dm-sans" },
  bold_contemporary: { colors: { primary: "#5B3FF0", secondary: "#121016", accent: "#D7FF3F", background: "#F4F3F0", text: "#121016" }, heading: "space-grotesk", body: "plus-jakarta-sans" },
};

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-6">
      <CardHeader title={title} description={description} />
      <CardBody className="flex flex-col gap-5">{children}</CardBody>
    </Card>
  );
}

export function BrandStudio({ initial, logo: initialLogo, references: initialRefs, editable, welcome }: {
  initial: FormState;
  logo: { id: string; url: string } | null;
  references: { id: string; url: string; label: string | null }[];
  editable: boolean;
  welcome: boolean;
}) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [logo, setLogo] = useState(initialLogo);
  const [refs, setRefs] = useState(initialRefs);
  const [saving, start] = useTransition();
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);
  useFonts([form.heading_font, form.body_font]);

  const logoUpload = useUpload({ purpose: "logo" }, (j) => j.asset as { id: string; url: string });
  const refUpload = useUpload({ purpose: "reference" }, (j) => j.asset as { id: string; url: string; label: string | null });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const err = (k: string) => errors[k];

  function save() {
    start(async () => {
      const res = await saveBrand(form);
      if (res.ok) {
        setErrors({});
        toast.success(res.message ?? "Zapisano");
        router.refresh();
        if (welcome) router.push("/dashboard?welcome=1");
      } else {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.error);
      }
    });
  }

  const c = form.colors;
  const lowContrast = contrastRatio(c.text, c.background) < 4.5;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
      <fieldset disabled={!editable} className="flex min-w-0 flex-col gap-6">
        {!editable && <p className="rounded-md bg-sunken px-4 py-3 text-[13px] text-ink-3">Markę może edytować właściciel lub administrator biura.</p>}

        <Section id="identity" title="Tożsamość" description="Nazwa i logo pojawiają się na grafikach i w podpisach tekstów.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Nazwa firmy" htmlFor="company_name" error={err("company_name")}>
              <Input id="company_name" value={form.company_name} onChange={(e) => set("company_name", e.target.value)} maxLength={120} />
            </Field>
            <Field label="Slogan" htmlFor="tagline" optional error={err("tagline")}>
              <Input id="tagline" value={form.tagline} onChange={(e) => set("tagline", e.target.value)} maxLength={160} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-[160px_1fr] sm:items-center">
            <div className="flex aspect-[4/3] items-center justify-center rounded-lg border border-line bg-[repeating-conic-gradient(#f3f1ee_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-3">
              {logo ? <img src={logo.url} alt="Logo biura" className="max-h-full max-w-full object-contain" /> : <span className="text-[12.5px] text-ink-4">Brak logo</span>}
            </div>
            <Dropzone
              label={logo ? "Zmień logo" : "Dodaj logo"}
              hint="PNG z przezroczystym tłem, SVG zapisz jako PNG. Maks. 10 MB."
              busy={logoUpload.busy}
              disabled={!editable}
              onFiles={async (files) => {
                const [a] = await logoUpload.upload([files[0]!]);
                if (a) {
                  setLogo(a);
                  toast.success("Logo zapisane");
                  router.refresh();
                }
              }}
            />
          </div>
        </Section>

        <Section id="style" title="Styl marki" description="Styl ustawia ton tekstów i charakter szablonów. Możesz zastosować dopasowaną paletę i fonty.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(BRAND_STYLES) as BrandStyle[]).map((id) => {
              const s = BRAND_STYLES[id];
              const p = STYLE_PRESETS[id];
              const active = form.brand_style === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => set("brand_style", id)}
                  className={cn("relative flex flex-col rounded-lg border bg-surface p-4 text-left transition-all hover:border-line-strong", active ? "border-accent ring-3 ring-accent/15" : "border-line")}
                  aria-pressed={active}
                >
                  <div className="mb-3 flex gap-1">
                    {[p.colors.primary, p.colors.secondary, p.colors.accent, p.colors.background].map((col) => (
                      <span key={col} className="size-4 rounded-full border border-black/5" style={{ background: col }} />
                    ))}
                  </div>
                  <span className="text-[13.5px] font-semibold text-ink">{s.label}</span>
                  <span className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{s.description}</span>
                  {active && <Check size={16} weight="bold" className="absolute top-3 right-3 text-accent" />}
                </button>
              );
            })}
          </div>
          <div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                const p = STYLE_PRESETS[form.brand_style];
                setForm((f) => ({ ...f, colors: p.colors, heading_font: p.heading, body_font: p.body }));
                toast.message("Zastosowano paletę i fonty stylu. Zapisz, aby zachować zmiany.");
              }}
            >
              Zastosuj paletę i fonty stylu „{BRAND_STYLES[form.brand_style].label}”
            </Button>
          </div>
        </Section>

        <Section id="colors" title="Kolory" description="Szablony grafik dobierają kolor tekstu tak, żeby zawsze był czytelny.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {(Object.keys(COLOR_LABELS) as (keyof BrandColors)[]).map((k) => (
              <div key={k} className="flex flex-col gap-2">
                <label htmlFor={`color-${k}`} className="relative block aspect-[5/3] cursor-pointer overflow-hidden rounded-lg border border-line shadow-xs" style={{ background: c[k] }}>
                  <input
                    id={`color-${k}`}
                    type="color"
                    value={c[k]}
                    onChange={(e) => set("colors", { ...c, [k]: e.target.value.toUpperCase() })}
                    className="absolute inset-0 size-full cursor-pointer opacity-0"
                  />
                  <span className="absolute bottom-2 left-2 text-[11px] font-medium" style={{ color: readableOn(c[k]) }}>
                    Aa
                  </span>
                </label>
                <div>
                  <div className="text-[13px] font-medium text-ink">{COLOR_LABELS[k].label}</div>
                  <Input
                    aria-label={`Kolor ${COLOR_LABELS[k].label} (hex)`}
                    value={c[k]}
                    onChange={(e) => set("colors", { ...c, [k]: e.target.value.toUpperCase() })}
                    className="mt-1 h-8 font-mono text-[12.5px] uppercase"
                    maxLength={7}
                    aria-invalid={!!err(`colors.${k}`)}
                  />
                  {err(`colors.${k}`) ? <p className="mt-1 text-[12px] text-danger">{err(`colors.${k}`)}</p> : <p className="mt-1 text-[12px] text-ink-4">{COLOR_LABELS[k].hint}</p>}
                </div>
              </div>
            ))}
          </div>
          {lowContrast && (
            <p className="rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning">
              Kontrast tekstu na tle wynosi {contrastRatio(c.text, c.background).toFixed(1)}:1. Dla czytelności zalecamy co najmniej 4,5:1.
            </p>
          )}
        </Section>

        <Section id="type" title="Typografia" description="Wszystkie fonty mają pełne polskie znaki i licencję OFL do użytku komercyjnego.">
          <div className="grid gap-5 sm:grid-cols-2">
            {(["heading_font", "body_font"] as const).map((k) => (
              <Field key={k} label={k === "heading_font" ? "Font nagłówków" : "Font tekstu"} htmlFor={k}>
                <NativeSelect id={k} value={form[k]} onChange={(e) => set(k, e.target.value)}>
                  {(["serif", "display", "sans"] as const).map((cat) => (
                    <optgroup key={cat} label={cat === "sans" ? "Bezszeryfowe" : cat === "serif" ? "Szeryfowe" : "Wyraziste"}>
                      {FONTS.filter((f) => f.category === cat).map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.family} · {f.note}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </NativeSelect>
              </Field>
            ))}
          </div>
          <div className="rounded-lg border border-line p-5" style={{ background: c.background, color: c.text }}>
            <div className="text-[30px] leading-tight" style={{ fontFamily: fontFamily(form.heading_font), fontWeight: 500 }}>
              Jasne mieszkanie z balkonem, 54,5 m²
            </div>
            <p className="mt-2 text-[15px] leading-relaxed opacity-80" style={{ fontFamily: fontFamily(form.body_font) }}>
              Zażółć gęślą jaźń. Trzy pokoje, drugie piętro, balkon od strony podwórza. Do metra spacerem.
            </p>
          </div>
        </Section>

        <Section id="voice" title="Głos i komunikacja" description="Generator stosuje te zasady w każdym tekście. Im konkretniej, tym lepiej.">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Styl komunikacji" htmlFor="communication_style">
              <NativeSelect id="communication_style" value={form.communication_style} onChange={(e) => set("communication_style", e.target.value as FormState["communication_style"])}>
                {Object.entries(COMMUNICATION_STYLES).map(([id, s]) => (
                  <option key={id} value={id}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Zwracanie się do odbiorcy" htmlFor="address_form">
              <NativeSelect id="address_form" value={form.address_form} onChange={(e) => set("address_form", e.target.value as FormState["address_form"])}>
                {Object.entries(ADDRESS_FORMS).map(([id, l]) => (
                  <option key={id} value={id}>
                    {l}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Emoji" htmlFor="emoji_policy">
              <NativeSelect id="emoji_policy" value={form.emoji_policy} onChange={(e) => set("emoji_policy", e.target.value as FormState["emoji_policy"])}>
                <option value="none">Bez emoji</option>
                <option value="sparing">Oszczędnie (maks. 2)</option>
              </NativeSelect>
            </Field>
          </div>
          <p className="-mt-2 text-[12.5px] text-ink-3">{COMMUNICATION_STYLES[form.communication_style].hint}</p>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Charakter marki" htmlFor="personality" optional error={err("personality")} hint="Np. „Rodzinne biuro z Mokotowa, 15 lat na rynku, znamy każdą ulicę”. Wpisuj tylko prawdziwe fakty.">
              <Textarea id="personality" value={form.personality} onChange={(e) => set("personality", e.target.value)} maxLength={1000} />
            </Field>
            <Field label="Grupa docelowa" htmlFor="target_audience" optional error={err("target_audience")} hint="Kto najczęściej kupuje, sprzedaje lub wynajmuje przez biuro.">
              <Textarea id="target_audience" value={form.target_audience} onChange={(e) => set("target_audience", e.target.value)} maxLength={1000} />
            </Field>
            <Field label="Zwroty, których używamy" htmlFor="preferred_phrases" optional error={err("preferred_phrases")}>
              <Textarea id="preferred_phrases" value={form.preferred_phrases} onChange={(e) => set("preferred_phrases", e.target.value)} maxLength={1000} placeholder="Każdy zwrot w nowej linii" />
            </Field>
            <Field label="Zwroty zakazane" htmlFor="avoided_phrases" optional error={err("avoided_phrases")} hint="Kontrola jakości oznaczy tekst, który ich użyje.">
              <Textarea id="avoided_phrases" value={form.avoided_phrases} onChange={(e) => set("avoided_phrases", e.target.value)} maxLength={1000} placeholder={"oferta życia\nnie przegap"} />
            </Field>
          </div>
        </Section>

        <Section id="contact" title="Kontakt i social media" description="Dane trafiają do slajdów kontaktowych i podpisów. Puste pola pomijamy.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Telefon" htmlFor="contact_phone" optional error={err("contact_phone")}>
              <Input id="contact_phone" value={form.contact_phone} onChange={(e) => set("contact_phone", e.target.value)} autoComplete="tel" />
            </Field>
            <Field label="E-mail" htmlFor="contact_email" optional error={err("contact_email")}>
              <Input id="contact_email" type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} />
            </Field>
            <Field label="Strona www" htmlFor="website" optional error={err("website")}>
              <Input id="website" value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" />
            </Field>
            <Field label="Adres biura" htmlFor="address" optional error={err("address")}>
              <Input id="address" value={form.address} onChange={(e) => set("address", e.target.value)} />
            </Field>
            {SOCIAL_NETWORKS.map((n) => (
              <Field key={n} label={n[0]!.toUpperCase() + n.slice(1)} htmlFor={`social-${n}`} optional error={err(`socials.${n}`)}>
                <Input id={`social-${n}`} value={form.socials[n] ?? ""} onChange={(e) => set("socials", { ...form.socials, [n]: e.target.value })} placeholder="https://" />
              </Field>
            ))}
          </div>
        </Section>

        <Section id="references" title="Grafiki referencyjne" description="Przykłady materiałów, które lubisz. Pomagają zespołowi utrzymać spójność (maks. 12).">
          {refs.length > 0 && (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {refs.map((r) => (
                <div key={r.id} className="group relative aspect-square overflow-hidden rounded-md border border-line bg-sunken">
                  <img src={r.url} alt={r.label ?? "Grafika referencyjna"} className="size-full object-cover" />
                  {editable && (
                    <button
                      type="button"
                      className="absolute top-1.5 right-1.5 rounded-md bg-surface/95 p-1.5 text-danger opacity-0 shadow-xs transition-opacity group-hover:opacity-100 focus:opacity-100"
                      aria-label="Usuń grafikę"
                      onClick={async () => {
                        const res = await deleteBrandAsset(r.id);
                        if (res.ok) setRefs((x) => x.filter((y) => y.id !== r.id));
                        else toast.error(res.error);
                      }}
                    >
                      <Trash size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          <Dropzone
            multiple
            label="Dodaj grafiki referencyjne"
            hint="JPG, PNG lub WebP, do 10 MB każda"
            busy={refUpload.busy}
            disabled={!editable || refs.length >= 12}
            onFiles={async (files) => {
              const added = await refUpload.upload(files);
              if (added.length) setRefs((x) => [...x, ...added]);
            }}
          />
        </Section>
      </fieldset>

      <aside className="xl:sticky xl:top-8 xl:self-start">
        <Card className="overflow-hidden">
          <div className="p-5" style={{ background: c.background }}>
            <div className="text-[11px] font-semibold tracking-[0.14em] uppercase" style={{ color: c.primary, fontFamily: fontFamily(form.body_font) }}>
              Mieszkanie · sprzedaż
            </div>
            <div className="mt-2 text-[24px] leading-[1.1]" style={{ color: c.text, fontFamily: fontFamily(form.heading_font), fontWeight: 500 }}>
              {form.tagline || "Mieszkanie z balkonem w zielonej okolicy"}
            </div>
            <div className="mt-3 text-[13px]" style={{ color: c.text, opacity: 0.7, fontFamily: fontFamily(form.body_font) }}>
              54,5 m² · 3 pokoje · 2. piętro
            </div>
            <div className="mt-4 flex items-center justify-between">
              <span className="rounded-full px-3 py-1 text-[12px] font-semibold" style={{ background: c.primary, color: readableOn(c.primary), fontFamily: fontFamily(form.body_font) }}>
                Umów prezentację
              </span>
              {logo ? <img src={logo.url} alt="" className="h-7 max-w-24 object-contain" /> : <span className="text-[13px] font-semibold" style={{ color: c.text, fontFamily: fontFamily(form.heading_font) }}>{form.company_name}</span>}
            </div>
          </div>
          <div className="border-t border-line px-5 py-4 text-[12.5px] leading-relaxed text-ink-3">
            <span className="font-medium text-ink-2">{BRAND_STYLES[form.brand_style].label}.</span> {BRAND_STYLES[form.brand_style].voice}
          </div>
        </Card>
        {editable && (
          <div className="mt-4 flex flex-col gap-2">
            <Button size="lg" onClick={save} loading={saving} disabled={!dirty && !welcome}>
              {welcome ? "Zapisz i przejdź do pulpitu" : dirty ? "Zapisz zmiany" : "Zapisano"}
              {welcome && <ArrowRight />}
            </Button>
            {dirty && <p className="text-center text-[12.5px] text-ink-3">Masz niezapisane zmiany.</p>}
            {welcome && (
              <Link href="/dashboard" className="text-center text-[13px] text-ink-3 hover:text-ink">
                Pomiń na razie
              </Link>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
