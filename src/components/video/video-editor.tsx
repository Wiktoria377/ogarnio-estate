"use client";
import dynamic from "next/dynamic";
import { QaCheckPanel } from "@/components/qa/qa-check-panel";
import type { QaReport } from "@/core/qa/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowCounterClockwise, ArrowDown, ArrowLeft, ArrowUp, Check, CheckCircle, Copy, DownloadSimple, FilmSlate, MusicNotes, Sparkle, Trash, UploadSimple, Warning } from "@phosphor-icons/react/dist/ssr";
import { Button, Spinner } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { ConfirmDelete } from "@/components/common/confirm-delete";
import { JobControls, JobStatusBadge, useJobs, type JobItem } from "@/components/campaigns/job-progress";
import { renderVideo, rewriteScript, saveVideo } from "@/app/(app)/video/actions";
import { deleteItem, restoreVersion, updateItemMeta } from "@/app/(app)/library/actions";
import { PHOTO_SCENES, SCENE_MOTIONS, VIDEO_LENGTHS, VIDEO_STYLES, resizeScenes, type VideoDesign, type VideoLength } from "@/core/video/model";
import { reelPropsFrom, type ReelEnv } from "@/core/video/props";
import type { ReelStyle, SceneMotion } from "@/remotion/types";
import { cn, formatRelative } from "@/lib/utils";
import { t } from "@/i18n/pl";

const ReelPlayer = dynamic(() => import("./reel-player"), { ssr: false, loading: () => <div className="skeleton aspect-[9/16] w-full rounded-xl" /> });

interface Photo { id: string; url: string; isVisualization: boolean }
interface Render { id: string; version: number; sizeBytes: number; createdAt: string; poster: string | null; length: number | null }
interface Props {
  item: { id: string; title: string; status: "draft" | "review" | "ready"; updatedAt: string; version: number };
  design: VideoDesign;
  env: ReelEnv;
  property: { id: string; title: string };
  photos: Photo[];
  music: { id: string; label: string }[];
  renders: Render[];
  jobs: JobItem[];
  quota: { used: number; limit: number };
  versions: { version: number; operation: string | null; source: string; createdAt: string }[];
  editable: boolean;
  qa?: { report: QaReport; stale: boolean } | null;
}

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

function MusicUpload({ onDone }: { onDone: (track: { id: string; label: string; url: string }) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [rights, setRights] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("label", label || file.name.replace(/\.[^.]+$/, ""));
      if (rights) fd.set("rights", "yes");
      if (note) fd.set("rightsNote", note);
      const res = await fetch("/api/media/audio", { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? "Nie udało się dodać utworu.");
      toast.success("Dodano utwór do biblioteki biura");
      onDone(j.track);
      setFile(null);
      setLabel("");
      setRights(false);
      setNote("");
      if (input.current) input.current.value = "";
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się dodać utworu.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-dashed border-line-strong p-3">
      <p className="text-[12.5px] font-medium text-ink">Dodaj własny utwór (MP3, M4A, WAV, AAC, maks. 15 MB)</p>
      <input ref={input} type="file" accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/aac,.mp3,.m4a,.wav,.aac" aria-label="Plik muzyki" className="sr-only" onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !label) setLabel(f.name.replace(/\.[^.]+$/, "").slice(0, 160)); }} />
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => input.current?.click()}><UploadSimple /> Wybierz plik</Button>
        <span className="truncate text-[12.5px] text-ink-3">{file ? `${file.name} · ${mb(file.size)}` : "Nie wybrano pliku"}</span>
      </div>
      {file && (
        <>
          <Input aria-label="Nazwa utworu" value={label} maxLength={160} onChange={(e) => setLabel(e.target.value)} placeholder="Nazwa utworu" />
          <Input aria-label="Źródło licencji" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Źródło licencji, np. numer licencji lub serwis (opcjonalnie)" />
          <label className="flex items-start gap-2 text-[12.5px] leading-snug text-ink-2">
            <input type="checkbox" className="mt-0.5" checked={rights} onChange={(e) => setRights(e.target.checked)} />
            <span>Potwierdzam, że biuro ma prawo używać tego utworu w materiałach reklamowych publikowanych w mediach społecznościowych (własny utwór lub licencja).</span>
          </label>
          <Button size="sm" className="self-start" loading={busy} disabled={!rights} onClick={upload}><UploadSimple /> Dodaj utwór</Button>
        </>
      )}
    </div>
  );
}

export function VideoEditor({ item, design: initial, env: initialEnv, property, photos, music: initialMusic, renders, jobs: initialJobs, quota, versions, editable, qa = null }: Props) {
  const router = useRouter();
  const [design, setDesign] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [title, setTitle] = useState(item.title);
  const [status, setStatus] = useState(item.status);
  const [env, setEnv] = useState(initialEnv);
  const [music, setMusic] = useState(initialMusic);
  const [pickFor, setPickFor] = useState<number | null>(null);
  const [aiNote, setAiNote] = useState("");
  const [saving, startSave] = useTransition();
  const [aiBusy, startAi] = useTransition();
  const [rendering, startRender] = useTransition();
  const dirty = JSON.stringify(design) !== saved;
  const props = useMemo(() => reelPropsFrom(design, env), [design, env]);
  const { jobs, retry, cancel, reload } = useJobs({ item: item.id }, initialJobs);
  const activeJob = jobs.find((j) => j.status === "queued" || j.status === "running");
  const lastJob = jobs[0];
  const photoById = new Map(photos.map((p) => [p.id, p]));

  /** Any change to the film's content withdraws the approval. */
  const edit = (patch: Partial<VideoDesign>) => setDesign((d) => ({ ...d, ...patch, scriptApproved: false, scriptSource: patch.scriptSource ?? "manual" }));
  const setScene = (i: number, patch: Partial<VideoDesign["scenes"][number]>) => edit({ scenes: design.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const moveScene = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= design.scenes.length) return;
    const scenes = [...design.scenes];
    [scenes[i], scenes[j]] = [scenes[j]!, scenes[i]!];
    edit({ scenes });
  };

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  async function persist(next: VideoDesign, operation?: string): Promise<boolean> {
    const r = await saveVideo(item.id, next, operation);
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    setDesign(next);
    setSaved(JSON.stringify(next));
    return true;
  }

  const approve = () => startSave(async () => {
    if (await persist({ ...design, scriptApproved: true }, "Zatwierdzenie scenariusza")) {
      toast.success("Scenariusz zatwierdzony. Możesz wyrenderować MP4.");
      router.refresh();
    }
  });

  const render = () => startRender(async () => {
    if (dirty) return void toast.error("Najpierw zapisz zmiany.");
    const r = await renderVideo(item.id);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Render MP4 dodany do kolejki");
    await reload();
  });

  const rewrite = () => startAi(async () => {
    if (dirty && !confirm("Nowy scenariusz zastąpi niezapisane teksty. Kontynuować?")) return;
    const r = await rewriteScript(item.id, design, aiNote);
    if (!r.ok) return void toast.error(r.error);
    const next = r.data.design as VideoDesign;
    setDesign(next);
    setSaved(JSON.stringify(next));
    toast.success("Nowy scenariusz gotowy. Sprawdź go i zatwierdź.");
    router.refresh();
  });

  function changeLength(length: VideoLength) {
    edit({ length, scenes: resizeScenes(design.scenes, length, photos.map((p) => p.id), design.style) });
  }
  function changeStyle(style: ReelStyle) {
    edit({ style, scenes: design.scenes.map((s, i) => ({ ...s, motion: VIDEO_STYLES[style].motions[i % 6]! })) });
  }

  const latest = renders[0];
  const latestIsCurrent = latest && latest.version === item.version && !dirty;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <Link href="/video" className="mb-2 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 hover:text-ink"><ArrowLeft size={13} /> Video Studio</Link>
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
            aria-label="Tytuł wideo"
            maxLength={200}
          />
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
            <span>Reels / TikTok · 1080×1920 · 30 kl./s · {design.length} s</span>
            <span>· <Link href={`/properties/${property.id}`} className="hover:text-accent-ink">{property.title}</Link></span>
            <span suppressHydrationWarning>· wersja {item.version}, {formatRelative(item.updatedAt)}</span>
            {design.scriptApproved ? <Badge tone="success" dot>Scenariusz zatwierdzony</Badge> : <Badge tone="warning" dot>Scenariusz czeka na akceptację</Badge>}
            {dirty && <Badge tone="warning" dot>Niezapisane zmiany</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect aria-label="Status" value={status} disabled={!editable} className="w-40" onChange={async (e) => { const next = e.target.value as typeof status; setStatus(next); const r = await updateItemMeta(item.id, { status: next }); if (r.ok) toast.success(`Status: ${t.status[next]}`); else toast.error(r.error); }}>
            {(["draft", "review", "ready"] as const).map((s) => <option key={s} value={s}>{t.status[s]}</option>)}
          </NativeSelect>
          {editable && <Button variant="secondary" onClick={() => startSave(async () => { if (await persist(design)) { toast.success("Zapisano wideo"); router.refresh(); } })} loading={saving} disabled={!dirty}><Check /> Zapisz</Button>}
          {editable && <ConfirmDelete title="Usunąć wideo?" description="Usuniemy projekt, wszystkie wersje i wyrenderowane pliki MP4. Zdjęcia oferty zostaną." action={() => deleteItem(item.id)} onDone={() => router.push("/video")} trigger={<Button variant="ghost" size="icon" aria-label="Usuń wideo"><Trash /></Button>} />}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-4">
            <div className="flex items-center justify-between text-[12.5px] text-ink-3">
              <span>Podgląd na żywo (ta sama animacja co w MP4)</span>
            </div>
            <div className="mx-auto w-full max-w-[340px]" data-testid="reel-preview"><ReelPlayer props={props} /></div>
            <p className="text-[12px] leading-snug text-ink-3">Napisy trzymają się z dala od interfejsu Instagrama i TikToka (góra, dół i prawa krawędź). Cena i parametry pochodzą z karty oferty.</p>
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <p className="flex items-center gap-2 text-[14px] font-semibold"><FilmSlate size={16} /> Plik MP4</p>
            {editable && (
              <>
                {!design.scriptApproved ? (
                  <div className="flex flex-col gap-2 rounded-md bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
                    <span>Przed renderem sprawdź teksty i zatwierdź scenariusz.</span>
                    <Button size="sm" className="self-start" onClick={approve} loading={saving}><CheckCircle weight="fill" /> Zatwierdź scenariusz{dirty ? " i zapisz" : ""}</Button>
                  </div>
                ) : (
                  <Button onClick={render} loading={rendering} disabled={!!activeJob || dirty || (quota.limit > 0 && quota.used >= quota.limit)}><FilmSlate /> {latest ? "Renderuj ponownie" : "Renderuj MP4"}</Button>
                )}
                <span className="text-[12px] text-ink-3">Limit renderów w tym miesiącu: {quota.used}/{quota.limit}</span>
              </>
            )}
            {lastJob && (lastJob.status !== "succeeded" || activeJob) && (
              <div className="flex flex-col gap-2 rounded-md border border-line p-3" data-testid="render-job">
                <div className="flex items-center justify-between gap-2 text-[12.5px]"><span className="font-medium">Renderowanie</span><JobStatusBadge job={lastJob} /></div>
                <JobControls job={lastJob} onRetry={() => retry(lastJob.id)} onCancel={() => cancel(lastJob.id)} editable={editable} />
              </div>
            )}
            {latest ? (
              <div className="flex flex-col gap-2">
                <video key={latest.id} src={`/api/video/${item.id}/file?render=${latest.id}`} poster={latest.poster ?? undefined} controls playsInline preload="metadata" className="mx-auto aspect-[9/16] w-full max-w-[340px] rounded-xl bg-ink" data-testid="rendered-video" />
                {!latestIsCurrent && <p className="text-[12px] text-warning">Ten plik powstał z wersji {latest.version}. Po zmianach wyrenderuj ponownie.</p>}
                <Button asChild variant="secondary"><a href={`/api/video/${item.id}/file?render=${latest.id}&download=1`} download><DownloadSimple /> Pobierz MP4 (wersja {latest.version}, {mb(latest.sizeBytes)})</a></Button>
              </div>
            ) : (
              <p className="text-[12.5px] text-ink-3">Nie ma jeszcze pliku MP4.</p>
            )}
            {renders.length > 1 && (
              <div className="border-t border-line pt-3">
                <p className="mb-1.5 text-[12.5px] font-medium">Historia renderów</p>
                <ul className="flex flex-col gap-1 text-[12.5px]">
                  {renders.slice(1).map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2">
                      <span className="text-ink-3" suppressHydrationWarning>Wersja {r.version} · {mb(r.sizeBytes)} · {formatRelative(r.createdAt)}</span>
                      <a className="text-accent-ink hover:underline" href={`/api/video/${item.id}/file?render=${r.id}&download=1`} download>Pobierz</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {(design.gaps.length > 0 || design.warnings.length > 0) && (
            <div role="status" className="rounded-md border border-warning/20 bg-warning-soft px-3 py-2 text-[12.5px] text-warning">
              <p className="flex items-center gap-1.5 font-medium"><Warning size={14} /> Do sprawdzenia</p>
              <ul className="mt-1 list-disc pl-5">{[...design.warnings, ...design.gaps.map((g) => `Brakuje danych: ${g}`)].map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}

          <Card className="flex flex-col gap-4 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[14px] font-semibold">Scenariusz</p>
              <Badge tone={design.scriptSource === "ai" ? "accent" : "muted"}>{design.scriptSource === "ai" ? "Napisany przez AI" : "Edytowany ręcznie"}</Badge>
            </div>
            <div>
              <Label htmlFor="v-hook">Hak (pierwsza sekunda)</Label>
              <Input id="v-hook" className="mt-1.5" value={design.hook} maxLength={60} disabled={!editable} onChange={(e) => edit({ hook: e.target.value })} placeholder="Np. 3 pokoje z ogrodem na Mokotowie" />
            </div>
            <ol className="flex flex-col gap-3" aria-label="Sceny">
              {design.scenes.map((s, i) => {
                const p = photoById.get(s.photoId);
                return (
                  <li key={i} className="flex flex-col gap-2 rounded-lg border border-line p-2.5" data-testid="video-scene">
                    <div className="flex gap-3">
                      <button type="button" disabled={!editable} onClick={() => setPickFor(pickFor === i ? null : i)} className="relative aspect-[9/16] w-16 shrink-0 overflow-hidden rounded-md bg-sunken ring-accent hover:ring-2" aria-label={`Zmień zdjęcie sceny ${i + 1}`}>
                        {p ? <img src={p.url} alt="" className="size-full object-cover" /> : <span className="text-[10px] text-danger">brak</span>}
                        {p?.isVisualization && <span className="absolute bottom-0.5 left-0.5 rounded bg-ink/70 px-1 text-[9px] text-white">Wiz.</span>}
                      </button>
                      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12px] font-medium text-ink-3">Scena {i + 1}</span>
                          <NativeSelect aria-label={`Ruch kamery w scenie ${i + 1}`} className="ml-auto h-7 w-40 text-[12px]" value={s.motion} disabled={!editable} onChange={(e) => setScene(i, { motion: e.target.value as SceneMotion })}>
                            {(Object.keys(SCENE_MOTIONS) as SceneMotion[]).map((m) => <option key={m} value={m}>{SCENE_MOTIONS[m]}</option>)}
                          </NativeSelect>
                          {editable && (<>
                            <Button variant="ghost" size="icon-sm" aria-label={`Scena ${i + 1} wcześniej`} disabled={i === 0} onClick={() => moveScene(i, -1)}><ArrowUp /></Button>
                            <Button variant="ghost" size="icon-sm" aria-label={`Scena ${i + 1} później`} disabled={i === design.scenes.length - 1} onClick={() => moveScene(i, 1)}><ArrowDown /></Button>
                          </>)}
                        </div>
                        <Input aria-label={`Nagłówek sceny ${i + 1}`} value={s.headline} maxLength={60} disabled={!editable} onChange={(e) => setScene(i, { headline: e.target.value })} placeholder="Nagłówek (krótko)" />
                        <Input aria-label={`Podtytuł sceny ${i + 1}`} value={s.subline} maxLength={80} disabled={!editable} onChange={(e) => setScene(i, { subline: e.target.value })} placeholder="Podtytuł (opcjonalnie)" />
                      </div>
                    </div>
                    {pickFor === i && (
                      <div className="grid grid-cols-6 gap-1.5 border-t border-line pt-2 sm:grid-cols-8" role="listbox" aria-label="Zdjęcia oferty">
                        {photos.map((ph) => (
                          <button key={ph.id} type="button" role="option" aria-selected={ph.id === s.photoId} onClick={() => { setScene(i, { photoId: ph.id }); setPickFor(null); }} className={cn("relative aspect-[3/4] overflow-hidden rounded border-2", ph.id === s.photoId ? "border-accent" : "border-transparent hover:border-line-strong")}>
                            <img src={ph.url} alt="" className="size-full object-cover" loading="lazy" />
                            {ph.isVisualization && <span className="absolute bottom-0.5 left-0.5 rounded bg-ink/70 px-1 text-[9px] text-white">Wiz.</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            <div>
              <Label htmlFor="v-cta">Wezwanie do działania (plansza końcowa)</Label>
              <Input id="v-cta" className="mt-1.5" value={design.cta} maxLength={50} disabled={!editable} onChange={(e) => edit({ cta: e.target.value })} />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="v-caption">Opis do publikacji</Label>
                <button type="button" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-accent" onClick={async () => { await navigator.clipboard.writeText(design.caption); toast.success("Skopiowano opis"); }}><Copy size={12} /> Kopiuj</button>
              </div>
              <Textarea id="v-caption" className="mt-1.5" rows={5} value={design.caption} maxLength={2200} disabled={!editable} onChange={(e) => setDesign((d) => ({ ...d, caption: e.target.value }))} />
              <p className="mt-1 text-[12px] text-ink-3">Opis nie wpływa na film, więc jego edycja nie cofa akceptacji.</p>
            </div>
            {editable && (
              <div className="flex flex-col gap-2 border-t border-line pt-4">
                <Label htmlFor="v-ai">Nowy scenariusz AI dla tych zdjęć i tej kolejności</Label>
                <div className="flex gap-2">
                  <Input id="v-ai" value={aiNote} maxLength={600} onChange={(e) => setAiNote(e.target.value)} placeholder="Wskazówka, np. krócej i bardziej konkretnie" />
                  <Button variant="secondary" loading={aiBusy} onClick={rewrite}><Sparkle /> Napisz</Button>
                </div>
              </div>
            )}
          </Card>

          <Card className="flex flex-col gap-4 p-4">
            <p className="text-[14px] font-semibold">Styl i długość</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(Object.keys(VIDEO_STYLES) as ReelStyle[]).map((k) => (
                <button key={k} type="button" disabled={!editable} onClick={() => changeStyle(k)} aria-pressed={design.style === k} className={cn("rounded-lg border px-3 py-2 text-left", design.style === k ? "border-accent ring-3 ring-accent/15" : "border-line hover:border-line-strong")}>
                  <span className="block text-[13px] font-medium">{VIDEO_STYLES[k].label}</span>
                  <span className="block text-[11.5px] leading-snug text-ink-3">{VIDEO_STYLES[k].description}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Długość">
              {VIDEO_LENGTHS.map((l) => (
                <Button key={l} size="sm" variant={design.length === l ? "primary" : "secondary"} disabled={!editable} onClick={() => changeLength(l)} aria-pressed={design.length === l}>{l} s · {PHOTO_SCENES[l]} sc.</Button>
              ))}
            </div>
            <div className="flex flex-col gap-3 border-t border-line pt-4">
              <label className="flex items-center justify-between gap-3 text-[13px]"><span className="font-medium text-ink">Pokaż cenę</span><Switch checked={design.showPrice} disabled={!editable} onCheckedChange={(x) => edit({ showPrice: x })} aria-label="Pokaż cenę" /></label>
              <label className="flex items-center justify-between gap-3 text-[13px]"><span className="font-medium text-ink">Pokaż parametry (metraż, pokoje, piętro)</span><Switch checked={design.showParams} disabled={!editable} onCheckedChange={(x) => edit({ showParams: x })} aria-label="Pokaż parametry" /></label>
              <label className="flex items-center justify-between gap-3 text-[13px]"><span><span className="block font-medium text-ink">Oznaczaj wizualizacje</span><span className="block text-[12px] text-ink-3">Zalecane, aby nie wprowadzać odbiorców w błąd.</span></span><Switch checked={design.labelVisualizations} disabled={!editable} onCheckedChange={(x) => edit({ labelVisualizations: x })} aria-label="Oznaczaj wizualizacje" /></label>
            </div>
          </Card>

          <Card className="flex flex-col gap-3 p-4">
            <p className="flex items-center gap-2 text-[14px] font-semibold"><MusicNotes size={16} /> Muzyka (opcjonalnie)</p>
            <p className="text-[12.5px] leading-snug text-ink-3">Używamy wyłącznie utworów dodanych przez biuro z potwierdzeniem praw. Nie dołączamy muzyki z internetu. Na Instagramie i TikToku możesz też dodać licencjonowaną muzykę z biblioteki platformy przy publikacji.</p>
            <NativeSelect aria-label="Utwór" value={design.musicAssetId ?? ""} disabled={!editable} onChange={(e) => edit({ musicAssetId: e.target.value || null })}>
              <option value="">Bez muzyki</option>
              {music.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </NativeSelect>
            {design.musicAssetId && (
              <label className="flex items-center gap-3 text-[12.5px]">
                <span className="w-24 text-ink-3">Głośność</span>
                <input type="range" min={0} max={1} step={0.05} value={design.musicVolume} disabled={!editable} onChange={(e) => edit({ musicVolume: Number(e.target.value) })} className="flex-1 accent-[var(--color-accent)]" aria-label="Głośność muzyki" />
                <span className="w-10 text-right tabular">{Math.round(design.musicVolume * 100)}%</span>
              </label>
            )}
            {editable && (
              <>
                <MusicUpload onDone={(tr) => { setMusic((m) => [{ id: tr.id, label: tr.label }, ...m]); setEnv((e) => ({ ...e, music: { ...e.music, [tr.id]: tr.url } })); edit({ musicAssetId: tr.id }); }} />
                {music.length > 0 && (
                  <ul className="flex flex-col gap-1 text-[12.5px]">
                    {music.map((m) => (
                      <li key={m.id} className="flex items-center justify-between gap-2">
                        <span className="truncate text-ink-2">{m.label}</span>
                        <button type="button" className="text-ink-3 hover:text-danger" onClick={async () => {
                          if (!confirm(`Usunąć utwór „${m.label}” z biblioteki biura?`)) return;
                          const res = await fetch(`/api/media/audio/${m.id}`, { method: "DELETE" });
                          if (!res.ok) return void toast.error((await res.json().catch(() => null))?.error ?? "Nie udało się usunąć.");
                          setMusic((cur) => cur.filter((x) => x.id !== m.id));
                          if (design.musicAssetId === m.id) edit({ musicAssetId: null });
                          toast.success("Usunięto utwór");
                        }}>Usuń</button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Card>

          <Card className="p-4">
            <QaCheckPanel itemId={item.id} initial={qa?.report ?? null} stale={qa?.stale ?? false} dirty={dirty} />
          </Card>
          <Card className="p-4">
            <p className="mb-2 text-[13px] font-medium text-ink">Wersje</p>
            <ul className="flex flex-col divide-y divide-line">
              {versions.map((x) => (
                <li key={x.version} className="flex items-center justify-between gap-2 py-2 text-[12.5px]">
                  <span className="min-w-0"><span className="font-medium text-ink">Wersja {x.version}</span> <span className="text-ink-3" suppressHydrationWarning>· {x.operation ?? x.source} · {formatRelative(x.createdAt)}</span></span>
                  {editable && x.version !== item.version && <Button size="sm" variant="ghost" onClick={async () => { if (dirty && !confirm("Masz niezapisane zmiany. Przywrócenie wersji je porzuci. Kontynuować?")) return; const r = await restoreVersion(item.id, x.version); if (r.ok) { toast.success(r.message ?? "Przywrócono"); router.refresh(); } else toast.error(r.error); }}><ArrowCounterClockwise /> Przywróć</Button>}
                </li>
              ))}
            </ul>
          </Card>
          {aiBusy && <p className="flex items-center gap-2 text-[12.5px] text-ink-3"><Spinner /> AI pisze scenariusz…</p>}
        </div>
      </div>
    </div>
  );
}
