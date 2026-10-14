import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-6 py-8 sm:px-12">
        <Link href="/login" className="w-fit">
          <BrandMark />
        </Link>
        <main className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-[380px]">{children}</div>
        </main>
        <p className="text-[12px] text-ink-4">© {new Date().getFullYear()} Ogarnio Estate</p>
      </div>
      <aside className="relative hidden overflow-hidden border-l border-line bg-sunken lg:block">
        <div className="absolute inset-0 flex flex-col justify-between p-14">
          <p className="max-w-md font-display text-[44px] leading-[1.05] text-ink">
            Marka, oferty i&nbsp;treści biura w&nbsp;jednym spokojnym miejscu.
          </p>
          <div className="grid max-w-lg grid-cols-2 gap-3">
            {[
              ["Brand Studio", "Kolory, fonty i głos marki stosowane w każdym materiale."],
              ["Studio treści", "40 rodzajów tekstów z kontrolą faktów i jakości."],
              ["Studio grafik", "Posty, Stories i karuzele z danymi oferty."],
              ["Biblioteka", "Wersje, statusy i eksport bez gubienia pracy."],
            ].map(([title, body]) => (
              <div key={title} className="rounded-lg border border-line bg-surface p-4 shadow-xs">
                <div className="text-[13px] font-semibold text-ink">{title}</div>
                <div className="mt-1 text-[12.5px] leading-relaxed text-ink-3">{body}</div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
