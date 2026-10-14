import { XMLParser } from "fast-xml-parser";
import { AppError } from "@/lib/errors";
import { MAX_IMPORT_ROWS } from "@/core/import/csv";

/**
 * XML/JSON feed → flat records (column path → text) for the common mapping
 * pipeline. Feed content is untrusted data: entities and DOCTYPE declarations
 * are not processed (no XXE, no entity expansion), nesting and size are capped,
 * and nothing in the feed is interpreted as an instruction.
 */
export interface FlatTable {
  path: string;
  records: Record<string, string>[];
  headers: string[];
}

const MAX_DEPTH = 8;
const MAX_KEYS = 300;

type Node = unknown;

function isObj(v: Node): v is Record<string, Node> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function flatten(node: Node, prefix: string, out: Map<string, string[]>, depth: number) {
  if (depth > MAX_DEPTH || out.size > MAX_KEYS) return;
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) {
    for (const item of node.slice(0, 100)) flatten(item, prefix, out, depth + 1);
    return;
  }
  if (isObj(node)) {
    for (const [k, v] of Object.entries(node)) {
      const key = k === "#text" ? prefix : k.startsWith("@") ? `${prefix}${k}` : prefix ? `${prefix}.${k}` : k;
      flatten(v, key, out, depth + 1);
    }
    return;
  }
  const text = String(node).trim();
  if (!text || !prefix) return;
  const list = out.get(prefix) ?? [];
  if (list.length < 100) list.push(text.slice(0, 20_000));
  out.set(prefix, list);
}

export function flattenRecord(node: Node): Record<string, string> {
  const out = new Map<string, string[]>();
  flatten(node, "", out, 0);
  return Object.fromEntries([...out].map(([k, v]) => [k, v.join("\n")]));
}

/** Finds the longest array of objects (the record list), preferring deeper paths on ties. */
function findRecords(root: Node, path = "", depth = 0): { path: string; items: Node[] } | null {
  if (depth > MAX_DEPTH) return null;
  let best: { path: string; items: Node[] } | null = null;
  const consider = (c: { path: string; items: Node[] } | null) => {
    if (c && (!best || c.items.length > best.items.length)) best = c;
  };
  if (Array.isArray(root)) {
    if (root.length && root.every(isObj)) consider({ path, items: root });
    for (const item of root.slice(0, 3)) consider(findRecords(item, path, depth + 1));
    return best;
  }
  if (isObj(root)) for (const [k, v] of Object.entries(root)) if (!k.startsWith("@")) consider(findRecords(v, path ? `${path}.${k}` : k, depth + 1));
  return best;
}

function atPath(root: Node, path: string): Node {
  let cur: Node = root;
  for (const part of path.split(".").filter(Boolean)) {
    if (!isObj(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

export function parseFeed(text: string, format: "xml" | "json"): Node {
  if (format === "json") {
    try {
      return JSON.parse(text) as Node;
    } catch {
      throw new AppError("Plik nie jest poprawnym JSON-em.", "bad_feed", 422);
    }
  }
  if (/<!ENTITY/i.test(text)) {
    // Entity declarations are never expanded; strip the DOCTYPE so they can't be referenced either.
    text = text.replace(/<!DOCTYPE[\s\S]*?\]\s*>/i, "").replace(/<!DOCTYPE[^>]*>/i, "");
  }
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", processEntities: false, htmlEntities: false, parseTagValue: false, parseAttributeValue: false, trimValues: true, ignoreDeclaration: true, ignorePiTags: true, maxNestedTags: 40 } as ConstructorParameters<typeof XMLParser>[0]);
  try {
    return parser.parse(text) as Node;
  } catch {
    throw new AppError("Plik nie jest poprawnym XML-em.", "bad_feed", 422);
  }
}

export function flattenRecords(text: string, format: "xml" | "json", recordPath?: string | null): FlatTable {
  const root = parseFeed(text, format);
  let path = recordPath?.trim() ?? "";
  let items: Node[];
  if (path) {
    const node = atPath(root, path);
    items = Array.isArray(node) ? node : isObj(node) ? [node] : [];
    if (!items.length) throw new AppError(`Nie znaleziono rekordów pod ścieżką „${path}”.`, "bad_feed_path", 422);
  } else {
    const found = findRecords(root);
    if (!found) throw new AppError("Nie znaleziono listy ofert w pliku. Podaj ścieżkę do rekordów (np. oferty.oferta).", "no_records", 422);
    ({ path, items } = found);
  }
  if (items.length > MAX_IMPORT_ROWS) throw new AppError(`Feed ma więcej niż ${MAX_IMPORT_ROWS} ofert.`, "too_many_rows", 422);
  const records = items.map(flattenRecord);
  const headers: string[] = [];
  for (const r of records) for (const k of Object.keys(r)) if (!headers.includes(k) && headers.length < MAX_KEYS) headers.push(k);
  return { path, records, headers };
}
