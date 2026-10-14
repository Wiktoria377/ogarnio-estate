"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/brand", label: "Brand Studio", match: (p: string) => p === "/brand" },
  { href: "/brand/intelligence", label: "Poznaj moją markę", match: (p: string) => p.startsWith("/brand/intelligence") || p.startsWith("/brand/versions") },
  { href: "/brand/profile", label: "Profil marki", match: (p: string) => p === "/brand/profile" },
  { href: "/brand/memory", label: "Pamięć marki", match: (p: string) => p === "/brand/memory" },
  { href: "/brand/history", label: "Historia zmian", match: (p: string) => p === "/brand/history" },
];

export function BrandNav() {
  const path = usePathname();
  return (
    <nav aria-label="Marka" className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-line px-1">
      {TABS.map((t) => {
        const active = t.match(path);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 py-2 text-[13.5px] whitespace-nowrap", active ? "border-accent font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
