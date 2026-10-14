"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ArrowCounterClockwise, ArrowLeft, ArrowsIn, ArrowsOut, ChatCircleText, Copy, DotsThree, DownloadSimple, FileText, Lightning, MagicWand, Megaphone, Plus, Sparkle, Trash, TextT, Warning,
} from "@phosphor-icons/react/dist/ssr";
import { Button, Spinner } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input, NativeSelect, Textarea } from "@/components/ui/field";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDelete } from "@/components/common/confirm-delete";
import { QualityPanel } from "./quality-panel";
import { QaCheckPanel } from "@/components/qa/qa-check-panel";
import type { QaReport } from "@/core/qa/types";
import { RememberPanel } from "@/components/brand/remember-panel";
import type { Candidate } from "@/core/brand-memory/learn";
import { deleteItem, duplicateItem, removeVariant, restoreVersion, saveManualEdit, selectVariant, updateItemMeta } from "@/app/(app)/library/actions";
import type { TextBody } from "@/core/marketing-engine/request";
import { variantToText, type Variant } from "@/core/marketing-engine/schemas";
import type { SkillUsage } from "@/core/marketing-engine/skills/composer";
import { CTA_TYPES, TONE_OVERRIDES, type CtaType, type ToneOverride } from "@/core/marketing-engine/taxonomy";
import type { RefineRequest } from "@/core/marketing-engine/prompt";
import { getContentType } from "@/verticals/real-estate/content-types";
import { sectionLimit } from "@/core/marketing-engine/content-types";
import { cn, formatRelative, slugify } from "@/lib/utils";
import { t } from "@/i18n/pl";

interface Props {
  item: { id: string; title: string; status: "draft" | "review" | "ready"; contentType: string; platform: string | null; propertyId: string | null; propertyTitle: string | null; updatedAt: string; version: number };
  body: TextBody;
  versions: { version: number; source: string; operation: string | null; createdAt: string }[];
  skills: SkillUsage;
  facts: { label: string; value: string }[];
  model: string | null;
  editable: boolean;
  qa?: { report: QaReport; stale: boolean } | null;
}

const SOURCE_LABEL: Record<string, string> = { ai_generate: "AI", ai_refine: "Poprawka AI", manual: "Ręcznie", duplicate: "Duplikat", template: "Szablon" };
const LAYER_LABEL: Record<string, string> = { guardrail: "Zasady nadrzędne", brand: "Marka", strategy: "Strategia", domain: "Branża", format: "Format", technique: "Technika", qa: "Kontrola" };

function download(name: string, content: string, type: string) {
  const blob = new Blob([content], { type: `${type};charset=utf-8` });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function toMarkdown(v: Variant, title: string) {
  const parts = [`# ${v.headline || title}`];
  for (const s of v.sections) if (s.content.trim()) parts.push(`## ${s.label}\n\n${s.content}`);
  if (v.cta) parts.push(`**CTA:** ${v.cta}`);
  if (v.hashtags.length) parts.push(v.hashtags.join(" "));
  return parts.join("\n\n");
}

export function TextEditor({ item, body, versions, skills, facts, model, editable, qa = null }: Props) {
  const router = useRouter();
  const def = useMemo(() => getContentType(body.request.contentType), [body.request.contentType]);
  const [selected, setSelected] = useState(body.selected);
  const stored = body.variants.find((v) => v.id === selected) ?? body.variants[0]!;
  const [draft, setDraft] = useState<Variant>(stored.variant);
  const [quality, setQuality] = useState(stored.quality);
  const [title, setTitle] = useState(item.title);
  const [status, setStatus] = useState(item.status);
  const [busy, setBusy] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [remember, setRemember] = useState<Candidate[]>([]);
  // The editor remounts on every new version, so the "remember?" offer survives the refresh in sessionStorage.
  const rememberKey = `oe-remember:${item.id}`;
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(rememberKey);
      if (raw) {
        sessionStorage.removeItem(rememberKey);
        setRemember(JSON.parse(raw) as Candidate[]);
      }
    } catch {
      /* storage unavailable: the offer is simply not shown */
    }
  }, [rememberKey]);
  const [custom, setCustom] = useState<{ open: boolean; sectionKey?: string; text: string }>({ open: false, text: "" });
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored.variant);

  function switchVariant(id: string) {
    if (dirty && !confirm("Masz niezapisane zmiany w tym wariancie. Porzucić je?")) return;
    const v = body.variants.find((x) => x.id === id)!;
    setSelected(id);
    setDraft(v.variant);
    setQuality(v.quality);
    if (editable) void selectVariant(item.id, id);
  }

  async function ai(path: string, payload: Record<string, unknown>, label: string) {
    if (dirty) {
      toast.error("Najpierw zapisz lub cofnij ręczne zmiany.");
      return;
    }
    setBusy(label);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = (await res.json()) as { error?: string; changeSummary?: string };
      if (!res.ok) throw new Error(json.error ?? "Nie udało się wykonać operacji.");
      toast.success(json.changeSummary ?? "Gotowe. Zapisano nową wersję.");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Nie udało się wykonać operacji.");
      setBusy(null);
    }
  }
  const refine = (r: RefineRequest, label: string) => ai("/api/ai/refine", { itemId: item.id, variantId: selected, refine: r }, label);

  function save() {
    startSave(async () => {
      const res = await saveManualEdit(item.id, selected, draft);
      if (res.ok) {
        toast.success(res.message ?? "Zapisano");
        setRemember(res.data.remember);
        try {
          if (res.data.remember.length) sessionStorage.setItem(rememberKey, JSON.stringify(res.data.remember));
        } catch {
          /* ignore */
        }
        router.refresh();
      } else toast.error(res.error);
    });
  }

  const setSection = (key: string, patch: Partial<Variant["sections"][number]>) => setDraft((d) => ({ ...d, sections: d.sections.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));
  const text = variantToText(draft);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <Link href="/library" className="mb-2 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 hover:text-ink"><ArrowLeft size={13} /> Biblioteka</Link>
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
            className="w-full rounded-md bg-transparent px-1 -mx-1 text-[24px] font-semibold text-ink outline-none hover:bg-sunken/70 focus:bg-surface focus:ring-3 focus:ring-accent/15"
            aria-label="Tytuł materiału"
            maxLength={200}
          />
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ink-3">
            <span>{item.contentType}</span>
            {item.platform && <span>· {item.platform}</span>}
            {item.propertyTitle && <span>· <Link href={`/properties/${item.propertyId}`} className="hover:text-ink hover:underline">{item.propertyTitle}</Link></span>}
            <span suppressHydrationWarning>· wersja {item.version}, {formatRelative(item.updatedAt)}</span>
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
          <Button variant="secondary" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success(t.common.copied))}><Copy /> Kopiuj</Button>
          <Menu>
            <MenuTrigger asChild><Button variant="secondary" size="icon" aria-label="Więcej"><DotsThree size={18} weight="bold" /></Button></MenuTrigger>
            <MenuContent>
              <MenuLabel>Eksport wariantu</MenuLabel>
              <MenuItem onSelect={() => download(`${slugify(title)}.txt`, text, "text/plain")}><FileText /> Plik tekstowy (.txt)</MenuItem>
              <MenuItem onSelect={() => download(`${slugify(title)}.md`, toMarkdown(draft, title), "text/markdown")}><DownloadSimple /> Markdown (.md)</MenuItem>
              <MenuItem onSelect={() => download(`${slugify(title)}-wszystkie-warianty.txt`, body.variants.map((v, i) => `=== Wariant ${i + 1}: ${v.variant.angle} ===\n\n${variantToText(v.variant)}`).join("\n\n\n"), "text/plain")}><DownloadSimple /> Wszystkie warianty (.txt)</MenuItem>
              {editable && (
                <>
                  <MenuSeparator />
                  <MenuItem onSelect={() => void duplicateItem(item.id)}><Copy /> Duplikuj materiał</MenuItem>
                </>
              )}
            </MenuContent>
          </Menu>
          {editable && <ConfirmDelete title="Usunąć materiał?" description="Usuniemy materiał ze wszystkimi wersjami." action={() => deleteItem(item.id)} onDone={() => router.push("/library")} trigger={<Button variant="ghost" size="icon" aria-label="Usuń materiał"><Trash /></Button>} />}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1 rounded-lg bg-sunken p-0.5" role="tablist" aria-label="Warianty">
              {body.variants.map((v, i) => (
                <button key={v.id} role="tab" aria-selected={v.id === selected} onClick={() => switchVariant(v.id)} className={cn("flex h-8 items-center gap-2 rounded-md px-3 text-[13px] font-medium transition-colors", v.id === selected ? "bg-surface text-ink shadow-xs" : "text-ink-3 hover:text-ink")}>
                  Wariant {i + 1}
                  <span className={cn("tabular rounded px-1 text-[11px]", (v.quality?.score ?? 0) >= 85 ? "bg-success-soft text-success" : (v.quality?.score ?? 0) >= 65 ? "bg-warning-soft text-warning" : "bg-danger-soft text-danger")}>{v.quality?.score ?? "–"}</span>
                </button>
              ))}
            </div>
            {editable && (
              <Button variant="soft" size="sm" loading={busy === "more"} disabled={!!busy} onClick={() => ai("/api/ai/variants", { itemId: item.id, count: 2 }, "more")}>
                <Plus weight="bold" /> Więcej wariantów
              </Button>
            )}
          </div>

          {editable && (
            <Card className="flex flex-wrap items-center gap-1 p-1.5">
              <span className="px-2 text-[12px] font-medium text-ink-3"><Sparkle size={14} weight="fill" className="mr-1 inline text-accent" />Popraw z AI</span>
              {[
                { op: "headline", label: "Nowy nagłówek", icon: TextT },
                { op: "hook", label: "Inny hook", icon: Lightning },
                { op: "shorten", label: "Skróć", icon: ArrowsIn },
                { op: "expand", label: "Rozbuduj", icon: ArrowsOut },
              ].map((a) => (
                <Button key={a.op} variant="ghost" size="sm" loading={busy === a.op} disabled={!!busy} onClick={() => refine({ operation: a.op as RefineRequest["operation"] }, a.op)}>
                  <a.icon /> {a.label}
                </Button>
              ))}
              <Menu>
                <MenuTrigger asChild><Button variant="ghost" size="sm" disabled={!!busy} loading={busy === "tone"}><ChatCircleText /> Ton</Button></MenuTrigger>
                <MenuContent align="start">
                  {(Object.keys(TONE_OVERRIDES) as ToneOverride[]).filter((k) => k !== "brand").map((k) => <MenuItem key={k} onSelect={() => refine({ operation: "tone", tone: k }, "tone")}>{TONE_OVERRIDES[k]}</MenuItem>)}
                </MenuContent>
              </Menu>
              <Menu>
                <MenuTrigger asChild><Button variant="ghost" size="sm" disabled={!!busy} loading={busy === "cta"}><Megaphone /> CTA</Button></MenuTrigger>
                <MenuContent align="start">
                  {(Object.keys(CTA_TYPES) as CtaType[]).map((k) => <MenuItem key={k} onSelect={() => refine({ operation: "cta", ctaType: k }, "cta")}>{CTA_TYPES[k]}</MenuItem>)}
                </MenuContent>
              </Menu>
              <Button variant="ghost" size="sm" disabled={!!busy} loading={busy === "custom"} onClick={() => setCustom({ open: true, text: "" })}><MagicWand /> Własna instrukcja</Button>
            </Card>
          )}

          <Card className="relative overflow-hidden">
            {busy && busy !== "more" && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/70 backdrop-blur-[1px]">
                <span className="flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-[13px] shadow-sm"><Spinner /> Poprawiam i sprawdzam jakość…</span>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
              <div className="min-w-0 text-[12.5px] text-ink-3">
                <span className="font-medium text-ink-2">Kąt:</span> {draft.angle || "—"}
                {stored.changeSummary && <span className="ml-2 text-ink-4">· {stored.changeSummary}</span>}
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={stored.origin === "manual" ? "outline" : "accent"}>{stored.origin === "manual" ? "Edytowany ręcznie" : stored.origin === "refine" ? "Poprawiony z AI" : "Wygenerowany"}</Badge>
                {editable && body.variants.length > 1 && (
                  <ConfirmDelete title="Usunąć ten wariant?" description="Pozostałe warianty zostaną. Usunięty wariant znajdziesz w historii wersji." action={() => removeVariant(item.id, selected)} onDone={() => router.refresh()} trigger={<Button variant="ghost" size="icon-sm" aria-label="Usuń wariant"><Trash /></Button>} />
                )}
              </div>
            </div>
            <fieldset disabled={!editable} className="flex flex-col gap-5 p-5">
              {(def?.usesHeadline || draft.headline) && (
                <EditorField label="Nagłówek" count={draft.headline.length}>
                  <Input aria-label="Nagłówek" value={draft.headline} onChange={(e) => setDraft({ ...draft, headline: e.target.value })} className="h-11 text-[17px] font-semibold" />
                </EditorField>
              )}
              <EditorField label="Hook (pierwsze zdanie)" count={draft.hook.length} limit={125}>
                <Textarea rows={2} value={draft.hook} onChange={(e) => setDraft({ ...draft, hook: e.target.value })} className="min-h-0" />
              </EditorField>
              {draft.sections.map((s) => {
                const limit = def ? sectionLimit(def, s.key) : undefined;
                const custom = def?.sequence?.modelLabels && def.sequence.prefix && s.key.startsWith(def.sequence.prefix);
                return (
                  <EditorField
                    key={s.key}
                    label={custom ? undefined : s.label}
                    labelInput={custom ? <Input value={s.label} onChange={(e) => setSection(s.key, { label: e.target.value })} className="h-8 text-[13px] font-medium" aria-label="Etykieta sekcji" /> : undefined}
                    count={s.content.length}
                    limit={limit}
                    action={editable && (
                      <button type="button" disabled={!!busy} onClick={() => setCustom({ open: true, sectionKey: s.key, text: "" })} className="text-[12px] text-ink-3 hover:text-accent disabled:opacity-50">
                        Popraw sekcję
                      </button>
                    )}
                  >
                    <Textarea value={s.content} onChange={(e) => setSection(s.key, { content: e.target.value })} rows={Math.min(14, Math.max(2, Math.ceil(s.content.length / 90) + s.content.split("\n").length))} className={cn(!s.content && "border-dashed")} placeholder="Pusta sekcja (brak danych)" />
                  </EditorField>
                );
              })}
              <div className="grid gap-5 sm:grid-cols-2">
                <EditorField label="CTA" count={draft.cta.length}>
                  <Input aria-label="CTA" value={draft.cta} onChange={(e) => setDraft({ ...draft, cta: e.target.value })} />
                </EditorField>
                {(def?.usesHashtags || draft.hashtags.length > 0) && (
                  <EditorField label="Hashtagi">
                    <Input value={draft.hashtags.join(" ")} onChange={(e) => setDraft({ ...draft, hashtags: e.target.value.split(/\s+/).filter(Boolean) })} />
                  </EditorField>
                )}
              </div>
              {draft.notes && <p className="rounded-md bg-sunken px-3 py-2 text-[12.5px] text-ink-3"><span className="font-medium text-ink-2">Uwagi:</span> {draft.notes}</p>}
            </fieldset>
            {remember.length > 0 && !dirty && (
              <div className="border-t border-line px-5 py-4">
                <RememberPanel candidates={remember} onClose={() => setRemember([])} />
              </div>
            )}
            {editable && dirty && (
              <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur-sm">
                <span className="mr-auto text-[12.5px] text-ink-3">Niezapisane zmiany. Zapis tworzy nową wersję i ponownie sprawdza jakość.</span>
                <Button variant="ghost" onClick={() => setDraft(stored.variant)}>Cofnij</Button>
                <Button onClick={save} loading={saving}>Zapisz wersję</Button>
              </div>
            )}
          </Card>
        </div>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-8 xl:self-start">
          {body.gaps.length > 0 && (
            <Card className="border-warning/25 bg-warning-soft/50 p-4">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-warning"><Warning size={16} weight="fill" /> Brakujące informacje</div>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[12.5px] text-ink-2">{body.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
              <p className="mt-2 text-[12px] text-ink-3">Uzupełnij je w danych oferty, a tekst będzie konkretniejszy. Generator ich nie zgadywał.</p>
            </Card>
          )}
          <Card className="p-4">
            <Tabs defaultValue="quality">
              <TabsList className="mb-4 w-full">
                <TabsTrigger value="quality" className="flex-1">Jakość</TabsTrigger>
                <TabsTrigger value="skills" className="flex-1">Kompetencje</TabsTrigger>
                <TabsTrigger value="facts" className="flex-1">Fakty</TabsTrigger>
                <TabsTrigger value="versions" className="flex-1">Wersje</TabsTrigger>
              </TabsList>
              <TabsContent value="quality"><QualityPanel report={dirty ? null : quality} />{dirty && <p className="text-[12.5px] text-ink-3">Zapisz zmiany, aby ponownie sprawdzić jakość.</p>}<div className="mt-5 border-t border-line pt-4"><QaCheckPanel itemId={item.id} initial={qa?.report ?? null} stale={qa?.stale ?? false} dirty={dirty} /></div></TabsContent>
              <TabsContent value="skills">
                <p className="mb-3 text-[12.5px] text-ink-3">Kompetencje dobrane automatycznie do rodzaju treści, platformy, celu i stylu marki{model ? ` · model: ${model}` : ""}.</p>
                <ul className="flex flex-col gap-2">
                  {skills.map((s) => (
                    <li key={s.id} className="rounded-md border border-line px-3 py-2">
                      <div className="flex items-center justify-between gap-2"><span className="text-[13px] font-medium">{s.name}</span><span className="text-[11px] text-ink-4">{LAYER_LABEL[s.layer] ?? s.layer}</span></div>
                      <div className="mt-0.5 text-[11.5px] text-ink-3">{s.reasons.join(" · ")}{s.source === "imported" ? " · zaimportowana" : ""}</div>
                    </li>
                  ))}
                  {skills.length === 0 && <li className="text-[13px] text-ink-3">Brak danych o kompetencjach.</li>}
                </ul>
              </TabsContent>
              <TabsContent value="facts">
                {facts.length ? (
                  <>
                    <p className="mb-3 text-[12.5px] text-ink-3">Jedyne fakty, których mógł użyć generator. Liczby spoza tej listy oznacza kontrola jakości.</p>
                    <dl className="flex flex-col gap-1.5">{facts.map((f) => <div key={f.label} className="flex justify-between gap-3 text-[12.5px]"><dt className="text-ink-3">{f.label}</dt><dd className="text-right font-medium">{f.value}</dd></div>)}</dl>
                  </>
                ) : <p className="text-[13px] text-ink-3">Materiał nie jest powiązany z nieruchomością.</p>}
              </TabsContent>
              <TabsContent value="versions">
                <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto">
                  {versions.map((v) => (
                    <li key={v.version} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] hover:bg-sunken">
                      <span className="tabular w-7 font-medium text-ink-2">v{v.version}</span>
                      <span className="min-w-0 flex-1 truncate text-ink-2">{v.operation ?? SOURCE_LABEL[v.source]}</span>
                      <span className="text-ink-4" suppressHydrationWarning>{formatRelative(v.createdAt)}</span>
                      {editable && v.version !== item.version && (
                        <button className="rounded p-1 text-ink-3 hover:bg-surface hover:text-accent" aria-label={`Przywróć wersję ${v.version}`} onClick={async () => { const r = await restoreVersion(item.id, v.version); if (r.ok) { toast.success(r.message ?? "Przywrócono"); router.refresh(); } else toast.error(r.error); }}>
                          <ArrowCounterClockwise size={14} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </TabsContent>
            </Tabs>
          </Card>
        </aside>
      </div>

      <Dialog open={custom.open} onOpenChange={(o) => setCustom((c) => ({ ...c, open: o }))}>
        <DialogContent title={custom.sectionKey ? "Popraw sekcję" : "Własna instrukcja"} description={custom.sectionKey ? "Opisz, co poprawić w tej sekcji. Puste pole: AI poprawi jasność i konkret." : "Napisz, co zmienić. Zasady faktów i marki nadal obowiązują."}>
          <form onSubmit={(e) => { e.preventDefault(); setCustom((c) => ({ ...c, open: false })); void refine(custom.sectionKey ? { operation: "section", sectionKey: custom.sectionKey, instruction: custom.text || undefined } : { operation: "custom", instruction: custom.text }, custom.sectionKey ? "section" : "custom"); }} className="flex flex-col gap-4">
            <Textarea autoFocus rows={4} value={custom.text} onChange={(e) => setCustom((c) => ({ ...c, text: e.target.value }))} maxLength={1000} placeholder={custom.sectionKey ? "np. więcej o ciszy i zieleni po stronie podwórza" : "np. dodaj pytanie na końcu, bez wspominania o kredycie"} aria-label="Instrukcja" />
            <div className="flex justify-end gap-2">
              <DialogClose asChild><Button type="button" variant="secondary">Anuluj</Button></DialogClose>
              <Button type="submit" disabled={!custom.sectionKey && !custom.text.trim()}><Sparkle weight="fill" /> Popraw</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditorField({ label, labelInput, count, limit, action, children }: { label?: string; labelInput?: React.ReactNode; count?: number; limit?: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        {labelInput ?? <span className="text-[12.5px] font-medium text-ink-3">{label}</span>}
        <span className="flex shrink-0 items-center gap-3">
          {action}
          {count !== undefined && <span className={cn("tabular text-[11.5px]", limit && count > limit ? "font-medium text-danger" : "text-ink-4")}>{count}{limit ? ` / ${limit}` : ""}</span>}
        </span>
      </div>
      {children}
    </div>
  );
}
