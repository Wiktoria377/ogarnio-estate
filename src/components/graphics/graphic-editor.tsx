"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowCounterClockwise, Crop, ArrowDown, ArrowLeft, ArrowUUpLeft, ArrowUUpRight, ArrowUp, Check, Copy, CopySimple, Cursor, DotsThree, DownloadSimple, Eye, EyeSlash, FilePdf, FileZip, FloppyDisk, Image as ImageIcon, Plus, Sparkle, Trash, Warning,
} from "@phosphor-icons/react/dist/ssr";
import { Button, Spinner } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/field";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { CREATIVE_DIRECTIONS, CREATIVE_DIRECTION_IDS, type CreativeDirection } from "@/core/creative/composition";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuTrigger } from "@/components/ui/menu";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QaCheckPanel } from "@/components/qa/qa-check-panel";
import type { QaReport } from "@/core/qa/types";
import { ConfirmDelete } from "@/components/common/confirm-delete";
import { saveDesignTemplate, saveGraphic } from "@/app/(app)/graphics/actions";
import { SlideCanvas, useSlideRender } from "@/components/graphics/slide-canvas";
import { deleteItem, duplicateItem, restoreVersion, updateItemMeta } from "@/app/(app)/library/actions";
import {
  FORMATS, MAX_SLIDES, SLIDE_KINDS, TEMPLATES, TEMPLATE_CATEGORIES, defaultSlides, elementLabel, slotsFor, type ElementOverride, type FormatId, type GraphicDesign, type Slide, type SlideKind, type TemplateCategory, type TemplateId,
} from "@/core/graphics/design";
import { FONTS } from "@/core/brand/fonts";
import type { BrandColors } from "@/core/brand/model";
import { GOALS, type Goal } from "@/core/marketing-engine/taxonomy";
import { applyFactTexts } from "@/verticals/real-estate/graphics";
import { cn, formatRelative } from "@/lib/utils";
import { t } from "@/i18n/pl";

interface Photo { id: string; url: string; isVisualization: boolean; caption: string | null }
interface Props {
  item: { id: string; title: string; status: "draft" | "review" | "ready"; propertyId: string | null; propertyTitle: string | null; updatedAt: string; version: number };
  design: GraphicDesign;
  photos: Photo[];
  facts: Record<SlideKind, Record<string, string>>;
  brandColors: BrandColors;
  hasLogo: boolean;
  versions: { version: number; source: string; operation: string | null; createdAt: string }[];
  initialSlide: number;
  editable: boolean;
  aiConfigured: boolean;
  /** Other graphics of the same creative variant set. */
  variants?: { id: string; label: string; note: string }[];
  qa?: { report: QaReport; stale: boolean } | null;
}

const SOURCE_LABEL: Record<string, string> = { ai_generate: "AI", ai_refine: "Poprawka AI", manual: "Ręcznie", duplicate: "Duplikat", template: "Szablon" };
const COLOR_LABEL: Record<keyof BrandColors, string> = { primary: "Główny", secondary: "Uzupełniający", accent: "Akcent", background: "Tło", text: "Tekst" };

function maxPhotos(kind: SlideKind, template: TemplateId) {
  return kind === "cover" ? TEMPLATES[template].photos : SLIDE_KINDS[kind].photos;
}

/** Live PNG preview of one slide, rendered by the same server code as the export. */
function usePreview(design: GraphicDesign, slide: number, width: number, delay: number) {
  const [state, setState] = useState<{ url: string | null; warnings: string[]; loading: boolean; error: string | null }>({ url: null, warnings: [], loading: true, error: null });
  const payload = JSON.stringify({ design, slide, width });
  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/graphics/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, signal: ctrl.signal });
        if (!res.ok) {
          const j = await res.json().catch(() => null);
          throw new Error(j?.error ?? "Nie udało się wygenerować podglądu.");
        }
        const blob = await res.blob();
        let warnings: string[] = [];
        try {
          warnings = JSON.parse(decodeURIComponent(res.headers.get("X-Render-Warnings") ?? "[]"));
        } catch {
          /* header is optional */
        }
        const url = URL.createObjectURL(blob);
        setState((s) => {
          if (s.url) URL.revokeObjectURL(s.url);
          return { url, warnings, loading: false, error: null };
        });
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : "Błąd podglądu." }));
      }
    }, delay);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [payload, delay]);
  return state;
}

function SlideThumb({ design, index, active, onClick }: { design: GraphicDesign; index: number; active: boolean; onClick: () => void }) {
  const p = usePreview(design, index, 240, 900);
  const f = FORMATS[design.format];
  return (
    <button type="button" onClick={onClick} aria-label={`Slajd ${index + 1}: ${SLIDE_KINDS[design.slides[index]!.kind].label}`} aria-current={active} className="group w-20 shrink-0 text-left">
      <span className={cn("relative block overflow-hidden rounded-md border bg-sunken", active ? "border-accent ring-3 ring-accent/20" : "border-line group-hover:border-line-strong")} style={{ aspectRatio: `${f.w} / ${f.h}` }}>
        {p.url && <img src={p.url} alt="" className="size-full object-cover" />}
        {p.loading && !p.url && <span className="skeleton absolute inset-0" />}
        {p.warnings.length > 0 && <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-warning text-white"><Warning size={10} weight="bold" /></span>}
      </span>
      <span className="mt-1 block truncate text-[11.5px] text-ink-3">{index + 1}. {SLIDE_KINDS[design.slides[index]!.kind].label}</span>
    </button>
  );
}

export function GraphicEditor({ item, design: initial, photos, facts, brandColors, hasLogo, versions, initialSlide, editable, aiConfigured, variants = [], qa = null }: Props) {
  const router = useRouter();
  const [design, setDesign] = useState<GraphicDesign>(initial);
  const [saved, setSaved] = useState(() => JSON.stringify(initial));
  const [active, setActiveRaw] = useState(initialSlide);
  const [title, setTitle] = useState(item.title);
  const [status, setStatus] = useState(item.status);
  const [saving, startSave] = useTransition();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [varOpen, setVarOpen] = useState(false);
  const [varBusy, setVarBusy] = useState(false);
  const [varDirs, setVarDirs] = useState<CreativeDirection[]>([...CREATIVE_DIRECTION_IDS]);
  const [createdVariants, setCreatedVariants] = useState<{ id: string; direction: CreativeDirection; template: TemplateId; reasons: string[] }[]>([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [brief, setBrief] = useState("");
  const [goal, setGoal] = useState<Goal>(item.propertyId ? "sales" : "trust");
  const [aiNotes, setAiNotes] = useState<{ warnings: string[]; gaps: string[] } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState("");
  const [tplBusy, setTplBusy] = useState(false);
  const dirty = JSON.stringify(design) !== saved;
  const f = FORMATS[design.format];
  const slideIndex = Math.min(active, design.slides.length - 1);
  const slide = design.slides[slideIndex]!;
  const preview = useSlideRender(design, slideIndex, 300);
  const photoMap = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  const colors = { ...brandColors, ...design.colors };
  // Versions created by this editor keep local state; any other new version
  // (restore, another tab) replaces it with the server copy.
  const ownVersion = useRef<number | null>(null);
  useEffect(() => {
    if (item.version === ownVersion.current) return;
    setDesign(initial);
    setSaved(JSON.stringify(initial));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.version]);

  const setActive = useCallback((i: number) => {
    setActiveRaw(i);
    const url = new URL(window.location.href);
    url.searchParams.set("slide", String(i));
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // Undo/redo: snapshots of the design; quick successive edits (typing) share one step.
  const past = useRef<GraphicDesign[]>([]);
  const future = useRef<GraphicDesign[]>([]);
  const lastPush = useRef<{ at: number; key: string | null }>({ at: 0, key: null });
  const [, bump] = useState(0);
  const update = useCallback((fn: (d: GraphicDesign) => GraphicDesign, coalesce: string | null = null) => {
    setDesign((d) => {
      const next = fn(d);
      if (next === d) return d;
      const now = Date.now();
      const merge = coalesce !== null && coalesce === lastPush.current.key && now - lastPush.current.at < 1000;
      if (!merge) past.current = [...past.current.slice(-49), d];
      lastPush.current = { at: now, key: coalesce };
      future.current = [];
      return next;
    });
    bump((n) => n + 1);
  }, []);
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    setDesign((d) => {
      future.current = [d, ...future.current].slice(0, 50);
      return prev;
    });
    lastPush.current = { at: 0, key: null };
    bump((n) => n + 1);
  }, []);
  const redo = useCallback(() => {
    const next = future.current.shift();
    if (!next) return;
    setDesign((d) => {
      past.current = [...past.current, d];
      return next;
    });
    lastPush.current = { at: 0, key: null };
    bump((n) => n + 1);
  }, []);
  useEffect(() => {
    if (!editable) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [editable, undo, redo]);

  const patch = (p: Partial<GraphicDesign>) => update((d) => ({ ...d, ...p }));
  const patchSlide = (i: number, s: Partial<Slide>) => update((d) => ({ ...d, slides: d.slides.map((x, j) => (j === i ? { ...x, ...s } : x)) }));
  const setText = (key: string, value: string) => update((d) => ({ ...d, slides: d.slides.map((x, j) => (j === slideIndex ? { ...x, texts: { ...x.texts, [key]: value } } : x)) }), `text:${slideIndex}:${key}`);

  /** Merges an element override; undefined fields are removed, empty overrides dropped. */
  const setOverride = (key: string, o: Partial<Record<keyof ElementOverride, number | string | boolean | undefined>>, coalesce: string | null = null) =>
    update((d) => ({
      ...d,
      slides: d.slides.map((x, j) => {
        if (j !== slideIndex) return x;
        const merged: Record<string, unknown> = { ...(x.overrides?.[key] ?? {}), ...o };
        for (const k of Object.keys(merged)) if (merged[k] === undefined) delete merged[k];
        const overrides = { ...(x.overrides ?? {}) };
        if (Object.keys(merged).length) overrides[key] = merged as ElementOverride;
        else delete overrides[key];
        return { ...x, overrides };
      }),
    }), coalesce);
  const ov = (key: string): ElementOverride => slide.overrides?.[key] ?? {};
  const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const textKeys = useMemo(() => new Set<string>(slotsFor(slide.kind).map((s) => s.key)), [slide.kind]);
  const selectedEl = preview.layout.find((e) => e.key === selected) ?? null;
  const hiddenKeys = Object.entries(slide.overrides ?? {}).filter(([, o]) => o.hidden).map(([k]) => k);
  useEffect(() => setSelected(null), [slideIndex]);

  async function save(operation?: string, d: GraphicDesign = design): Promise<boolean> {
    const r = await saveGraphic(item.id, d, operation);
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    ownVersion.current = r.data.version;
    setSaved(JSON.stringify(d));
    return true;
  }

  function onSave() {
    startSave(async () => {
      if (await save()) {
        toast.success("Zapisano nową wersję grafiki");
        router.refresh();
      }
    });
  }

  async function download(kind: "png" | "jpg" | "pdf" | "zip-png" | "zip-jpg") {
    setDownloading(kind);
    try {
      if (dirty && editable && !(await save("Zapis przed pobraniem"))) return;
      const base = `/api/graphics/${item.id}/export`;
      const href = kind === "pdf" ? `${base}?format=pdf` : kind.startsWith("zip") ? `${base}?format=zip&as=${kind.slice(4)}` : `${base}?format=${kind}&slide=${slideIndex}`;
      const res = await fetch(href);
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? "Nie udało się przygotować pliku.");
      }
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? `grafika.${kind.startsWith("zip") ? "zip" : kind}`;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await res.blob());
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      if (dirty) router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się pobrać pliku.");
    } finally {
      setDownloading(null);
    }
  }

  function changeFormat(format: FormatId) {
    if (format === design.format) return;
    if (FORMATS[format].multi && !FORMATS[design.format].multi) {
      const rest = applyFactTexts(defaultSlides(format, photos.map((p) => p.id)).slice(1), facts);
      patch({ format, slides: [design.slides[0]!, ...rest].slice(0, MAX_SLIDES) });
    } else if (!FORMATS[format].multi && design.slides.length > 1) {
      if (!confirm("Ten format ma jeden slajd. Zostawimy tylko okładkę, a pozostałe slajdy usuniemy z projektu (poprzednia wersja zostanie w historii). Kontynuować?")) return;
      patch({ format, slides: [design.slides.find((s) => s.kind === "cover") ?? design.slides[0]!] });
      setActive(0);
    } else patch({ format });
  }

  function addSlide(kind: SlideKind) {
    if (design.slides.length >= MAX_SLIDES) return;
    const used = new Set(design.slides.flatMap((s) => s.photoIds));
    const free = photos.find((p) => !used.has(p.id)) ?? photos[0];
    const s = applyFactTexts([{ kind, photoIds: SLIDE_KINDS[kind].photos && free ? [free.id] : [], texts: {}, overrides: {} }], facts)[0]!;
    const at = active + 1;
    patch({ slides: [...design.slides.slice(0, at), s, ...design.slides.slice(at)] });
    setActive(at);
  }

  function moveSlide(dir: -1 | 1) {
    const to = active + dir;
    if (to < 0 || to >= design.slides.length) return;
    const slides = [...design.slides];
    [slides[active], slides[to]] = [slides[to]!, slides[active]!];
    patch({ slides });
    setActive(to);
  }

  function duplicateSlide() {
    if (design.slides.length >= MAX_SLIDES) return toast.info(`Karuzela może mieć maksymalnie ${MAX_SLIDES} slajdów.`);
    const copy = JSON.parse(JSON.stringify(slide)) as Slide;
    const at = slideIndex + 1;
    patch({ slides: [...design.slides.slice(0, at), copy, ...design.slides.slice(at)] });
    setActive(at);
  }

  function swapPhoto(n: number, id: string) {
    const ids = [...slide.photoIds];
    while (ids.length < n) ids.push(ids[0] ?? id);
    ids[n] = id;
    const overrides = { ...(slide.overrides ?? {}) };
    const o = { ...(overrides[`photo${n}`] ?? {}) };
    delete o.zoom;
    delete o.fx;
    delete o.fy;
    if (Object.keys(o).length) overrides[`photo${n}`] = o;
    else delete overrides[`photo${n}`];
    patchSlide(slideIndex, { photoIds: ids.slice(0, 3), overrides });
  }

  async function saveTemplate() {
    setTplBusy(true);
    const r = await saveDesignTemplate(tplName, design);
    setTplBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message ?? "Zapisano szablon");
    setTplOpen(false);
    setTplName("");
  }

  function removeSlide() {
    if (design.slides.length <= 1) return;
    patch({ slides: design.slides.filter((_, i) => i !== active) });
    setActive(Math.max(0, active - 1));
  }

  function changeKind(kind: SlideKind) {
    const limit = maxPhotos(kind, design.template);
    const fallback = photos[0] ? [photos[0].id] : [];
    const photoIds = limit === 0 ? [] : (slide.photoIds.length ? slide.photoIds : fallback).slice(0, limit);
    // Keep the headline across kinds, drop slot texts the new kind does not have.
    const keys = new Set<string>(slotsFor(kind).map((s) => s.key));
    const texts = Object.fromEntries(Object.entries(slide.texts).filter(([k]) => keys.has(k)));
    patchSlide(active, applyFactTexts([{ kind, photoIds, texts, overrides: {} }], facts)[0]!);
  }

  function togglePhoto(id: string) {
    const limit = maxPhotos(slide.kind, design.template);
    const has = slide.photoIds.includes(id);
    if (has) patchSlide(active, { photoIds: slide.photoIds.filter((x) => x !== id) });
    else if (limit === 1) patchSlide(active, { photoIds: [id] });
    else if (slide.photoIds.length < limit) patchSlide(active, { photoIds: [...slide.photoIds, id] });
    else toast.info(`Ten układ mieści ${limit} zdjęcia. Odznacz jedno, aby wybrać inne.`);
  }

  async function runAi() {
    setAiBusy(true);
    setAiNotes(null);
    try {
      const res = await fetch("/api/ai/graphic-copy", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ design, brief, goal }) });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Nie udało się wygenerować tekstów.");
      const out = j as { slides: Record<string, string>[]; caption: string; warnings: string[]; gaps: string[] };
      const next: GraphicDesign = {
        ...design,
        caption: out.caption || design.caption,
        slides: design.slides.map((s, i) => {
          const texts = { ...s.texts };
          for (const slot of SLIDE_KINDS[s.kind].slots) if (slot.source === "ai" && out.slides[i]?.[slot.key] !== undefined) texts[slot.key] = out.slides[i]![slot.key]!;
          return { ...s, texts };
        }),
      };
      setDesign(next);
      setAiOpen(false);
      setAiNotes({ warnings: out.warnings ?? [], gaps: out.gaps ?? [] });
      if (await save("Teksty z AI", next)) {
        toast.success("Wstawiono teksty z AI i zapisano wersję. Dane z oferty zostały bez zmian.");
        router.refresh();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się wygenerować tekstów.");
    } finally {
      setAiBusy(false);
    }
  }

  const slotsList = slotsFor(slide.kind);
  const limit = maxPhotos(slide.kind, design.template);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <Link href="/graphics" className="mb-2 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 hover:text-ink"><ArrowLeft size={13} /> Grafiki</Link>
          <input
            value={title}
            disabled={!editable}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={async () => {
              if (title.trim() && title !== item.title) {
                const r = await updateItemMeta(item.id, { title });
                if (!r.ok) toast.error(r.error);
              }
            }}
            className="-mx-1 w-full rounded-md bg-transparent px-1 text-[24px] font-semibold text-ink outline-none hover:bg-sunken/70 focus:bg-surface focus:ring-3 focus:ring-accent/15"
            aria-label="Tytuł grafiki"
            maxLength={200}
          />
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
            <span>{f.label} · {f.size}</span>
            {item.propertyTitle && <span>· <Link href={`/properties/${item.propertyId}`} className="hover:text-ink hover:underline">{item.propertyTitle}</Link></span>}
            <span suppressHydrationWarning>· wersja {item.version}, {formatRelative(item.updatedAt)}</span>
            {dirty && <Badge tone="warning" dot>Niezapisane zmiany</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect
            aria-label="Status"
            value={status}
            disabled={!editable}
            onChange={async (e) => {
              const next = e.target.value as typeof status;
              setStatus(next);
              const r = await updateItemMeta(item.id, { status: next });
              if (r.ok) toast.success(`Status: ${t.status[next]}`);
              else toast.error(r.error);
            }}
            className="w-40"
          >
            {(["draft", "review", "ready"] as const).map((s) => <option key={s} value={s}>{t.status[s]}</option>)}
          </NativeSelect>
          <Menu>
            <MenuTrigger asChild>
              <Button variant="secondary" loading={!!downloading}><DownloadSimple /> Pobierz</Button>
            </MenuTrigger>
            <MenuContent>
              <MenuLabel>Pełna rozdzielczość {f.w}×{f.h}</MenuLabel>
              <MenuItem onSelect={() => void download("png")}><ImageIcon /> {design.slides.length > 1 ? `Slajd ${slideIndex + 1} (PNG)` : "Grafika (PNG)"}</MenuItem>
              <MenuItem onSelect={() => void download("jpg")}><ImageIcon /> {design.slides.length > 1 ? `Slajd ${slideIndex + 1} (JPG)` : "Grafika (JPG)"}</MenuItem>
              <MenuItem onSelect={() => void download("pdf")}><FilePdf /> {design.slides.length > 1 ? "Wszystkie slajdy (PDF)" : "Grafika (PDF)"}</MenuItem>
              {design.slides.length > 1 && <MenuItem onSelect={() => void download("zip-png")}><FileZip /> Wszystkie slajdy (ZIP, PNG)</MenuItem>}
              {design.slides.length > 1 && <MenuItem onSelect={() => void download("zip-jpg")}><FileZip /> Wszystkie slajdy (ZIP, JPG)</MenuItem>}
            </MenuContent>
          </Menu>
          {editable && (
            <div className="flex">
              <Button variant="ghost" size="icon" aria-label="Cofnij (Ctrl+Z)" title="Cofnij (Ctrl+Z)" disabled={!past.current.length} onClick={undo}><ArrowUUpLeft /></Button>
              <Button variant="ghost" size="icon" aria-label="Ponów (Ctrl+Shift+Z)" title="Ponów (Ctrl+Shift+Z)" disabled={!future.current.length} onClick={redo}><ArrowUUpRight /></Button>
            </div>
          )}
          {editable && <Button onClick={onSave} loading={saving} disabled={!dirty}><Check /> Zapisz</Button>}
          {editable && (
            <Menu>
              <MenuTrigger asChild><Button variant="secondary" size="icon" aria-label="Więcej"><DotsThree size={18} weight="bold" /></Button></MenuTrigger>
              <MenuContent>
                <MenuItem onSelect={() => void duplicateItem(item.id)}><Copy /> Duplikuj grafikę</MenuItem>
                <MenuItem onSelect={() => setTplOpen(true)}><FloppyDisk /> Zapisz jako szablon biura</MenuItem>
                {item.propertyId && (
                  <MenuItem onSelect={() => { patch({ slides: applyFactTexts(design.slides, facts, true) }); toast.success("Odświeżono dane z oferty. Zapisz, aby zachować."); }}>
                    <ArrowCounterClockwise /> Odśwież dane z oferty
                  </MenuItem>
                )}
              </MenuContent>
            </Menu>
          )}
          {editable && <ConfirmDelete title="Usunąć grafikę?" description="Usuniemy grafikę ze wszystkimi wersjami. Zdjęcia oferty zostaną." action={() => deleteItem(item.id)} onDone={() => router.push("/graphics")} trigger={<Button variant="ghost" size="icon" aria-label="Usuń grafikę"><Trash /></Button>} />}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="flex flex-col items-center gap-4 p-4 pt-8 sm:p-6 sm:pt-9">
            <SlideCanvas
              render={preview}
              alt={`Podgląd slajdu ${slideIndex + 1}`}
              editable={editable}
              selected={selected}
              editableTextKeys={textKeys}
              textOf={(k) => slide.texts[k] ?? ""}
              scaleOf={(k) => ov(k).scale ?? 1}
              onSelect={setSelected}
              onMove={(k, dx, dy) => setOverride(k, { dx: clampNum((ov(k).dx ?? 0) + dx, -1920, 1920), dy: clampNum((ov(k).dy ?? 0) + dy, -1920, 1920) })}
              onNudge={(k, dx, dy) => setOverride(k, { dx: clampNum((ov(k).dx ?? 0) + dx, -1920, 1920), dy: clampNum((ov(k).dy ?? 0) + dy, -1920, 1920) })}
              onScale={(k, sc) => setOverride(k, { scale: sc === 1 ? undefined : sc })}
              onPan={(k, fdx, fdy) => setOverride(k, { fx: clampNum((ov(k).fx ?? 0.5) + fdx, 0, 1), fy: clampNum((ov(k).fy ?? 0.5) + fdy, 0, 1) })}
              onText={setText}
              onHide={(k) => {
                setOverride(k, { hidden: true });
                setSelected(null);
              }}
            />
            {editable && !selectedEl && (
              <p className="flex items-center gap-1.5 text-[12.5px] text-ink-3"><Cursor size={14} /> Kliknij element na grafice, aby go przesunąć, zmienić rozmiar, kolor lub czcionkę. Dwuklik edytuje tekst.</p>
            )}
            {editable && selectedEl && (
              <ElementPanel
                el={selectedEl}
                o={ov(selectedEl.key)}
                isText={textKeys.has(selectedEl.key) || selectedEl.key === "badge"}
                photos={photos}
                currentPhoto={selectedEl.kind === "photo" ? (slide.photoIds[Number(selectedEl.key.slice(5))] ?? slide.photoIds[0] ?? null) : null}
                onChange={(o) => setOverride(selectedEl.key, o, `ov:${slideIndex}:${selectedEl.key}:${Object.keys(o).join(",")}`)}
                onHide={() => {
                  setOverride(selectedEl.key, { hidden: true });
                  setSelected(null);
                }}
                onReset={() => setOverride(selectedEl.key, { dx: undefined, dy: undefined, scale: undefined, color: undefined, font: undefined, zoom: undefined, fx: undefined, fy: undefined })}
                onSwap={(id) => swapPhoto(Number(selectedEl.key.slice(5)), id)}
                onProposeCrop={async () => {
                  const photoId = slide.photoIds[Number(selectedEl.key.slice(5))] ?? slide.photoIds[0];
                  if (!photoId) return;
                  const res = await fetch("/api/graphics/crop", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photoId, w: selectedEl.w, h: selectedEl.h }) });
                  const j = await res.json().catch(() => null);
                  if (!res.ok) return void toast.error(j?.error ?? "Nie udało się zaproponować kadru.");
                  setOverride(selectedEl.key, { zoom: undefined, fx: j.fx, fy: j.fy });
                  toast.success(`Zaproponowany kadr: widać ok. ${Math.round(j.kept * 100)}% zdjęcia. Oryginał zdjęcia jest bez zmian.`);
                }}
                onRestoreCrop={() => setOverride(selectedEl.key, { zoom: undefined, fx: 0.5, fy: 0.5 })}
                onClose={() => setSelected(null)}
              />
            )}
            {editable && hiddenKeys.length > 0 && (
              <div className="flex w-full flex-wrap items-center gap-2 text-[12.5px]">
                <span className="text-ink-3">Ukryte na tym slajdzie:</span>
                {hiddenKeys.map((k) => (
                  <button key={k} type="button" onClick={() => setOverride(k, { hidden: undefined })} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-ink-2 hover:border-accent hover:text-accent-ink">
                    <Eye size={12} /> {elementLabel(slide.kind, k)}
                  </button>
                ))}
              </div>
            )}
            {preview.warnings.length > 0 && (
              <div role="status" className="w-full rounded-md border border-warning/20 bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
                <p className="flex items-center gap-1.5 font-medium"><Warning size={14} /> Uwaga na tym slajdzie</p>
                <ul className="mt-1 list-disc pl-5">{preview.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
              </div>
            )}
          </Card>
          {FORMATS[design.format].multi && (
            <div className="flex items-start gap-3 overflow-x-auto pb-2">
              {design.slides.map((_, i) => <SlideThumb key={i} design={design} index={i} active={i === active} onClick={() => setActive(i)} />)}
              {editable && design.slides.length < MAX_SLIDES && (
                <Menu>
                  <MenuTrigger asChild>
                    <button type="button" className="flex w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line-strong text-[11.5px] text-ink-3 hover:border-accent hover:text-accent" style={{ aspectRatio: `${f.w} / ${f.h}` }}>
                      <Plus size={16} /> Dodaj
                    </button>
                  </MenuTrigger>
                  <MenuContent align="start">
                    <MenuLabel>Nowy slajd po bieżącym</MenuLabel>
                    {(Object.keys(SLIDE_KINDS) as SlideKind[]).map((k) => <MenuItem key={k} onSelect={() => addSlide(k)}>{SLIDE_KINDS[k].label}</MenuItem>)}
                  </MenuContent>
                </Menu>
              )}
            </div>
          )}
        </div>

        <Card className="p-0">
          <Tabs defaultValue="content">
            <div className="border-b border-line px-4 pt-3">
              <TabsList>
                <TabsTrigger value="content">Treść</TabsTrigger>
                <TabsTrigger value="look">Wygląd</TabsTrigger>
                <TabsTrigger value="caption">Opis posta</TabsTrigger>
                <TabsTrigger value="versions">Wersje</TabsTrigger>
                <TabsTrigger value="qa">Jakość</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="content" className="flex flex-col gap-5 p-4">
              {editable && (
                <div className="rounded-lg border border-line p-3" data-testid="variants-box">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12.5px] leading-snug text-ink-2">Warianty kreatywne: minimalistyczny, premium, dynamiczny, ekspercki i sprzedażowy. Te same zdjęcia i fakty, kolory i fonty marki.</p>
                    <Button size="sm" variant="secondary" onClick={() => setVarOpen(true)} disabled={!aiConfigured || dirty} title={dirty ? "Najpierw zapisz zmiany" : aiConfigured ? undefined : "Wymaga konfiguracji ANTHROPIC_API_KEY"}>
                      <CopySimple /> Warianty
                    </Button>
                  </div>
                  {(createdVariants.length > 0 || variants.length > 0) && (
                    <ul className="mt-2 flex flex-col gap-1 text-[12.5px]" data-testid="variant-links">
                      {(createdVariants.length ? createdVariants.map((v) => ({ id: v.id, label: CREATIVE_DIRECTIONS[v.direction].label, note: `${TEMPLATES[v.template].label}: ${v.reasons.slice(0, 2).join(", ")}` })) : variants).map((v) => (
                        <li key={v.id}><Link href={`/graphics/${v.id}`} className="font-medium text-accent hover:underline">{v.label}</Link> <span className="text-ink-3">{v.note}</span></li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {editable && (
                <div className="rounded-lg border border-accent/15 bg-accent-soft/50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[12.5px] leading-snug text-ink-2">AI pisze tylko pola oznaczone jako „AI”. Cena, metraż i kontakt pochodzą z danych.</p>
                    <Button size="sm" variant="soft" onClick={() => setAiOpen(true)} disabled={!aiConfigured || aiBusy} title={aiConfigured ? undefined : "Wymaga konfiguracji ANTHROPIC_API_KEY"}>
                      <Sparkle /> Teksty z AI
                    </Button>
                  </div>
                  {!aiConfigured && <p className="mt-2 text-[12px] text-warning">Generowanie wymaga konfiguracji klucza ANTHROPIC_API_KEY na serwerze.</p>}
                  {aiNotes && (aiNotes.warnings.length > 0 || aiNotes.gaps.length > 0) && (
                    <ul className="mt-2 list-disc pl-5 text-[12px] text-ink-3">
                      {[...aiNotes.warnings, ...aiNotes.gaps].map((w) => <li key={w}>{w}</li>)}
                    </ul>
                  )}
                </div>
              )}

              {FORMATS[design.format].multi && (
                <div className="flex flex-wrap items-end gap-2">
                  <div className="min-w-40 flex-1">
                    <Label htmlFor="slide-kind">Slajd {active + 1} z {design.slides.length}</Label>
                    <NativeSelect id="slide-kind" value={slide.kind} disabled={!editable} onChange={(e) => changeKind(e.target.value as SlideKind)} className="mt-1.5">
                      {(Object.keys(SLIDE_KINDS) as SlideKind[]).map((k) => <option key={k} value={k}>{SLIDE_KINDS[k].label}</option>)}
                    </NativeSelect>
                  </div>
                  {editable && (
                    <div className="flex gap-1">
                      <Button variant="secondary" size="icon" aria-label="Przesuń slajd w lewo" disabled={active === 0} onClick={() => moveSlide(-1)}><ArrowUp className="-rotate-90" /></Button>
                      <Button variant="secondary" size="icon" aria-label="Przesuń slajd w prawo" disabled={active === design.slides.length - 1} onClick={() => moveSlide(1)}><ArrowDown className="-rotate-90" /></Button>
                      <Button variant="secondary" size="icon" aria-label="Duplikuj slajd" title="Duplikuj slajd" disabled={design.slides.length >= MAX_SLIDES} onClick={duplicateSlide}><CopySimple /></Button>
                      <Button variant="secondary" size="icon" aria-label="Usuń slajd" disabled={design.slides.length <= 1} onClick={removeSlide}><Trash /></Button>
                    </div>
                  )}
                </div>
              )}

              {limit > 0 && (
                <div>
                  <p className="mb-2 text-[13px] font-medium text-ink">Zdjęcie {limit > 1 && <span className="font-normal text-ink-3">(maks. {limit}, kolejność wyboru = kolejność na grafice)</span>}</p>
                  {photos.length === 0 ? (
                    <p className="rounded-md bg-sunken px-3 py-2 text-[12.5px] text-ink-3">{item.propertyId ? "Ta oferta nie ma zdjęć. Dodaj je w karcie nieruchomości." : "Grafika wizerunkowa bez oferty używa koloru marki zamiast zdjęcia."}</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {photos.map((p) => {
                        const idx = slide.photoIds.indexOf(p.id);
                        return (
                          <button key={p.id} type="button" disabled={!editable} onClick={() => togglePhoto(p.id)} aria-pressed={idx >= 0} aria-label={`Zdjęcie${p.caption ? `: ${p.caption}` : ""}`} className={cn("relative aspect-square overflow-hidden rounded-md border-2", idx >= 0 ? "border-accent" : "border-transparent hover:border-line-strong")}>
                            <img src={p.url} alt="" className="size-full object-cover" loading="lazy" />
                            {idx >= 0 && <span className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-white">{limit > 1 ? idx + 1 : <Check size={11} weight="bold" />}</span>}
                            {p.isVisualization && <span className="absolute bottom-1 left-1 rounded bg-ink/70 px-1 text-[10px] text-white">Wiz.</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {slide.photoIds.some((id) => !photoMap.has(id)) && <p className="mt-2 text-[12px] text-warning">Część wybranych zdjęć została usunięta z oferty. Wybierz inne.</p>}
                </div>
              )}

              <div className="flex flex-col gap-4">
                {slotsList.map((s) => {
                  const value = slide.texts[s.key] ?? "";
                  const over = value.length > s.maxChars;
                  return (
                    <div key={s.key} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor={`slot-${s.key}`} className="flex items-center gap-2 text-[13px] font-medium text-ink">
                          {s.label}
                          {s.source === "fact" ? <Badge tone="muted">Z danych</Badge> : <Badge tone="accent">AI</Badge>}
                        </label>
                        <span className={cn("text-[11.5px] tabular-nums", over ? "text-warning" : "text-ink-4")}>{value.length}/{s.maxChars}</span>
                      </div>
                      {s.multiline ? (
                        <Textarea id={`slot-${s.key}`} value={value} disabled={!editable} rows={s.key === "rows" ? 6 : 3} maxLength={400} onChange={(e) => setText(s.key, e.target.value)} placeholder={s.source === "fact" ? "Brak danych w ofercie" : "Pusty (pole zostanie pominięte)"} />
                      ) : (
                        <Input id={`slot-${s.key}`} value={value} disabled={!editable} maxLength={400} onChange={(e) => setText(s.key, e.target.value)} placeholder={s.source === "fact" ? "Brak danych w ofercie" : "Pusty (pole zostanie pominięte)"} />
                      )}
                      {over && <p className="text-[12px] text-warning">Tekst jest dłuższy niż zalecany. Na grafice zmniejszymy czcionkę, a jeśli to nie wystarczy, skrócimy go wielokropkiem.</p>}
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="look" className="flex flex-col gap-5 p-4">
              <div>
                <Label htmlFor="g-format">Format</Label>
                <NativeSelect id="g-format" className="mt-1.5" value={design.format} disabled={!editable} onChange={(e) => changeFormat(e.target.value as FormatId)}>
                  {(Object.keys(FORMATS) as FormatId[]).map((k) => <option key={k} value={k}>{FORMATS[k].label} ({FORMATS[k].size})</option>)}
                </NativeSelect>
              </div>
              <div>
                <p className="mb-2 text-[13px] font-medium text-ink">Szablon</p>
                <div className="flex flex-col gap-3">
                  {(Object.keys(TEMPLATE_CATEGORIES) as TemplateCategory[]).map((cat) => (
                    <div key={cat}>
                      <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-ink-4 uppercase">{TEMPLATE_CATEGORIES[cat]}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {(Object.keys(TEMPLATES) as TemplateId[]).filter((k) => TEMPLATES[k].category === cat).map((k) => (
                          <button key={k} type="button" disabled={!editable} onClick={() => patch({ template: k })} aria-pressed={design.template === k} className={cn("rounded-md border px-2 py-2 text-left text-[12.5px]", design.template === k ? "border-accent bg-accent-soft text-accent-ink" : "border-line hover:border-line-strong")}>
                            <span className="block font-medium">{TEMPLATES[k].label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[12px] text-ink-3">{TEMPLATES[design.template].description}</p>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[13px] font-medium text-ink">Kolory</p>
                  {Object.keys(design.colors).length > 0 && editable && <button type="button" onClick={() => patch({ colors: {} })} className="text-[12px] text-ink-3 hover:text-accent">Przywróć kolory marki</button>}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {(Object.keys(COLOR_LABEL) as (keyof BrandColors)[]).map((k) => (
                    <label key={k} className="flex flex-col items-center gap-1 text-[11.5px] text-ink-3">
                      <input type="color" value={colors[k]} disabled={!editable} onChange={(e) => patch({ colors: { ...design.colors, [k]: e.target.value.toUpperCase() } })} className="h-9 w-full cursor-pointer rounded-md border border-line bg-surface p-0.5" aria-label={`Kolor: ${COLOR_LABEL[k]}`} />
                      {COLOR_LABEL[k]}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="g-hfont">Czcionka nagłówków</Label>
                  <NativeSelect id="g-hfont" className="mt-1.5" value={design.headingFont ?? ""} disabled={!editable} onChange={(e) => patch({ headingFont: e.target.value || null })}>
                    <option value="">Z marki</option>
                    {FONTS.map((x) => <option key={x.id} value={x.id}>{x.family}</option>)}
                  </NativeSelect>
                </div>
                <div>
                  <Label htmlFor="g-bfont">Czcionka tekstu</Label>
                  <NativeSelect id="g-bfont" className="mt-1.5" value={design.bodyFont ?? ""} disabled={!editable} onChange={(e) => patch({ bodyFont: e.target.value || null })}>
                    <option value="">Z marki</option>
                    {FONTS.map((x) => <option key={x.id} value={x.id}>{x.family}</option>)}
                  </NativeSelect>
                </div>
              </div>
              <label className="flex items-center justify-between gap-3 text-[13px]">
                <span>
                  <span className="block font-medium text-ink">Logo biura</span>
                  <span className="block text-[12px] text-ink-3">{hasLogo ? "Logo z Brand Studio." : "Brak logo: pokażemy nazwę biura. Logo dodasz w Brand Studio."}</span>
                </span>
                <Switch checked={design.showLogo} disabled={!editable} onCheckedChange={(v) => patch({ showLogo: v })} aria-label="Pokaż logo" />
              </label>
              <label className="flex items-center justify-between gap-3 text-[13px]">
                <span>
                  <span className="block font-medium text-ink">Oznaczaj wizualizacje</span>
                  <span className="block text-[12px] text-ink-3">Zdjęcia oznaczone w ofercie jako wizualizacja dostaną etykietę „Wizualizacja”. Zalecane, aby nie wprowadzać odbiorców w błąd.</span>
                </span>
                <Switch checked={design.labelVisualizations} disabled={!editable} onCheckedChange={(v) => patch({ labelVisualizations: v })} aria-label="Oznaczaj wizualizacje" />
              </label>
            </TabsContent>

            <TabsContent value="caption" className="flex flex-col gap-3 p-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="g-caption">Opis do publikacji</Label>
                <span className="text-[11.5px] tabular-nums text-ink-4">{design.caption.length}/2200</span>
              </div>
              <Textarea id="g-caption" rows={12} maxLength={2200} value={design.caption} disabled={!editable} onChange={(e) => patch({ caption: e.target.value })} placeholder="Opis posta. Użyj „Teksty z AI”, aby go zaproponować, albo wpisz własny." />
              <Button variant="secondary" disabled={!design.caption} onClick={() => navigator.clipboard.writeText(design.caption).then(() => toast.success(t.common.copied))}><Copy /> Kopiuj opis</Button>
            </TabsContent>

            <TabsContent value="qa" className="p-4">
              <QaCheckPanel itemId={item.id} initial={qa?.report ?? null} stale={(qa?.stale ?? false) || saved !== JSON.stringify(initial)} dirty={dirty} />
            </TabsContent>
            <TabsContent value="versions" className="p-4">
              <ul className="flex flex-col divide-y divide-line">
                {versions.map((v) => (
                  <li key={v.version} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink">Wersja {v.version} {v.version === item.version && <Badge tone="accent" className="ml-1">Bieżąca</Badge>}</p>
                      <p className="truncate text-[12px] text-ink-3" suppressHydrationWarning>{v.operation ?? SOURCE_LABEL[v.source] ?? v.source} · {formatRelative(v.createdAt)}</p>
                    </div>
                    {editable && v.version !== item.version && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (dirty && !confirm("Masz niezapisane zmiany. Przywrócenie wersji je porzuci. Kontynuować?")) return;
                          const r = await restoreVersion(item.id, v.version);
                          if (r.ok) {
                            toast.success(r.message ?? "Przywrócono wersję");
                            router.refresh();
                          } else toast.error(r.error);
                        }}
                      >
                        <ArrowCounterClockwise /> Przywróć
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </TabsContent>
          </Tabs>
        </Card>
      </div>

      <Dialog open={tplOpen} onOpenChange={(o) => !tplBusy && setTplOpen(o)}>
        <DialogContent title="Zapisz jako szablon biura" description="Zapiszemy wygląd i układ: szablon, kolory, czcionki, położenie i rozmiar elementów oraz kolejność slajdów. Teksty i zdjęcia zostaną pobrane z oferty, dla której użyjesz szablonu.">
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void saveTemplate();
            }}
          >
            <div>
              <Label htmlFor="tpl-name">Nazwa szablonu</Label>
              <Input id="tpl-name" className="mt-1.5" value={tplName} maxLength={80} onChange={(e) => setTplName(e.target.value)} placeholder="Np. Karuzela premium biura" autoFocus />
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button type="button" variant="secondary" disabled={tplBusy}>Anuluj</Button></DialogClose>
              <Button type="submit" loading={tplBusy} disabled={tplName.trim().length < 2}><FloppyDisk /> Zapisz szablon</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={varOpen} onOpenChange={(o) => !varBusy && setVarOpen(o)}>
        <DialogContent title="Warianty kreatywne" description="Każdy kierunek to osobna grafika do edycji, z innym układem i tekstami. Fakty, zdjęcia, kolory, fonty i logo marki pozostają te same. Każdy wariant zużywa 1 generowanie AI.">
          <div className="flex flex-col gap-2">
            {CREATIVE_DIRECTION_IDS.map((d) => (
              <label key={d} className="flex items-start gap-2 text-[13px]">
                <input type="checkbox" className="mt-0.5" checked={varDirs.includes(d)} onChange={() => setVarDirs((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))} />
                <span><span className="font-medium text-ink">{CREATIVE_DIRECTIONS[d].label}</span><span className="block text-[12px] text-ink-3">{CREATIVE_DIRECTIONS[d].brief}</span></span>
              </label>
            ))}
            <div className="mt-2 flex justify-end gap-2">
              <DialogClose asChild><Button variant="secondary" disabled={varBusy}>Anuluj</Button></DialogClose>
              <Button loading={varBusy} disabled={!varDirs.length} onClick={async () => {
                setVarBusy(true);
                try {
                  const res = await fetch(`/api/graphics/${item.id}/variants`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ directions: varDirs }) });
                  const j = await res.json().catch(() => null);
                  if (!res.ok) throw new Error(j?.error ?? "Nie udało się przygotować wariantów.");
                  setCreatedVariants(j.items);
                  setVarOpen(false);
                  toast.success(`Przygotowano ${j.items.length} wariantów${j.failed.length ? `, ${j.failed.length} nie udało się` : ""}.`);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Nie udało się przygotować wariantów.");
                } finally {
                  setVarBusy(false);
                }
              }}><CopySimple /> Przygotuj warianty</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={aiOpen} onOpenChange={(o) => !aiBusy && setAiOpen(o)}>
        <DialogContent title="Teksty z AI" description="AI zaproponuje nagłówki, opisy slajdów i opis posta. Pola z danymi oferty zostaną bez zmian.">
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="ai-goal">Cel</Label>
              <NativeSelect id="ai-goal" className="mt-1.5" value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
                {(Object.keys(GOALS) as Goal[]).map((g) => <option key={g} value={g}>{GOALS[g]}</option>)}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="ai-brief">Wskazówki (opcjonalnie)</Label>
              <Textarea id="ai-brief" className="mt-1.5" rows={4} maxLength={1000} value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="Np. podkreśl ciszę i zieleń, akcent na rodziny z dziećmi, dzień otwarty w sobotę 10–14." />
              <p className="mt-1 text-[12px] text-ink-3">Fakty spoza oferty podaj tutaj. AI nie dopisze parametrów, których nie ma w danych.</p>
            </div>
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button variant="secondary" disabled={aiBusy}>Anuluj</Button></DialogClose>
              <Button onClick={runAi} loading={aiBusy}><Sparkle /> Generuj teksty</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ElementPanel({ el, o, isText, photos, currentPhoto, onChange, onHide, onReset, onSwap, onProposeCrop, onRestoreCrop, onClose }: {
  el: { key: string; kind: string; label: string };
  o: ElementOverride;
  isText: boolean;
  photos: Photo[];
  currentPhoto: string | null;
  onChange: (o: Partial<Record<keyof ElementOverride, number | string | boolean | undefined>>) => void;
  onHide: () => void;
  onReset: () => void;
  onSwap: (id: string) => void;
  onProposeCrop: () => Promise<void>;
  onRestoreCrop: () => void;
  onClose: () => void;
}) {
  const photo = el.kind === "photo";
  const [cropBusy, setCropBusy] = useState(false);
  return (
    <div className="w-full rounded-lg border border-accent/20 bg-accent-soft/30 p-3" data-testid="element-panel">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-ink">{el.label}</p>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onReset}><ArrowCounterClockwise /> Resetuj</Button>
          <Button size="sm" variant="ghost" onClick={onHide}><EyeSlash /> Ukryj</Button>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Zamknij panel elementu">Gotowe</Button>
        </div>
      </div>
      {photo ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            <Button size="sm" variant="soft" loading={cropBusy} onClick={async () => { setCropBusy(true); await onProposeCrop(); setCropBusy(false); }}><Crop /> Zaproponuj kadr</Button>
            <Button size="sm" variant="secondary" onClick={onRestoreCrop}>Przywróć oryginalny kadr</Button>
          </div>
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            Powiększenie ({Math.round((o.zoom ?? 1) * 100)}%)
            <input type="range" min={1} max={3} step={0.05} value={o.zoom ?? 1} onChange={(e) => onChange({ zoom: Number(e.target.value) === 1 ? undefined : Number(e.target.value) })} aria-label="Powiększenie zdjęcia" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            Kadr w poziomie
            <input type="range" min={0} max={1} step={0.01} value={o.fx ?? 0.5} onChange={(e) => onChange({ fx: Number(e.target.value) })} aria-label="Kadr w poziomie" />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            Kadr w pionie
            <input type="range" min={0} max={1} step={0.01} value={o.fy ?? 0.5} onChange={(e) => onChange({ fy: Number(e.target.value) })} aria-label="Kadr w pionie" />
          </label>
          {photos.length > 1 && (
            <div className="sm:col-span-3">
              <p className="mb-1.5 text-[12px] text-ink-3">Zamień zdjęcie</p>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {photos.map((p) => (
                  <button key={p.id} type="button" onClick={() => onSwap(p.id)} aria-pressed={p.id === currentPhoto} aria-label={`Użyj zdjęcia${p.caption ? `: ${p.caption}` : ""}`} className={cn("relative size-14 shrink-0 overflow-hidden rounded-md border-2", p.id === currentPhoto ? "border-accent" : "border-transparent hover:border-line-strong")}>
                    <img src={p.url} alt="" className="size-full object-cover" loading="lazy" />
                    {p.isVisualization && <span className="absolute bottom-0.5 left-0.5 rounded bg-ink/70 px-1 text-[9px] text-white">Wiz.</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="text-[11.5px] text-ink-4 sm:col-span-3">Przeciągnij zdjęcie na grafice, aby zmienić kadr. Zdjęcie nie jest retuszowane, zmieniamy tylko wycinek i powiększenie.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-[12px] text-ink-3">
            Rozmiar ({Math.round((o.scale ?? 1) * 100)}%)
            <input type="range" min={0.5} max={2} step={0.05} value={o.scale ?? 1} onChange={(e) => onChange({ scale: Number(e.target.value) === 1 ? undefined : Number(e.target.value) })} aria-label="Rozmiar elementu" />
          </label>
          {isText && (
            <label className="flex flex-col gap-1 text-[12px] text-ink-3">
              Czcionka
              <NativeSelect value={o.font ?? ""} onChange={(e) => onChange({ font: e.target.value || undefined })} aria-label="Czcionka elementu">
                <option value="">Z szablonu</option>
                {FONTS.map((x) => <option key={x.id} value={x.id}>{x.family}</option>)}
              </NativeSelect>
            </label>
          )}
          {isText && (
            <div className="flex flex-col gap-1 text-[12px] text-ink-3">
              Kolor
              <div className="flex items-center gap-2">
                <input type="color" value={o.color ?? "#1B1A1F"} onChange={(e) => onChange({ color: e.target.value.toUpperCase() })} className="h-9 w-14 cursor-pointer rounded-md border border-line bg-surface p-0.5" aria-label="Kolor elementu" />
                {o.color && <button type="button" onClick={() => onChange({ color: undefined })} className="text-[12px] text-ink-3 hover:text-accent">Z szablonu</button>}
              </div>
            </div>
          )}
          <p className="text-[11.5px] text-ink-4 sm:col-span-3">
            Przesunięcie: {Math.round(o.dx ?? 0)} × {Math.round(o.dy ?? 0)} px. Elementy zawsze zostają w bezpiecznym marginesie grafiki.
          </p>
        </div>
      )}
    </div>
  );
}
