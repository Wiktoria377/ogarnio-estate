/** Planner dates are entered and shown in the office's time zone (Poland). */
export const PLANNER_TZ = "Europe/Warsaw";

/** Offset of Europe/Warsaw from UTC (minutes) at a given instant. */
function tzOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: PLANNER_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** "2026-10-20" + "18:00" in Warsaw → UTC ISO string. */
export function warsawToIso(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y!, m! - 1, d!, hh!, mm!));
  const offset = tzOffsetMinutes(new Date(guess.getTime() - tzOffsetMinutes(guess) * 60000));
  return new Date(guess.getTime() - offset * 60000).toISOString();
}

/** UTC instant → { date: "YYYY-MM-DD", time: "HH:MM" } in Warsaw. */
export function isoToWarsaw(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: PLANNER_TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

export function todayWarsaw(): string {
  return isoToWarsaw(new Date().toISOString()).date;
}
