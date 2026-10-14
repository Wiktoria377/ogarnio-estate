import { BrandMark } from "@/components/brand-mark";
import { OnboardingForm } from "./form";
import { getWorkspaceContext, requireUser } from "@/lib/session";

export const metadata = { title: "Nowe biuro" };

export default async function OnboardingPage() {
  const { user } = await requireUser();
  const ctx = await getWorkspaceContext();
  const first = !ctx;
  const name = (user.user_metadata as { full_name?: string } | null)?.full_name?.split(" ")[0];
  return (
    <div className="flex min-h-dvh flex-col items-center px-6 py-10">
      <BrandMark />
      <main className="flex w-full max-w-lg flex-1 flex-col justify-center py-12">
        <div className="mb-1 text-[13px] font-medium text-accent">{first ? "Krok 1 z 2" : "Nowe biuro"}</div>
        <h1 className="text-[28px] leading-tight font-semibold">{first ? `Cześć${name ? `, ${name}` : ""}! Jak nazywa się Twoje biuro?` : "Dodaj kolejne biuro"}</h1>
        <p className="mt-2 text-[14.5px] leading-relaxed text-ink-3">
          Każde biuro ma osobną markę, oferty i bibliotekę materiałów. Dane biur są od siebie całkowicie oddzielone.
          {first && " W następnym kroku ustawisz logo, kolory i styl komunikacji."}
        </p>
        <OnboardingForm />
      </main>
    </div>
  );
}
