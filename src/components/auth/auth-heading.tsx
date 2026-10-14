export function AuthHeading({ title, description }: { title: string; description?: React.ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="text-[24px] font-semibold text-ink">{title}</h1>
      {description && <p className="mt-1.5 text-[14px] leading-relaxed text-ink-3">{description}</p>}
    </div>
  );
}
