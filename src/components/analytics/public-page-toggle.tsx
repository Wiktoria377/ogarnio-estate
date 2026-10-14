"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Copy } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { togglePublicPage } from "@/app/(app)/analytics/actions";

export function PublicPageToggle({ propertyId, enabled, url, editable }: { propertyId: string; enabled: boolean; url: string | null; editable: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2 text-[13px]" data-testid="public-page">
      {enabled && url ? (
        <span className="flex items-center gap-1.5">
          <a href={url} target="_blank" rel="noopener noreferrer" className="truncate text-accent-ink underline" data-testid="public-url">{url}</a>
          <Button size="icon-sm" variant="ghost" aria-label="Kopiuj adres" onClick={() => navigator.clipboard.writeText(url).then(() => toast.success("Skopiowano."))}><Copy /></Button>
        </span>
      ) : (
        <p className="text-ink-3">Strona jest wyłączona. Po włączeniu każdy, kto zna adres, zobaczy dane oferty (bez ulicy, jeśli jest ukryta) i formularz kontaktowy ze zgodą RODO.</p>
      )}
      {editable && (
        <Button size="sm" variant={enabled ? "secondary" : "primary"} loading={pending} onClick={() => start(async () => {
          const r = await togglePublicPage(propertyId, !enabled);
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.message ?? "Zapisano.");
          router.refresh();
        })}>{enabled ? "Wyłącz stronę oferty" : "Włącz stronę oferty"}</Button>
      )}
    </div>
  );
}
