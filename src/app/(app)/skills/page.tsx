import Link from "next/link";
import { MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { loadSkills } from "@/core/marketing-engine/skills/loader";
import { SKILL_CATEGORIES, SKILL_LAYERS } from "@/core/marketing-engine/skills/types";
import { PLATFORMS, GOALS } from "@/core/marketing-engine/taxonomy";
import { requireWorkspace } from "@/lib/session";
import { loadSkillUsefulness } from "@/lib/skills-usefulness";
import { MIN_USES } from "@/core/marketing-engine/skills/usefulness";
import { cn } from "@/lib/utils";

export const metadata = { title: "Kompetencje AI" };

const CATEGORY: Record<string, string> = {
  core: "Zasady nadrzędne", copywriting: "Copywriting", "social-media": "Social media", "real-estate": "Nieruchomości", "performance-marketing": "Reklama płatna",
  "brand-strategy": "Strategia marki", "content-strategy": "Strategia treści", design: "Grafika i design", email: "E-mail", imported: "Zaimportowane",
};
const LAYER: Record<string, string> = { guardrail: "Zasady nadrzędne", brand: "Marka", strategy: "Strategia", domain: "Branża", format: "Format", technique: "Technika", qa: "Kontrola" };
const TASK: Record<string, string> = {
  generate: "generowanie", refine: "poprawki", graphic_copy: "teksty na grafiki", review: "kontrola jakości", campaign_brief: "brief kampanii", video_script: "scenariusze wideo",
  brand_analysis: "analiza marki", strategy: "strategia", creative_variants: "warianty kreatywne", autopilot_plan: "plan miesięczny",
};

export default async function SkillsPage({ searchParams }: { searchParams: Promise<{ category?: string; q?: string }> }) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const { stats, materials } = await loadSkillUsefulness(ctx);
  const all = loadSkills();
  const q = sp.q?.trim().toLowerCase().slice(0, 80);
  const cat = SKILL_CATEGORIES.includes(sp.category as (typeof SKILL_CATEGORIES)[number]) ? sp.category : undefined;
  const skills = all
    .filter((s) => !cat || s.category === cat)
    .filter((s) => !q || `${s.name} ${s.description} ${s.tags.join(" ")} ${s.id}`.toLowerCase().includes(q))
    .sort((a, b) => SKILL_LAYERS.indexOf(a.layer) - SKILL_LAYERS.indexOf(b.layer) || b.priority - a.priority || a.name.localeCompare(b.name, "pl"));
  const counts = new Map<string, number>();
  for (const s of all) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title="Kompetencje AI"
        description={`${all.length} modułowych kompetencji, z których silnik automatycznie dobiera zestaw do każdego zadania: zasady nadrzędne, marka, strategia, branża, format, techniki i kontrola jakości. Lista wybranych kompetencji jest widoczna przy każdym materiale.`}
      />
      <p className="mb-4 text-[12.5px] text-ink-3" data-testid="usefulness-note">
        Skuteczność liczona na materiałach Twojego biura ({materials} z AI): odsetek materiałów oznaczonych jako gotowe bez ręcznych poprawek. Pokazujemy ją od {MIN_USES} użyć. To wskazówka, a nie obiektywna ocena jakości.
      </p>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <Link href={q ? `/skills?q=${encodeURIComponent(q)}` : "/skills"} className={cn("rounded-full border px-3 py-1 text-[12.5px]", !cat ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-ink-2 hover:border-line-strong")}>Wszystkie ({all.length})</Link>
        {SKILL_CATEGORIES.filter((c) => counts.get(c)).map((c) => (
          <Link key={c} href={`/skills?category=${c}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={cn("rounded-full border px-3 py-1 text-[12.5px]", cat === c ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-ink-2 hover:border-line-strong")}>
            {CATEGORY[c]} ({counts.get(c)})
          </Link>
        ))}
        <form action="/skills" className="relative ml-auto w-full sm:w-64" role="search">
          {cat && <input type="hidden" name="category" value={cat} />}
          <MagnifyingGlass size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-4" />
          <Input name="q" defaultValue={q} placeholder="Szukaj kompetencji" aria-label="Szukaj kompetencji" className="pl-9" />
        </form>
      </div>
      {skills.length === 0 ? (
        <Card className="p-10 text-center text-[13.5px] text-ink-3">Brak kompetencji dla tego wyszukiwania. <Button variant="link" asChild><Link href="/skills">Pokaż wszystkie</Link></Button></Card>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {skills.map((s) => (
            <li key={s.id}>
              <Card className="p-0">
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-start gap-3 p-4 [&::-webkit-details-marker]:hidden">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-medium text-ink">{s.name}</span>
                        {s.always && <Badge tone="accent">Zawsze aktywna</Badge>}
                        {(() => {
                          const u = stats.get(s.id);
                          if (!u) return null;
                          return u.rate === null ? (
                            <Badge tone="muted" data-testid="usefulness">Użyta {u.uses}× (za mało danych)</Badge>
                          ) : (
                            <Badge tone="outline" data-testid="usefulness" title={`Gotowe bez poprawek: ${u.approvedUnedited} z ${u.uses}; poprawiane: ${u.edited}`}>
                              Skuteczność {Math.round(u.rate * 100)}% · {u.uses} użyć
                            </Badge>
                          );
                        })()}
                      </div>
                      <p className="mt-1 text-[12.5px] leading-snug text-ink-3">{s.description}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Badge tone="outline">{LAYER[s.layer]}</Badge>
                        <Badge tone="muted">{CATEGORY[s.category]}</Badge>
                        <Badge tone="muted">{s.source.type === "imported" ? "Zaimportowana" : "Wbudowana"} · v{s.version}</Badge>
                      </div>
                    </div>
                    <span className="mt-1 text-[12px] text-ink-4 group-open:hidden">Szczegóły</span>
                    <span className="mt-1 hidden text-[12px] text-ink-4 group-open:inline">Zwiń</span>
                  </summary>
                  <div className="flex flex-col gap-3 border-t border-line px-4 py-3.5 text-[12.5px] text-ink-2">
                    <p><span className="font-medium text-ink">Cel: </span>{s.purpose}</p>
                    <p>
                      <span className="font-medium text-ink">Kiedy jest wybierana: </span>
                      {[
                        s.always && "zawsze",
                        s.applies_to.tasks?.length && `zadania: ${s.applies_to.tasks.map((t) => TASK[t] ?? t).join(", ")}`,
                        s.applies_to.platforms?.length && `platformy: ${s.applies_to.platforms.map((p) => PLATFORMS[p].label).join(", ")}`,
                        s.applies_to.goals?.length && `cele: ${s.applies_to.goals.map((g) => GOALS[g]).join(", ").toLowerCase()}`,
                        s.applies_to.output_kinds?.length && `formy: ${s.applies_to.output_kinds.join(", ")}`,
                        s.applies_to.content_types?.length && `${s.applies_to.content_types.length} rodzajów treści`,
                        s.applies_to.requires_property && "wymaga oferty",
                        s.applies_to.brand_styles?.length && `styl marki: ${s.applies_to.brand_styles.join(", ")}`,
                      ].filter(Boolean).join(" · ") || "dobierana po tagach i dopasowaniu do zadania"}
                    </p>
                    <div>
                      <p className="font-medium text-ink">Kryteria jakości</p>
                      <ul className="mt-1 list-disc pl-5">{s.quality_criteria.map((c) => <li key={c}>{c}</li>)}</ul>
                    </div>
                    <p className="text-ink-3">
                      Źródło: {s.source.origin}{s.source.license ? ` · licencja ${s.source.license}` : ""} · ok. {s.tokens} tokenów · <code className="rounded bg-sunken px-1">{s.id}</code>
                    </p>
                  </div>
                </details>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
