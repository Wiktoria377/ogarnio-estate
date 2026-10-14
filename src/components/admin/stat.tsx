import { Card } from "@/components/ui/card";

export function Stat({ label, value, note, testId }: { label: string; value: React.ReactNode; note?: React.ReactNode; testId?: string }) {
  return (
    <Card className="p-4" data-testid={testId ?? "admin-stat"}>
      <p className="text-[12px] text-ink-3">{label}</p>
      <p className="mt-1 text-[20px] font-semibold tabular-nums">{value}</p>
      {note && <p className="text-[11.5px] text-ink-4">{note}</p>}
    </Card>
  );
}

export function bytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1).replace(".", ",")} MB`;
  return `${(n / 1024 ** 3).toFixed(2).replace(".", ",")} GB`;
}

export const STATUS_LABEL: Record<string, string> = { trialing: "Okres próbny", active: "Aktywna", past_due: "Zaległa płatność", canceled: "Anulowana", unpaid: "Nieopłacona", incomplete: "Niedokończona", incomplete_expired: "Wygasła (niedokończona)", paused: "Wstrzymana", brak: "Brak" };
