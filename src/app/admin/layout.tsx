import Link from "next/link";
import { AdminNav } from "@/components/admin/admin-nav";
import { Badge } from "@/components/ui/badge";
import { adminPage } from "@/lib/admin/access";

export const metadata = { title: "Panel administratora", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await adminPage();
  return (
    <div className="min-h-screen bg-canvas">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="text-[15px] font-semibold">Ogarnio · administracja platformy</span>
            <Badge tone={admin.role === "admin" ? "accent" : "muted"} data-testid="admin-role">{admin.role === "admin" ? "Administrator" : "Podgląd"}</Badge>
          </div>
          <div className="flex items-center gap-3 text-[12.5px] text-ink-3">
            <span>{admin.email}</span>
            <Link href="/dashboard" className="underline">Wróć do aplikacji</Link>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-6 pb-2"><AdminNav /></div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-7">
        <p className="mb-5 rounded-lg border border-line bg-sunken px-4 py-2 text-[12.5px] text-ink-3">Panel pokazuje liczby i metadane biur. Treści materiałów, zapytań i danych klientów nie są tu dostępne. Każda zmiana trafia do dziennika działań.</p>
        {children}
      </main>
    </div>
  );
}
