"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, PencilSimple, Plus, Trash, X } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { MEMORY_KINDS } from "@/core/brand-memory/learn";
import type { MemoryKind } from "@/lib/supabase/database.types";
import { clearBrandMemory, decideMemorySuggestion, deleteMemoryEntry, rememberPreference, setBrandMemoryEnabled, updateMemoryEntry } from "@/app/(app)/brand/memory/actions";

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  content: string;
  source: string;
  evidenceCount: number;
  evidence: { summary: string; at: string }[];
  at: string;
  canDelete: boolean;
}

export interface DecisionItem {
  id: string;
  label: string;
  detail: string;
  at: string;
}

const SOURCE: Record<string, string> = { manual: "Dodane ręcznie", decision: "Z Twojej poprawki", suggestion: "Zaakceptowana sugestia", approval: "Z akceptacji materiału" };
const ADDABLE: MemoryKind[] = ["cta", "avoid", "headline", "headline_style", "tone", "rejected", "note"];

export function BrandMemoryPanel({
  enabled, canManage, canEdit, explicit, suggested, decisions,
}: { enabled: boolean; canManage: boolean; canEdit: boolean; explicit: MemoryItem[]; suggested: MemoryItem[]; decisions: DecisionItem[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<MemoryKind>("cta");
  const [content, setContent] = useState("");
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message ?? "Zapisano.");
      after?.();
      router.refresh();
    });

  const groups = (Object.keys(MEMORY_KINDS) as MemoryKind[]).map((k) => ({ kind: k, items: explicit.filter((e) => e.kind === k) })).filter((g) => g.items.length);

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold">Pamięć marki</h2>
            <Badge tone={enabled ? "success" : "muted"} data-testid="memory-state">{enabled ? "Włączona" : "Wyłączona"}</Badge>
          </div>
          <p className="mt-1 text-[13px] text-ink-3">
            Zapisane preferencje trafiają do każdego nowego materiału. Sugestie powstają wyłącznie z powtarzających się decyzji i działają dopiero po akceptacji. Pamięć dotyczy tylko tego biura i nie służy do trenowania modeli.
          </p>
        </div>
        <label className="flex items-center gap-2 text-[13.5px]">
          <Switch checked={enabled} disabled={!canManage || pending} onCheckedChange={(v) => run(() => setBrandMemoryEnabled(v))} aria-label="Pamięć marki włączona" />
          {enabled ? "Używaj pamięci" : "Nie używaj pamięci"}
        </label>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Zapisane preferencje" description="Pamięć jawna: zapisana lub zatwierdzona przez zespół." />
            <div className="p-5">
              {canEdit && enabled && (
                <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                  <NativeSelect aria-label="Rodzaj preferencji" value={kind} onChange={(e) => setKind(e.target.value as MemoryKind)} className="sm:w-56">
                    {ADDABLE.map((k) => <option key={k} value={k}>{MEMORY_KINDS[k].label}</option>)}
                  </NativeSelect>
                  <Input aria-label="Treść preferencji" placeholder={MEMORY_KINDS[kind].hint} value={content} onChange={(e) => setContent(e.target.value)} maxLength={300} />
                  <Button variant="secondary" disabled={!content.trim() || pending} onClick={() => run(() => rememberPreference({ kind, content, source: "manual" }), () => setContent(""))}>
                    <Plus /> Dodaj
                  </Button>
                </div>
              )}
              {groups.length === 0 ? (
                <p className="text-[13px] text-ink-3">Brak zapisanych preferencji. Zapamiętuj poprawki w edytorze treści albo dodaj je tutaj.</p>
              ) : (
                <div className="flex flex-col gap-4" data-testid="memory-explicit">
                  {groups.map((g) => (
                    <section key={g.kind}>
                      <h3 className="mb-1.5 text-[12px] font-semibold tracking-wide text-ink-3 uppercase">{MEMORY_KINDS[g.kind].label}</h3>
                      <ul className="flex flex-col divide-y divide-line rounded-md border border-line">
                        {g.items.map((m) => (
                          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="memory-entry">
                            {editing?.id === m.id ? (
                              <div className="flex flex-1 gap-2">
                                <Input aria-label="Edytuj preferencję" value={editing.text} onChange={(e) => setEditing({ ...editing, text: e.target.value })} maxLength={300} />
                                <Button size="sm" onClick={() => run(() => updateMemoryEntry(m.id, editing.text), () => setEditing(null))} disabled={pending}>Zapisz</Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Anuluj</Button>
                              </div>
                            ) : (
                              <>
                                <div className="min-w-0">
                                  <div className="text-[13.5px]">{m.content}</div>
                                  <div className="text-[12px] text-ink-3">{SOURCE[m.source] ?? m.source} · {new Date(m.at).toLocaleDateString("pl-PL")}{m.evidenceCount ? ` · decyzji: ${m.evidenceCount}` : ""}</div>
                                </div>
                                <div className="flex gap-1">
                                  {canEdit && <Button size="icon-sm" variant="ghost" aria-label={`Edytuj: ${m.content}`} onClick={() => setEditing({ id: m.id, text: m.content })}><PencilSimple /></Button>}
                                  {m.canDelete && <Button size="icon-sm" variant="danger-ghost" aria-label={`Usuń: ${m.content}`} onClick={() => run(() => deleteMemoryEntry(m.id))} disabled={pending}><Trash /></Button>}
                                </div>
                              </>
                            )}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Sugestie z Twoich decyzji" description="Pamięć sugerowana: wzorce z co najmniej kilku podobnych decyzji. Nie są używane, dopóki ich nie zaakceptujesz." />
            <div className="p-5">
              {suggested.length === 0 ? (
                <p className="text-[13px] text-ink-3">Brak sugestii. Pojawią się, gdy zespół kilka razy podejmie podobną decyzję (np. dwa razy zmieni CTA na ten sam tekst).</p>
              ) : (
                <ul className="flex flex-col gap-3" data-testid="memory-suggested">
                  {suggested.map((m) => (
                    <li key={m.id} className="rounded-md border border-line p-3" data-testid="memory-suggestion">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[12px] font-medium text-ink-3">{MEMORY_KINDS[m.kind].label}</div>
                          <div className="text-[14px] font-medium">{m.content}</div>
                          <div className="text-[12px] text-ink-3">Na podstawie {m.evidenceCount} decyzji</div>
                        </div>
                        {canEdit && (
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => run(() => decideMemorySuggestion(m.id, "accept"))} disabled={pending}><Check /> Akceptuj</Button>
                            <Button size="sm" variant="ghost" onClick={() => run(() => decideMemorySuggestion(m.id, "dismiss"))} disabled={pending}><X /> Odrzuć</Button>
                            {m.canDelete && <Button size="icon-sm" variant="danger-ghost" aria-label={`Usuń sugestię: ${m.content}`} onClick={() => run(() => deleteMemoryEntry(m.id))} disabled={pending}><Trash /></Button>}
                          </div>
                        )}
                      </div>
                      {m.evidence.length > 0 && (
                        <ul className="mt-2 list-disc pl-4 text-[12px] text-ink-3">
                          {m.evidence.slice(0, 4).map((e, i) => <li key={i}>{e.summary} · {new Date(e.at).toLocaleString("pl-PL")}</li>)}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Ostatnie decyzje" description="Ustrukturyzowany zapis akceptacji, poprawek i odrzuceń (bez treści rozmów z AI). Przechowywany 12 miesięcy." />
            <ul className="max-h-[28rem] overflow-y-auto px-5 py-2 text-[12.5px]" data-testid="memory-decisions">
              {decisions.length === 0 && <li className="py-2 text-ink-3">Brak zapisanych decyzji.</li>}
              {decisions.map((d) => (
                <li key={d.id} className="border-b border-line py-2 last:border-0">
                  <div className="font-medium text-ink-2">{d.label}</div>
                  {d.detail && <div className="text-ink-3">{d.detail}</div>}
                  <div className="text-ink-4">{new Date(d.at).toLocaleString("pl-PL")}</div>
                </li>
              ))}
            </ul>
          </Card>
          {canManage && (
            <Card className="p-5">
              <h2 className="text-[14px] font-semibold">Usuwanie i eksport</h2>
              <p className="mt-1 text-[12.5px] text-ink-3">Eksport zawiera profil marki, historię wersji i pamięć. Usunięcie kasuje wszystkie preferencje, sugestie i zapisane decyzje tego biura.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild variant="secondary" size="sm"><a href="/api/brand/export" download>Eksportuj (JSON)</a></Button>
                <Button
                  variant="danger-ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    if (confirm("Usunąć całą pamięć marki? Tej operacji nie można cofnąć.")) run(() => clearBrandMemory());
                  }}
                >
                  <Trash /> Usuń całą pamięć
                </Button>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
