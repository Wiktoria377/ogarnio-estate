import { cn } from "@/lib/utils";

/** Product mark: a roof line over a baseline, drawn as two strokes. */
export function BrandMark({ className, withName = true }: { className?: string; withName?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="flex size-7 items-center justify-center rounded-[7px] bg-ink text-white">
        <svg viewBox="0 0 20 20" className="size-4" fill="none" aria-hidden>
          <path d="M3.5 9.5L10 4l6.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M5.5 15.5h9" stroke="#A996FF" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      {withName && (
        <span className="text-[15px] font-semibold tracking-tight text-ink">
          Ogarnio <span className="font-display text-[17px] font-normal italic">Estate</span>
        </span>
      )}
    </span>
  );
}
