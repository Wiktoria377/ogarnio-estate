import "server-only";
import path from "node:path";
import { METRIC_KEYS, METRIC_LABELS, NO_DATA, PLATFORM_METRICS, formatMetric, LEAD_STATUSES } from "@/core/analytics/metrics";
import type { Insights } from "@/core/analytics/insights";
import type { AnalyticsReport } from "./service";

const FONT_DIR = path.join(process.cwd(), "assets", "fonts");
const A4: [number, number] = [595.28, 841.89];
const M = 42;
const PLATFORM_LABEL: Record<string, string> = { facebook_page: "Facebook", instagram: "Instagram", linkedin_org: "LinkedIn (strona)", linkedin_member: "LinkedIn (profil)", tiktok: "TikTok" };

export interface ReportPdfInput {
  report: AnalyticsReport;
  office: string;
  accent: string;
  insights: { insights: Insights; model: string; createdAt: string; periodFrom: string; periodTo: string } | null;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("pl-PL", { timeZone: "Europe/Warsaw" });

/** Analytics report as PDF. Unknown metrics print as "Brak danych", never as 0. */
export async function renderReportPdf(input: ReportPdfInput): Promise<Buffer> {
  const { default: PDFDocument } = await import("pdfkit");
  const { report: r } = input;
  const doc = new PDFDocument({ size: A4, margin: M, bufferPages: true, info: { Title: `Raport marketingowy ${day(r.from)} – ${day(r.to)}`, Author: input.office, Creator: "OGARNIO ESTATE" } });
  doc.registerFont("body", path.join(FONT_DIR, "dm-sans-400.ttf"));
  doc.registerFont("bold", path.join(FONT_DIR, "dm-sans-600.ttf"));
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((res, rej) => { doc.on("end", () => res()); doc.on("error", rej); });
  const W = A4[0] - 2 * M;
  const ensure = (h: number) => { if (doc.y + h > A4[1] - M - 20) doc.addPage(); };
  const h2 = (t: string) => { ensure(40); doc.moveDown(0.8).font("bold").fontSize(12.5).fillColor("#1d1b29").text(t, M, doc.y, { width: W }); doc.moveDown(0.3); };
  const p = (t: string, opts: { color?: string; size?: number } = {}) => { ensure(18); doc.font("body").fontSize(opts.size ?? 9.5).fillColor(opts.color ?? "#3d3a4b").text(t, M, doc.y, { width: W }); };
  function table(cols: { label: string; w: number }[], rows: string[][]) {
    const draw = (cells: string[], bold: boolean) => {
      const hgt = Math.max(...cells.map((c, i) => doc.font(bold ? "bold" : "body").fontSize(8.5).heightOfString(c, { width: cols[i]!.w - 6 }))) + 6;
      ensure(hgt);
      const y = doc.y;
      let x = M;
      cells.forEach((c, i) => {
        doc.font(bold ? "bold" : "body").fontSize(8.5).fillColor(c === NO_DATA ? "#9a97a8" : bold ? "#5a5768" : "#2b2838").text(c, x + 3, y + 3, { width: cols[i]!.w - 6 });
        x += cols[i]!.w;
      });
      doc.moveTo(M, y + hgt).lineTo(M + W, y + hgt).lineWidth(0.4).strokeColor("#e4e2ec").stroke();
      doc.x = M;
      doc.y = y + hgt;
    };
    draw(cols.map((c) => c.label), true);
    for (const row of rows) draw(row, false);
  }

  doc.rect(0, 0, A4[0], 6).fill(input.accent);
  doc.font("bold").fontSize(18).fillColor("#1d1b29").text("Raport marketingowy", M, M);
  p(`${input.office} · okres ${day(r.from)} – ${day(r.to)} · wygenerowano ${new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" })}`, { color: "#6b6879" });
  p("Źródła: oficjalne API platform (statystyki postów) oraz pomiary aplikacji (kliknięcia linków śledzących bez botów, wyświetlenia stron ofert, zapytania z formularzy). „Brak danych” oznacza, że platforma nie udostępnia lub nie zwróciła metryki; to nie jest zero.", { size: 8.5, color: "#6b6879" });
  if (r.mock) p("TRYB TESTOWY: statystyki postów pochodzą z symulatora API i nie są prawdziwymi danymi.", { color: "#b45309" });

  h2("Podsumowanie");
  const agg = (k: "views" | "interactions" | "reach") => { const a = r.totals[k]; return a.total ? `${formatMetric(a.value)} (z ${a.covered} z ${a.total} postów)` : NO_DATA; };
  table([{ label: "Wskaźnik", w: W * 0.55 }, { label: "Wartość", w: W * 0.45 }], [
    ["Opublikowane posty", String(r.publications.length)],
    ["Wyświetlenia (platformy)", agg("views")],
    ["Zasięg (platformy)", agg("reach")],
    ["Interakcje (platformy)", agg("interactions")],
    ["Kliknięcia linków śledzących (bez botów)", String(r.clicks)],
    ["Wyświetlenia stron ofert", String(r.pageViews)],
    ["Zapytania (bez spamu)", String(r.leads)],
    ["Zapytania na 100 kliknięć", r.clickToLead == null ? NO_DATA : String(r.clickToLead).replace(".", ",")],
    ...Object.entries(r.leadsByStatus).map(([s, n]) => [`Zapytania: ${LEAD_STATUSES[s as keyof typeof LEAD_STATUSES]?.label ?? s}`, String(n)]),
  ]);

  h2("Kanały");
  if (r.byChannel.length) table([{ label: "Kanał", w: W * 0.28 }, { label: "Posty", w: W * 0.18 }, { label: "Wyświetlenia", w: W * 0.18 }, { label: "Kliknięcia", w: W * 0.18 }, { label: "Zapytania", w: W * 0.18 }], r.byChannel.map((c) => [c.channel, String(c.publications), formatMetric(c.views.value), String(c.clicks), String(c.leads)]));
  else p("Brak danych w tym okresie.");

  if (r.byCampaign.length) {
    h2("Kampanie");
    table([{ label: "Kampania", w: W * 0.46 }, { label: "Posty", w: W * 0.18 }, { label: "Kliknięcia", w: W * 0.18 }, { label: "Zapytania", w: W * 0.18 }], r.byCampaign.map((c) => [c.name, String(c.publications), String(c.clicks), String(c.leads)]));
  }

  h2("Publikacje");
  if (r.publications.length) {
    const keys = METRIC_KEYS;
    const first = W * 0.3;
    const rest = (W - first) / keys.length;
    table([{ label: "Post", w: first }, ...keys.map((k) => ({ label: METRIC_LABELS[k].split(" (")[0]!, w: rest }))], r.publications.map((x) => [
      `${PLATFORM_LABEL[x.platform] ?? x.platform} · ${x.account} · ${day(x.publishedAt)}\n${x.caption.slice(0, 80)}${!PLATFORM_METRICS[x.platform]?.keys.length ? `\n${PLATFORM_METRICS[x.platform]?.note ?? ""}` : ""}`,
      ...keys.map((k) => (x.metrics?.[k] == null ? NO_DATA : formatMetric(x.metrics[k]))),
    ]));
  } else p("Brak opublikowanych postów w tym okresie.");

  h2("Wnioski AI");
  const ins = input.insights;
  if (!ins) p("Nie przygotowano wniosków dla tego biura. Można je wygenerować w aplikacji (Analityka → Wnioski AI).");
  else {
    p(`Przygotowano ${day(ins.createdAt)} dla okresu ${day(ins.periodFrom)} – ${day(ins.periodTo)}. Model: ${ins.model}.${ins.model === "offline-test-provider" ? " Treść testowa (dostawca offline, bez AI)." : ""} To nie są prognozy wyników.`, { size: 8.5, color: "#6b6879" });
    const list = (title: string, items: string[]) => { if (!items.length) return; doc.moveDown(0.3); p(title, { color: "#1d1b29" }); for (const t of items) p(`• ${t}`); };
    list("Co pokazują dane", ins.insights.observations.map((o) => o.text));
    list("Hipotezy do sprawdzenia", ins.insights.hypotheses.map((h) => `${h.text} Jak sprawdzić: ${h.verify}`));
    list("Rekomendacje", ins.insights.recommendations.map((x) => `${x.what}. Dlaczego: ${x.why} Dane: ${x.data}. Działanie: ${x.action} Miernik: ${x.metric}.`));
    list("Ograniczenia", ins.insights.limitations);
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font("body").fontSize(7.5).fillColor("#9a97a8").text(`OGARNIO ESTATE · ${input.office} · strona ${i + 1} z ${range.count}`, M, A4[1] - M + 10, { width: W, align: "right", lineBreak: false });
  }
  doc.end();
  await done;
  return Buffer.concat(chunks);
}
