"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash } from "@phosphor-icons/react/dist/ssr";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/field";
import { ADDRESS_FORMS, BRAND_STYLES, COMMUNICATION_STYLES, type BrandColors } from "@/core/brand/model";
import { FONTS } from "@/core/brand/fonts";
import { confidenceLevel, PROFILE_ELEMENTS, type ConfidenceMap, type ProfileElementId, type ProfileSnapshot } from "@/core/brand/profile";
import { approveBrandDraft, discardBrandDraft, saveBrandDraft, saveBrandProfile } from "@/app/(app)/brand/intelligence/actions";
import { cn } from "@/lib/utils";

export interface AssetOption {
  id: string;
  url: string;
  label: string | null;
  kind: string;
}

const LEVEL_TONE: Record<string, BadgeTone> = { confirmed: "success", likely: "accent", proposal: "warning", unknown: "muted" };

function ConfidenceBadge({ id, confidence }: { id: ProfileElementId; confidence?: ConfidenceMap }) {
  if (!confidence) return null;
  const c = confidence[id];
  const level = confidenceLevel(c?.score);
  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <Badge tone={LEVEL_TONE[level.id]} data-testid={`confidence-${id}`} title={c ? `Pewność ${Math.round(c.score * 100)}%` : undefined}>
        {level.label}
        {c && c.score > 0 ? ` · ${Math.round(c.score * 100)}%` : ""}
      </Badge>
    </div>
  );
}

const lines = (a: string[]) => a.join("\n");
const toList = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/**
 * Editor of the ten Brand Profile elements. In "draft" mode it shows detection
 * confidence and evidence and approves the draft; in "current" mode it saves a
 * new approved version of the binding profile directly.
 */
export function ProfileEditor({
  mode,
  versionId,
  initial,
  confidence,
  assets,
  editable,
}: {
  mode: "draft" | "current" | "readonly";
  versionId?: string;
  initial: ProfileSnapshot;
  confidence?: ConfidenceMap;
  assets: AssetOption[];
  editable: boolean;
}) {
  const router = useRouter();
  const [s, setS] = useState<ProfileSnapshot>(initial);
  const [text, setText] = useState({
    words: lines(initial.extended.characteristic_words),
    avoid: lines(initial.extended.avoid_words),
    ctas: lines(initial.extended.ctas),
    guidelines: lines(initial.extended.guidelines),
    differentiators: lines(initial.extended.differentiators),
  });
  const [pending, start] = useTransition();
  const ro = !editable || mode === "readonly";
  const ext = s.extended;
  const setExt = (patch: Partial<ProfileSnapshot["extended"]>) => setS((x) => ({ ...x, extended: { ...x.extended, ...patch } }));
  const setColor = (k: keyof BrandColors, v: string) => setS((x) => ({ ...x, colors: { ...x.colors, [k]: v.toUpperCase() } }));

  const payload = (): ProfileSnapshot => ({
    ...s,
    extended: {
      ...s.extended,
      characteristic_words: toList(text.words),
      avoid_words: toList(text.avoid),
      ctas: toList(text.ctas),
      guidelines: toList(text.guidelines),
      differentiators: toList(text.differentiators),
      audiences: s.extended.audiences.filter((a) => a.name.trim()),
    },
  });

  const act = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error ?? "Nie udało się zapisać.");
      toast.success(r.message ?? "Zapisano.");
      after?.();
      router.refresh();
    });

  const section = (id: ProfileElementId, children: React.ReactNode, hint?: string) => {
    const el = PROFILE_ELEMENTS.find((e) => e.id === id)!;
    const c = confidence?.[id];
    return (
      <Card className="p-5" data-testid={`element-${id}`}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-semibold">{PROFILE_ELEMENTS.indexOf(el) + 1}. {el.label}</h3>
            {hint && <p className="text-[12.5px] text-ink-3">{hint}</p>}
          </div>
          <ConfidenceBadge id={id} confidence={confidence} />
        </div>
        {c && (
          <div className="mb-3 rounded-md bg-sunken px-3 py-2 text-[12px] leading-snug text-ink-3">
            <span className="font-medium text-ink-2">Źródło: </span>
            {c.source}
            {c.evidence && c.evidence.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {c.evidence.slice(0, 3).map((e, i) => (
                  <li key={i}>„{e}”</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <fieldset disabled={ro} className="flex flex-col gap-3">{children}</fieldset>
      </Card>
    );
  };

  const images = assets.filter((a) => a.kind === "logo" || a.kind === "reference");

  return (
    <div className="flex flex-col gap-4">
      {section(
        "palette",
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(["primary", "secondary", "accent", "background", "text"] as const).map((k) => (
            <Field key={k} label={{ primary: "Główny", secondary: "Uzupełniający", accent: "Akcent", background: "Tło", text: "Tekst" }[k]} htmlFor={`pe-${k}`}>
              <div className="flex items-center gap-2">
                <input type="color" aria-label={`Kolor ${k}`} value={s.colors[k]} onChange={(e) => setColor(k, e.target.value)} className="h-9 w-10 shrink-0 cursor-pointer rounded border border-line bg-surface" />
                <Input id={`pe-${k}`} value={s.colors[k]} onChange={(e) => setColor(k, e.target.value)} maxLength={7} />
              </div>
            </Field>
          ))}
        </div>,
      )}
      {section(
        "typography",
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nagłówki" htmlFor="pe-hf">
              <NativeSelect id="pe-hf" value={s.heading_font} onChange={(e) => setS({ ...s, heading_font: e.target.value })}>
                {FONTS.map((f) => <option key={f.id} value={f.id}>{f.family}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Tekst" htmlFor="pe-bf">
              <NativeSelect id="pe-bf" value={s.body_font} onChange={(e) => setS({ ...s, body_font: e.target.value })}>
                {FONTS.map((f) => <option key={f.id} value={f.id}>{f.family}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Uwagi o typografii" htmlFor="pe-tn" optional>
            <Input id="pe-tn" value={ext.typography_notes ?? ""} maxLength={300} onChange={(e) => setExt({ typography_notes: e.target.value })} />
          </Field>
        </>,
        "Aplikacja używa fontów z licencją OFL. Font ze strony bez licencji zastępujemy podobnym.",
      )}
      {section(
        "logo",
        images.length ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Logo">
              {images.map((a) => (
                <label key={a.id} className={cn("flex w-32 cursor-pointer flex-col items-center gap-1.5 rounded-md border p-2 text-center text-[11.5px]", s.logo_asset_id === a.id ? "border-accent ring-2 ring-accent/20" : "border-line")}>
                  <input type="radio" name="pe-logo" className="sr-only" checked={s.logo_asset_id === a.id} onChange={() => setS({ ...s, logo_asset_id: a.id })} />
                  <img src={a.url} alt="" className="h-14 w-full object-contain" />
                  <span className="line-clamp-2 text-ink-3">{a.label ?? (a.kind === "logo" ? "Logo" : "Grafika")}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-col gap-1.5 text-[13px]">
              <span className="font-medium text-ink-2">Warianty logo (np. na ciemne tło)</span>
              {images.filter((a) => a.id !== s.logo_asset_id).map((a) => {
                const v = ext.logo_variants.find((x) => x.asset_id === a.id);
                return (
                  <div key={a.id} className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={!!v} onChange={(e) => setExt({ logo_variants: e.target.checked ? [...ext.logo_variants, { asset_id: a.id, label: a.label ?? "Wariant" }] : ext.logo_variants.filter((x) => x.asset_id !== a.id) })} />
                      <img src={a.url} alt="" className="h-6 w-12 object-contain" />
                    </label>
                    {v && <Input aria-label="Nazwa wariantu" className="h-8 w-56" value={v.label} maxLength={60} onChange={(e) => setExt({ logo_variants: ext.logo_variants.map((x) => (x.asset_id === a.id ? { ...x, label: e.target.value } : x)) })} />}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-[13px] text-ink-3">Brak plików logo. Prześlij logo w Brand Studio.</p>
        ),
      )}
      {section(
        "graphic_style",
        <>
          <Field label="Styl marki" htmlFor="pe-style">
            <NativeSelect id="pe-style" value={s.brand_style} onChange={(e) => setS({ ...s, brand_style: e.target.value as ProfileSnapshot["brand_style"] })}>
              {Object.entries(BRAND_STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Opis stylu graficznego" htmlFor="pe-gs" optional>
            <Textarea id="pe-gs" className="min-h-16" value={ext.graphic_style ?? ""} maxLength={500} onChange={(e) => setExt({ graphic_style: e.target.value })} />
          </Field>
          <Field label="Styl zdjęć" htmlFor="pe-ps" optional hint="Z analizy: zmierzona jasność, nasycenie i tonacja zdjęć ze strony.">
            <Textarea id="pe-ps" className="min-h-16" value={ext.photo_style ?? ""} maxLength={500} onChange={(e) => setExt({ photo_style: e.target.value })} />
          </Field>
        </>,
      )}
      {section(
        "tone",
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Styl komunikacji" htmlFor="pe-comm">
              <NativeSelect id="pe-comm" value={s.communication_style} onChange={(e) => setS({ ...s, communication_style: e.target.value as ProfileSnapshot["communication_style"] })}>
                {Object.entries(COMMUNICATION_STYLES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Forma zwracania się" htmlFor="pe-addr">
              <NativeSelect id="pe-addr" value={s.address_form} onChange={(e) => setS({ ...s, address_form: e.target.value as ProfileSnapshot["address_form"] })}>
                {Object.entries(ADDRESS_FORMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Emoji" htmlFor="pe-emoji">
              <NativeSelect id="pe-emoji" value={s.emoji_policy} onChange={(e) => setS({ ...s, emoji_policy: e.target.value as "none" | "sparing" })}>
                <option value="none">Nie używamy</option>
                <option value="sparing">Oszczędnie</option>
              </NativeSelect>
            </Field>
          </div>
          <Field label="Charakter marki" htmlFor="pe-pers" optional>
            <Textarea id="pe-pers" className="min-h-16" value={s.personality ?? ""} maxLength={1000} onChange={(e) => setS({ ...s, personality: e.target.value })} />
          </Field>
        </>,
      )}
      {section(
        "words",
        <Field label="Słowa i zwroty typowe dla marki" htmlFor="pe-words" hint="Jedno na linię.">
          <Textarea id="pe-words" value={text.words} onChange={(e) => setText({ ...text, words: e.target.value })} />
        </Field>,
      )}
      {section(
        "avoid",
        <Field label="Słowa, których marka unika" htmlFor="pe-avoid" hint="Jedno na linię. Kontrola jakości oznaczy je w każdym tekście.">
          <Textarea id="pe-avoid" value={text.avoid} onChange={(e) => setText({ ...text, avoid: e.target.value })} />
        </Field>,
      )}
      {section(
        "cta",
        <Field label="Preferowane wezwania do działania" htmlFor="pe-cta" hint="Jedno na linię. Generator wybiera to, które pasuje do celu materiału.">
          <Textarea id="pe-cta" value={text.ctas} onChange={(e) => setText({ ...text, ctas: e.target.value })} />
        </Field>,
      )}
      {section(
        "audiences",
        <div className="flex flex-col gap-2" data-testid="audiences">
          {ext.audiences.map((a, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[200px_1fr_auto]">
              <Input aria-label={`Grupa ${i + 1}: nazwa`} value={a.name} maxLength={80} onChange={(e) => setExt({ audiences: ext.audiences.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
              <Input aria-label={`Grupa ${i + 1}: opis`} value={a.description} maxLength={300} onChange={(e) => setExt({ audiences: ext.audiences.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Usuń grupę" onClick={() => setExt({ audiences: ext.audiences.filter((_, j) => j !== i) })}><Trash /></Button>
            </div>
          ))}
          {!ro && ext.audiences.length < 8 && (
            <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setExt({ audiences: [...ext.audiences, { name: "", description: "" }] })}><Plus /> Dodaj grupę</Button>
          )}
        </div>,
      )}
      {section(
        "guidelines",
        <>
          <Field label="Wytyczne marketingowe" htmlFor="pe-guide" hint="Jedna na linię.">
            <Textarea id="pe-guide" value={text.guidelines} onChange={(e) => setText({ ...text, guidelines: e.target.value })} />
          </Field>
          <Field label="Wyróżniki biura" htmlFor="pe-diff" hint="Jeden na linię. Tylko prawdziwe, sprawdzalne informacje.">
            <Textarea id="pe-diff" className="min-h-16" value={text.differentiators} onChange={(e) => setText({ ...text, differentiators: e.target.value })} />
          </Field>
          <Field label="Struktura komunikatów" htmlFor="pe-msg" optional>
            <Input id="pe-msg" value={ext.message_structure ?? ""} maxLength={500} onChange={(e) => setExt({ message_structure: e.target.value })} />
          </Field>
          {ext.offer_presentation && <p className="text-[12.5px] text-ink-3">{ext.offer_presentation}</p>}
        </>,
      )}

      {!ro && (
        <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-t border-line bg-canvas/95 px-1 py-3 backdrop-blur">
          {mode === "draft" && versionId ? (
            <>
              <Button loading={pending} onClick={() => act(() => approveBrandDraft(versionId, payload()), () => router.push("/brand/history"))}>Zatwierdź profil</Button>
              <Button variant="secondary" disabled={pending} onClick={() => act(() => saveBrandDraft(versionId, payload()))}>Zapisz szkic</Button>
              <Button variant="danger-ghost" disabled={pending} onClick={() => act(() => discardBrandDraft(versionId), () => router.push("/brand/intelligence"))}>Odrzuć propozycję</Button>
              <span className="text-[12.5px] text-ink-3">Do czasu zatwierdzenia materiały korzystają z obecnego profilu.</span>
            </>
          ) : (
            <Button loading={pending} onClick={() => act(() => saveBrandProfile(payload()))}>Zapisz profil marki</Button>
          )}
        </div>
      )}
    </div>
  );
}
