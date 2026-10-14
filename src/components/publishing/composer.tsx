"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle, FacebookLogo, FilmSlate, InstagramLogo, LinkedinLogo, PaperPlaneTilt, TiktokLogo, Warning } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/field";
import { createPublications, loadMaterial, type MaterialInfo } from "@/app/(app)/publications/actions";
import { PLATFORMS, defaultFormat, validatePublication, type MediaFacts } from "@/core/publishing/platforms";
import { warsawToIso } from "@/core/planner/time";
import type { PublicationFormat, PublicationMediaSpec, SocialPlatform } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

interface Conn { id: string; platform: SocialPlatform; name: string; avatar: string | null; limited: boolean }
interface Item { id: string; title: string; kind: "text" | "graphic" | "video"; propertyId: string | null }
interface Photo { id: string; propertyId: string; url: string; width: number | null; height: number | null }
interface Props {
  connections: Conn[];
  items: Item[];
  properties: { id: string; title: string }[];
  photos: Photo[];
  campaigns: { id: string; name: string }[];
  initialItem: string | null;
  initialCampaign: string | null;
  initialDate: string;
  canApprove: boolean;
}

const ICON: Record<SocialPlatform, typeof FacebookLogo> = { facebook_page: FacebookLogo, instagram: InstagramLogo, linkedin_org: LinkedinLogo, linkedin_member: LinkedinLogo, tiktok: TiktokLogo };
const KIND: Record<Item["kind"], string> = { text: "Tekst", graphic: "Grafika", video: "Wideo" };

export function Composer({ connections, items, properties, photos, campaigns, initialItem, initialCampaign, initialDate, canApprove }: Props) {
  const router = useRouter();
  const [itemId, setItemId] = useState<string | null>(initialItem);
  const [material, setMaterial] = useState<MaterialInfo | null>(null);
  const [propertyId, setPropertyId] = useState<string>("");
  const [media, setMedia] = useState<PublicationMediaSpec[]>([]);
  const [selected, setSelected] = useState<string[]>(connections.length === 1 ? [connections[0]!.id] : []);
  const [formats, setFormats] = useState<Record<string, PublicationFormat>>({});
  const [caption, setCaption] = useState("");
  const [own, setOwn] = useState<Record<string, string>>({});
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("18:00");
  const [campaignId, setCampaignId] = useState(initialCampaign ?? "");
  const [textSource, setTextSource] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!itemId) return;
    let alive = true;
    void loadMaterial(itemId).then((r) => {
      if (!alive) return;
      if (!r.ok) return void toast.error(r.error);
      setMaterial(r.data);
      setTitle((t) => t || r.data.title);
      if (r.data.caption) setCaption((c) => c || r.data.caption);
      if (r.data.propertyId) setPropertyId(r.data.propertyId);
      setMedia(r.data.kind === "graphic" ? r.data.slides.map((s) => ({ source: "graphic", ref: itemId, slide: s.index })) : r.data.kind === "video" && r.data.hasVideo ? [{ source: "video", ref: itemId }] : []);
    });
    return () => { alive = false; };
  }, [itemId]);

  const propPhotos = photos.filter((p) => p.propertyId === propertyId);
  const facts: MediaFacts[] = useMemo(() => media.map((m) => {
    if (m.source === "graphic") { const s = material?.slides.find((x) => x.index === m.slide); return { kind: "image", width: s?.width ?? null, height: s?.height ?? null }; }
    if (m.source === "video") return { kind: "video", width: material?.video?.width ?? null, height: material?.video?.height ?? null, durationMs: material?.video?.durationMs ?? null };
    const p = photos.find((x) => x.id === m.ref);
    return { kind: "image", width: p?.width ?? null, height: p?.height ?? null };
  }), [media, material, photos]);

  const plan = selected.map((cid) => {
    const c = connections.find((x) => x.id === cid)!;
    const format = formats[cid] ?? defaultFormat(c.platform, facts);
    const text = own[cid] ?? caption;
    const issues = format ? validatePublication(c.platform, format, text, facts) : [`Brak pasującego formatu dla wybranych plików.`];
    return { c, format, text, issues };
  });
  const scheduledIso = date && time ? warsawToIso(date, time) : "";
  const timeIssue = scheduledIso && Date.parse(scheduledIso) < Date.now() + 60_000 ? "Termin musi być co najmniej minutę w przyszłości." : null;
  const blocked = !selected.length || plan.some((p) => p.issues.length) || !!timeIssue || !title.trim();

  const toggleMedia = (spec: PublicationMediaSpec) => setMedia((cur) => {
    const key = (s: PublicationMediaSpec) => `${s.source}:${s.ref}:${s.slide ?? ""}`;
    return cur.some((x) => key(x) === key(spec)) ? cur.filter((x) => key(x) !== key(spec)) : cur.length >= 20 ? cur : [...cur, spec];
  });
  const has = (spec: PublicationMediaSpec) => media.some((x) => x.source === spec.source && x.ref === spec.ref && (x.slide ?? null) === (spec.slide ?? null));
  const thumb = (m: PublicationMediaSpec) => m.source === "graphic" ? `/api/graphics/${m.ref}/export?thumb=1&slide=${m.slide ?? 0}` : m.source === "photo" ? photos.find((p) => p.id === m.ref)?.url ?? "" : null;

  const submit = (mode: "draft" | "request" | "approve") => start(async () => {
    const r = await createPublications({
      connectionIds: selected,
      title: title.trim(),
      caption,
      captions: Object.fromEntries(Object.entries(own).filter(([k]) => selected.includes(k))),
      formats: Object.fromEntries(plan.filter((p) => p.format).map((p) => [p.c.id, p.format])),
      media,
      scheduledAt: scheduledIso,
      contentItemId: itemId,
      campaignId: campaignId || null,
      submit: mode,
    });
    if (!r.ok) return void toast.error(r.error);
    toast.success(r.message ?? "Zapisano");
    router.push("/publications");
    router.refresh();
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-5">
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-[14px] font-semibold">1. Materiał</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="pc-item">Materiał z biblioteki</Label>
              <NativeSelect id="pc-item" className="mt-1.5" value={itemId ?? ""} onChange={(e) => { setMaterial(null); setMedia([]); setItemId(e.target.value || null); }}>
                <option value="">Bez materiału (sam tekst lub zdjęcia)</option>
                {items.map((i) => <option key={i.id} value={i.id}>{KIND[i.kind]}: {i.title}</option>)}
              </NativeSelect>
            </div>
            <div>
              <Label htmlFor="pc-property">Zdjęcia z oferty</Label>
              <NativeSelect id="pc-property" className="mt-1.5" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                <option value="">Bez zdjęć z oferty</option>
                {properties.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </NativeSelect>
            </div>
          </div>
          {material?.kind === "graphic" && (
            <div>
              <p className="text-[12.5px] text-ink-3">Slajdy grafiki ({material.slides[0]?.width}×{material.slides[0]?.height})</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {material.slides.map((s) => {
                  const spec: PublicationMediaSpec = { source: "graphic", ref: itemId!, slide: s.index };
                  return (
                    <button key={s.index} type="button" aria-pressed={has(spec)} aria-label={`Slajd ${s.index + 1}`} onClick={() => toggleMedia(spec)} className={cn("relative overflow-hidden rounded-md border-2", has(spec) ? "border-accent" : "border-transparent opacity-60")}>
                      <img src={thumb(spec)!} alt="" className="h-24 w-auto bg-sunken" loading="lazy" />
                      <span className="absolute top-1 left-1 rounded bg-black/60 px-1 text-[10.5px] text-white">{s.index + 1}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {material?.kind === "video" && (
            material.hasVideo ? (
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={has({ source: "video", ref: itemId! })} onChange={() => toggleMedia({ source: "video", ref: itemId! })} /> <FilmSlate /> Film MP4{material.video?.durationMs ? ` (${Math.round(material.video.durationMs / 1000)} s)` : ""}</label>
            ) : <p className="text-[13px] text-warning">Ten film nie ma jeszcze wyrenderowanego MP4. Wyrenderuj go w Video Studio.</p>
          )}
          {propPhotos.length > 0 && (
            <div>
              <p className="text-[12.5px] text-ink-3">Zdjęcia oferty</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {propPhotos.map((p, i) => {
                  const spec: PublicationMediaSpec = { source: "photo", ref: p.id };
                  return (
                    <button key={p.id} type="button" aria-pressed={has(spec)} aria-label={`Zdjęcie ${i + 1}`} onClick={() => toggleMedia(spec)} className={cn("overflow-hidden rounded-md border-2", has(spec) ? "border-accent" : "border-transparent opacity-60")}>
                      <img src={p.url} alt="" className="h-20 w-28 bg-sunken object-cover" loading="lazy" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <p className="text-[12.5px] text-ink-3" data-testid="media-count">Wybrane pliki: {media.length}{media.length > 1 ? " (kolejność jak wybór)" : ""}</p>
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-[14px] font-semibold">2. Konta i formaty</h2>
          <ul className="flex flex-col gap-2">
            {connections.map((c) => {
              const I = ICON[c.platform];
              const on = selected.includes(c.id);
              const p = plan.find((x) => x.c.id === c.id);
              return (
                <li key={c.id} className={cn("rounded-md border px-3 py-2.5", on ? "border-accent/40 bg-accent-soft/30" : "border-line")}>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex min-w-0 flex-1 items-center gap-2 text-[13.5px]">
                      <input type="checkbox" checked={on} onChange={() => setSelected((cur) => (on ? cur.filter((x) => x !== c.id) : [...cur, c.id]))} aria-label={`Konto: ${c.name}`} />
                      <I size={18} /> <span className="truncate font-medium">{c.name}</span> <span className="text-ink-3">· {PLATFORMS[c.platform].short}</span>
                      {c.limited && <span className="text-[12px] text-warning">(ograniczone uprawnienia)</span>}
                    </label>
                    {on && (
                      <NativeSelect aria-label={`Format: ${c.name}`} className="h-8 w-44 text-[12.5px]" value={p?.format ?? ""} onChange={(e) => setFormats((f) => ({ ...f, [c.id]: e.target.value as PublicationFormat }))}>
                        {!p?.format && <option value="">Wybierz format</option>}
                        {PLATFORMS[c.platform].formats.map((f) => <option key={f.format} value={f.format}>{f.label}</option>)}
                      </NativeSelect>
                    )}
                  </div>
                  {on && p && p.issues.length > 0 && <ul className="mt-2 flex flex-col gap-0.5 text-[12.5px] text-danger" data-testid="publish-issues">{p.issues.map((x) => <li key={x} className="flex gap-1.5"><Warning className="mt-0.5 shrink-0" />{x}</li>)}</ul>}
                  {on && p && !p.issues.length && <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-success"><CheckCircle /> Zgodne z wymaganiami {PLATFORMS[c.platform].short}</p>}
                  {on && (
                    <details className="mt-2 text-[12.5px]">
                      <summary className="cursor-pointer text-ink-3">Osobny opis dla tego konta</summary>
                      <Textarea className="mt-1.5" rows={3} maxLength={5000} value={own[c.id] ?? caption} onChange={(e) => setOwn((o) => ({ ...o, [c.id]: e.target.value }))} aria-label={`Opis dla ${c.name}`} />
                    </details>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <h2 className="text-[14px] font-semibold">3. Opis i termin</h2>
          <div>
            <Label htmlFor="pc-title">Tytuł wpisu w planerze</Label>
            <Input id="pc-title" className="mt-1.5" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Label htmlFor="pc-caption">Opis posta</Label>
              <NativeSelect aria-label="Wstaw tekst z biblioteki" className="h-8 w-64 text-[12.5px]" value={textSource} onChange={(e) => {
                const v = e.target.value;
                setTextSource(v);
                if (v) void loadMaterial(v).then((r) => { if (r.ok && r.data.caption) setCaption(r.data.caption); else if (!r.ok) toast.error(r.error); });
              }}>
                <option value="">Wstaw tekst z biblioteki…</option>
                {items.filter((i) => i.kind === "text").map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
              </NativeSelect>
            </div>
            <Textarea id="pc-caption" className="mt-1.5" rows={8} maxLength={5000} value={caption} onChange={(e) => setCaption(e.target.value)} />
            <p className="mt-1 text-[12px] text-ink-3 tabular-nums">{caption.length} znaków · limity: Instagram 2200, LinkedIn 3000, Facebook 5000 (w aplikacji)</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label htmlFor="pc-date">Data</Label><Input id="pc-date" type="date" className="mt-1.5" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label htmlFor="pc-time">Godzina (czas polski)</Label><Input id="pc-time" type="time" className="mt-1.5" value={time} onChange={(e) => setTime(e.target.value)} /></div>
            <div>
              <Label htmlFor="pc-campaign">Kampania (opcjonalnie)</Label>
              <NativeSelect id="pc-campaign" className="mt-1.5" value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                <option value="">Bez kampanii</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </NativeSelect>
            </div>
          </div>
          {timeIssue && <p className="text-[12.5px] text-danger">{timeIssue}</p>}
        </Card>
      </div>

      <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <h2 className="text-[14px] font-semibold">Podgląd</h2>
        {plan.length === 0 && <Card className="p-5 text-[13px] text-ink-3">Wybierz konto, aby zobaczyć podgląd.</Card>}
        {plan.map((p) => {
          const I = ICON[p.c.platform];
          const limit = p.c.platform === "instagram" ? 125 : 260;
          return (
            <Card key={p.c.id} className="overflow-hidden p-0" data-testid="publish-preview">
              <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-[12.5px]"><I size={16} /> <span className="font-medium">{p.c.name}</span> <span className="ml-auto text-ink-3">{p.format ? PLATFORMS[p.c.platform].formats.find((f) => f.format === p.format)?.label : "—"}</span></div>
              {p.c.platform !== "instagram" && p.text && <p className="px-3 py-2 text-[12.5px] whitespace-pre-line">{p.text.length > limit ? `${p.text.slice(0, limit)}… zobacz więcej` : p.text}</p>}
              {media.length > 0 && (
                <div className={cn("grid gap-0.5 bg-sunken", media.length > 1 && p.format !== "carousel" ? "grid-cols-2" : "grid-cols-1")}>
                  {(p.format === "carousel" ? media.slice(0, 1) : media.slice(0, 4)).map((m, i) => thumb(m) ? <img key={i} src={thumb(m)!} alt="" className="aspect-[4/5] w-full object-cover" /> : <div key={i} className="flex aspect-[9/16] max-h-72 items-center justify-center text-ink-3"><FilmSlate size={28} /></div>)}
                </div>
              )}
              {p.format === "carousel" && media.length > 1 && <p className="px-3 pt-1.5 text-[11.5px] text-ink-3">Karuzela: 1 z {media.length}</p>}
              {p.c.platform === "instagram" && p.text && <p className="px-3 py-2 text-[12.5px] whitespace-pre-line"><b>{p.c.name.replace(/^@/, "")}</b> {p.text.length > limit ? `${p.text.slice(0, limit)}… więcej` : p.text}</p>}
            </Card>
          );
        })}
        <div className="flex flex-col gap-2">
          {canApprove && <Button loading={pending} disabled={blocked} onClick={() => submit("approve")}><CheckCircle /> Zatwierdź i zaplanuj</Button>}
          <Button variant={canApprove ? "secondary" : "primary"} loading={pending} disabled={blocked} onClick={() => submit("request")}><PaperPlaneTilt /> Wyślij do akceptacji</Button>
          <Button variant="ghost" loading={pending} disabled={!selected.length || !title.trim()} onClick={() => submit("draft")}>Zapisz szkic</Button>
          <p className="text-[12px] text-ink-3">Opublikowany post pojawi się na koncie dopiero po potwierdzeniu przez platformę. Status zobaczysz w zakładce Publikacje i w Planerze.</p>
        </div>
      </div>
    </div>
  );
}
