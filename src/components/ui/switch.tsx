"use client";
import { Switch as S } from "radix-ui";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof S.Root>) {
  return (
    <S.Root className={cn("peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent bg-line-strong transition-colors data-[state=checked]:bg-accent disabled:opacity-50", className)} {...props}>
      <S.Thumb className="block size-4 translate-x-0.5 rounded-full bg-white shadow-xs transition-transform duration-200 ease-out data-[state=checked]:translate-x-4" />
    </S.Root>
  );
}
