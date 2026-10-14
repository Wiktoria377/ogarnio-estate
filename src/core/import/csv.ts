/**
 * CSV reader for property imports (RFC 4180 with the quirks of Polish CRM
 * exports): UTF-8 with or without BOM, or Windows-1250; delimiter ; , tab or |;
 * quoted fields with embedded delimiters, quotes ("") and line breaks.
 */
export interface CsvTable {
  headers: string[];
  rows: string[][];
  delimiter: string;
  encoding: "utf-8" | "windows-1250";
}

export class CsvError extends Error {}

const DELIMITERS = [";", ",", "\t", "|"] as const;

/** Decodes bytes: valid UTF-8 wins, otherwise Windows-1250 (common in older Polish software). */
export function decodeCsv(bytes: Uint8Array): { text: string; encoding: CsvTable["encoding"] } {
  let start = 0;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) start = 3;
  const body = bytes.subarray(start);
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(body), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("windows-1250").decode(body), encoding: "windows-1250" };
  }
}

/** Picks the delimiter that gives the most consistent column count over the first records (quote-aware). */
export function detectDelimiter(text: string): string {
  const head = text.slice(0, 64 * 1024);
  let best: string = ";";
  let bestScore = -1;
  for (const d of DELIMITERS) {
    let rows: string[][];
    try {
      rows = parseCsvText(head, d, 20);
    } catch {
      // The 64 KB sample may cut a quoted field; parse whole lines only.
      try {
        rows = parseCsvText(head.slice(0, head.lastIndexOf("\n") + 1), d, 20);
      } catch {
        continue;
      }
    }
    const counts = rows.map((r) => r.length);
    if (!counts.length || counts[0]! < 2) continue;
    const same = counts.filter((c) => c === counts[0]).length;
    const score = same * 100 + counts[0]!;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Full parser (state machine). maxRows guards memory on huge files. */
export function parseCsvText(text: string, delimiter: string, maxRows = 20_000): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;
  const n = text.length;
  while (i < n) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"' && field.trim() === "") {
      quoted = true;
      field = "";
      i++;
      continue;
    }
    if (ch === delimiter) {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      row.push(field);
      field = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      if (rows.length >= maxRows) return rows;
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += ch;
    i++;
  }
  if (quoted) throw new CsvError("Plik CSV ma niezamknięty cudzysłów. Sprawdź, czy eksport nie został ucięty.");
  row.push(field);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

export const MAX_IMPORT_ROWS = 5000;

export function readCsv(bytes: Uint8Array): CsvTable {
  const { text, encoding } = decodeCsv(bytes);
  if (!text.trim()) throw new CsvError("Plik jest pusty.");
  const delimiter = detectDelimiter(text);
  const all = parseCsvText(text, delimiter, MAX_IMPORT_ROWS + 2);
  if (all.length < 2) throw new CsvError("Plik musi mieć wiersz nagłówków i co najmniej jeden wiersz danych.");
  if (all.length > MAX_IMPORT_ROWS + 1) throw new CsvError(`Plik ma więcej niż ${MAX_IMPORT_ROWS} wierszy. Podziel go na mniejsze części.`);
  const headers = all[0]!.map((h, i) => h.trim() || `Kolumna ${i + 1}`);
  const seen = new Map<string, number>();
  const unique = headers.map((h) => {
    const k = h.toLowerCase();
    const c = (seen.get(k) ?? 0) + 1;
    seen.set(k, c);
    return c > 1 ? `${h} (${c})` : h;
  });
  const rows = all.slice(1).map((r) => unique.map((_, i) => (r[i] ?? "").trim()));
  return { headers: unique, rows, delimiter, encoding };
}
