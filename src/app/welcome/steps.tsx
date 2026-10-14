"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dropzone } from "@/components/common/dropzone";
import { useUpload } from "@/components/common/use-upload";
import { confirmSaved, saveColors, skipStep, startTrial } from "./actions";
import type { OnboardingStepId } from "@/lib/onboarding";

function useAction() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error ?? "Nie udało się zapisać.");
      else {
        if (r.message) toast.success(r.message);
        router.refresh();
      }
    });
  return { pending, run };
}

export function SkipButton({ step }: { step: OnboardingStepId }) {
  const { pending, run } = useAction();
  return <Button variant="ghost" loading={pending} onClick={() => run(() => skipStep(step))}>Pomiń ten krok</Button>;
}

export function LogoStep({ logoUrl }: { logoUrl: string | null }) {
  const router = useRouter();
  const { busy, upload } = useUpload({ purpose: "logo" }, (j) => j);
  return (
    <div className="flex flex-col gap-4">
      {logoUrl && <img src={logoUrl} alt="Logo biura" className="h-20 w-auto self-start rounded-md border border-line bg-white object-contain p-2" />}
      <Dropzone label={logoUrl ? "Zmień logo" : "Przeciągnij logo albo kliknij, aby wybrać"} hint="PNG z przezroczystym tłem, JPG lub WebP, do 10 MB." busy={busy} onFiles={async (files) => { const done = await upload(files); if (done.length) router.refresh(); }} />
    </div>
  );
}

const FIELDS = [
  { key: "primary", label: "Kolor główny" },
  { key: "secondary", label: "Kolor uzupełniający" },
  { key: "accent", label: "Akcent" },
] as const;

export function ColorsStep({ colors }: { colors: Record<string, string> }) {
  const [c, setC] = useState(colors);
  const { pending, run } = useAction();
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex items-center gap-3 rounded-md border border-line px-3 py-2.5 text-[13px]">
            <input type="color" aria-label={f.label} value={c[f.key]} onChange={(e) => setC({ ...c, [f.key]: e.target.value.toUpperCase() })} className="size-9 cursor-pointer rounded border border-line bg-transparent" />
            <span><span className="block text-ink">{f.label}</span><span className="text-[12px] text-ink-3 tabular-nums">{c[f.key]}</span></span>
          </label>
        ))}
      </div>
      <div className="flex gap-2 rounded-md border border-line p-3" aria-hidden>
        <div className="h-16 flex-1 rounded" style={{ background: c.primary }} />
        <div className="h-16 flex-1 rounded" style={{ background: c.secondary }} />
        <div className="h-16 w-16 rounded" style={{ background: c.accent }} />
      </div>
      <Button className="self-start" loading={pending} onClick={() => run(() => saveColors(c))}>Zapisz kolory</Button>
    </div>
  );
}

export function SaveStep() {
  const { pending, run } = useAction();
  return <Button variant="secondary" loading={pending} onClick={() => run(() => confirmSaved())}>Materiał jest zapisany w bibliotece, dalej</Button>;
}

export function TrialStep({ trialEnds }: { trialEnds: string | null }) {
  const { pending, run } = useAction();
  return (
    <div className="flex flex-wrap gap-2">
      <Button loading={pending} onClick={() => run(() => startTrial())}>Kontynuuj okres próbny{trialEnds ? ` (do ${new Date(trialEnds).toLocaleDateString("pl-PL")})` : ""}</Button>
      <Button asChild variant="secondary"><Link href="/settings/billing">Wybierz plan</Link></Button>
    </div>
  );
}
