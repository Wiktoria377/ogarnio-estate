import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-sunken text-ink-2",
  accent: "bg-accent-soft text-accent-ink",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  muted: "bg-sunken text-ink-3",
  outline: "border border-line text-ink-2",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({ tone = "neutral", className, children, dot, ...rest }: { tone?: BadgeTone; className?: string; children: React.ReactNode; dot?: boolean; "data-testid"?: string; title?: string }) {
  return (
    <span {...rest} className={cn("inline-flex h-5.5 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium whitespace-nowrap", tones[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
