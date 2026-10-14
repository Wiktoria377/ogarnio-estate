import { aiAvailability } from "@/lib/env";

/** Explains, before anyone clicks Generate, when AI needs configuration. */
export function AiStatusNotice() {
  const ai = aiAvailability();
  if (ai.mode !== "unconfigured") return null;
  return (
    <div role="alert" className="mb-6 rounded-lg border border-warning/20 bg-warning-soft px-4 py-3 text-[13.5px] leading-relaxed text-warning">
      <strong className="font-semibold">Generowanie AI wymaga konfiguracji.</strong> Na serwerze brakuje zmiennej ANTHROPIC_API_KEY. Możesz przeglądać i edytować materiały, ale nowe teksty wygenerujesz po dodaniu klucza (instrukcja w README).
    </div>
  );
}
