import Link from "next/link";
import { redirect } from "next/navigation";
import { Check } from "@phosphor-icons/react/dist/ssr";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { ColorsStep, LogoStep, SaveStep, SkipButton, TrialStep } from "./steps";
import { finishOnboarding, pauseOnboarding } from "./actions";
import { getOnboarding, ONBOARDING_STEPS, type OnboardingStepId } from "@/lib/onboarding";
import { getUsageSummary } from "@/lib/billing/usage";
import { requireWorkspace } from "@/lib/session";
import { can } from "@/core/auth/permissions";
import { itemHref } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const metadata = { title: "Konfiguracja biura" };

const COPY: Record<OnboardingStepId, { title: string; text: string }> = {
  account: { title: "Konto", text: "" },
  office: { title: "Biuro", text: "" },
  logo: { title: "Dodaj logo biura", text: "Logo pojawi się na grafikach, broszurach i planszy końcowej wideo." },
  colors: { title: "Ustaw kolory marki", text: "Kolory są używane w szablonach grafik, PDF i wideo. Możesz je zmienić później w Brand Studio." },
  property: { title: "Dodaj pierwszą ofertę", text: "Wpisz podstawowe dane i dodaj zdjęcia. Z tej oferty powstaną pierwsze materiały." },
  post: { title: "Wygeneruj pierwszy post", text: "AI przygotuje post sprzedażowy na podstawie danych oferty i Twojej marki. Sprawdzisz go przed użyciem." },
  save: { title: "Zapisz lub pobierz materiał", text: "Każdy materiał jest automatycznie zapisany w bibliotece z historią wersji. Otwórz go i pobierz albo skopiuj tekst." },
  social: { title: "Połącz media społecznościowe (opcjonalnie)", text: "Połączenie konta Facebook, Instagram lub LinkedIn pozwoli planować automatyczne publikacje. Możesz to zrobić później." },
  plan: { title: "Wybierz plan albo kontynuuj okres próbny", text: "Okres próbny daje pełne funkcje z mniejszymi limitami. Plan możesz wybrać w dowolnym momencie." },
};

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const ctx = await requireWorkspace();
  if (!can(ctx.role, "workspace.settings")) redirect("/dashboard");
  const sp = await searchParams;
  const state = await getOnboarding(ctx);
  const requested = ONBOARDING_STEPS.find((s) => s.id === sp.step)?.id;
  const step: OnboardingStepId | null = requested && !["account", "office"].includes(requested) ? requested : state.current;
  const pct = Math.round((state.doneCount / state.total) * 100);
  const [{ data: brand }, usage] = await Promise.all([
    ctx.supabase.from("brand_profiles").select("colors, logo_asset_id").eq("workspace_id", ctx.workspace.id).single(),
    getUsageSummary(ctx),
  ]);
  let logoUrl: string | null = null;
  if (brand?.logo_asset_id) {
    const { data } = await ctx.supabase.from("brand_assets").select("storage_path").eq("id", brand.logo_asset_id).maybeSingle();
    if (data) logoUrl = `/api/files/${data.storage_path}`;
  }
  const status = (id: OnboardingStepId) => state.steps.find((s) => s.id === id)!.status;
  const copy = step ? COPY[step] : null;

  return (
    <div className="flex min-h-dvh flex-col items-center px-5 py-8">
      <div className="flex w-full max-w-3xl items-center justify-between">
        <BrandMark />
        <form action={pauseOnboarding}><Button variant="ghost" size="sm" type="submit">Dokończę później</Button></form>
      </div>
      <main className="w-full max-w-3xl flex-1 py-8">
        <div className="mb-2 flex items-baseline justify-between text-[13px]">
          <span className="font-medium text-ink">Konfiguracja biura „{ctx.workspace.name}”</span>
          <span className="text-ink-3 tabular-nums" data-testid="onboarding-progress">{state.doneCount} z {state.total}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Postęp konfiguracji">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <ol className="mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-9" aria-label="Kroki">
          {state.steps.map((s, i) => (
            <li key={s.id}>
              <Link href={["account", "office"].includes(s.id) ? "#" : `/welcome?step=${s.id}`} aria-current={s.id === step ? "step" : undefined} className={cn("flex h-full flex-col gap-1 rounded-md border px-2 py-1.5 text-[11.5px] leading-tight", s.id === step ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-ink-3 hover:text-ink")}>
                <span className="flex items-center gap-1 font-medium">{s.status === "done" ? <Check size={12} weight="bold" className="text-success" /> : <span className="tabular-nums">{i + 1}.</span>}{s.status === "skipped" && <span className="text-ink-4">pominięty</span>}</span>
                <span>{s.label}</span>
              </Link>
            </li>
          ))}
        </ol>

        {step && copy ? (
          <section className="mt-8 rounded-lg border border-line bg-surface p-6 shadow-xs" aria-labelledby="step-title" data-testid={`onboarding-step-${step}`}>
            <h1 id="step-title" className="text-[22px] font-semibold text-ink">{copy.title}</h1>
            <p className="mt-1.5 max-w-xl text-[14px] text-ink-3">{copy.text}</p>
            <div className="mt-6">
              {step === "logo" && <LogoStep logoUrl={logoUrl} />}
              {step === "colors" && <ColorsStep colors={(brand?.colors ?? {}) as Record<string, string>} />}
              {step === "property" && (status("property") === "done" ? <p className="text-[14px] text-success">Oferta dodana.</p> : <Button asChild><Link href="/properties/new?onboarding=1">Dodaj ofertę</Link></Button>)}
              {step === "post" && (status("post") === "done" ? <p className="text-[14px] text-success">Pierwszy materiał gotowy.</p> : state.firstPropertyId ? <Button asChild><Link href={`/studio/new?type=property_sales_post&property=${state.firstPropertyId}`}>Wygeneruj post sprzedażowy</Link></Button> : <p className="text-[14px] text-ink-3">Najpierw dodaj ofertę.</p>)}
              {step === "save" && (state.firstItem ? <div className="flex flex-wrap gap-2"><Button asChild><Link href={itemHref(state.firstItem)}>Otwórz i pobierz materiał</Link></Button><SaveStep /></div> : <p className="text-[14px] text-ink-3">Najpierw wygeneruj materiał.</p>)}
              {step === "social" && <Button asChild><Link href="/connections">Przejdź do połączonych kont</Link></Button>}
              {step === "plan" && (status("plan") === "done" ? <p className="text-[14px] text-success">Gotowe.</p> : <TrialStep trialEnds={usage.trialEndsAt} />)}
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {["logo", "colors", "social"].includes(step) && status(step) === "todo" && <SkipButton step={step} />}
              <form action={finishOnboarding} className="ml-auto"><Button type="submit" variant={status(step) === "todo" ? "secondary" : "primary"}>{state.current === null ? "Zakończ konfigurację" : "Dalej"}</Button></form>
            </div>
          </section>
        ) : (
          <section className="mt-8 rounded-lg border border-success/20 bg-success-soft p-6" data-testid="onboarding-done">
            <h1 className="text-[22px] font-semibold text-ink">Biuro jest skonfigurowane</h1>
            <p className="mt-1.5 text-[14px] text-ink-2">Możesz tworzyć kampanie, planować publikacje i zapraszać zespół.</p>
            <form action={finishOnboarding} className="mt-5"><Button type="submit">Przejdź do panelu</Button></form>
          </section>
        )}
      </main>
    </div>
  );
}
