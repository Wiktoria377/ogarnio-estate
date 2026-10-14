"use client";
import { useRef, useState } from "react";
import { UploadSimple } from "@phosphor-icons/react/dist/ssr";
import { Spinner } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Dropzone({ onFiles, multiple, busy, label, hint, className, disabled }: { onFiles: (files: FileList) => void; multiple?: boolean; busy?: boolean; label: string; hint?: string; className?: string; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={disabled || busy}
      onClick={() => !disabled && !busy && input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !disabled && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled && !busy && e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-surface px-4 py-6 text-center transition-colors hover:border-accent/50 hover:bg-accent-soft/40",
        over && "border-accent bg-accent-soft/60",
        (disabled || busy) && "cursor-not-allowed opacity-70",
        className,
      )}
    >
      <input
        ref={input}
        type="file"
        className="sr-only"
        accept="image/jpeg,image/png,image/webp"
        multiple={multiple}
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <span className="flex size-9 items-center justify-center rounded-full bg-sunken text-ink-2">{busy ? <Spinner /> : <UploadSimple size={18} />}</span>
      <span className="text-[13.5px] font-medium text-ink">{busy ? "Przesyłanie…" : label}</span>
      {hint && <span className="text-[12.5px] text-ink-3">{hint}</span>}
    </div>
  );
}
