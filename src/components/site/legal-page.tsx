import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

/** Shell for legal drafts: the banner states plainly that the text is not approved. */
export function LegalPage({ title, version, children }: { title: string; version: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line"><div className="mx-auto max-w-3xl px-5 py-4"><Link href="/"><BrandMark /></Link></div></header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <p className="mb-6 rounded-lg border border-warning/40 bg-warning-soft px-4 py-3 text-[14px] text-warning" data-testid="legal-draft">PROJEKT DO UZUPEŁNIENIA I ZATWIERDZENIA. Ten dokument został przygotowany jako struktura i nie jest zweryfikowany przez prawnika. Miejsca oznaczone [DO UZUPEŁNIENIA] wymagają danych operatora. Przed uruchomieniem sprzedaży treść musi zatwierdzić osoba z uprawnieniami prawnymi.</p>
        <h1 className="text-[30px] font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-[13px] text-ink-3">Wersja robocza {version}</p>
        <div className="legal mt-8 flex flex-col gap-5 text-[15px] leading-relaxed text-ink-2 [&_h2]:mt-4 [&_h2]:text-[18px] [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc">{children}</div>
      </main>
    </div>
  );
}
