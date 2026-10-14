import { NextResponse, type NextRequest } from "next/server";
import { apiError, assertSameOrigin } from "@/lib/api";
import { CsvError, readCsv } from "@/core/import/csv";
import { AppError } from "@/lib/errors";
import { readFormDataLimited } from "@/lib/http-body";
import { flattenRecords } from "@/lib/import/feeds";
import { ensureCsvSource, stageRecords } from "@/lib/import/service";
import { rateLimit } from "@/lib/observability";
import { authorizePerm } from "@/lib/session";

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * File import (CSV from any CRM, or an XML/JSON export file). The file is parsed
 * as data only, staged and analysed; nothing reaches offers until the user
 * confirms the preview.
 */
export async function POST(req: NextRequest) {
  try {
    assertSameOrigin(req);
    const ctx = await authorizePerm("import.run");
    await rateLimit(`import-upload:${ctx.userId}`, 30, 3600, "Za dużo importów w ciągu godziny. Spróbuj później.");
    const form = await readFormDataLimited(req, MAX_BYTES + 64 * 1024, "Plik jest za duży (maks. 10 MB).");
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new AppError("Wybierz plik do importu.", "no_file");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const name = file.name.slice(0, 200);
    const head = new TextDecoder().decode(bytes.subarray(0, 200)).replace(/^﻿/, "").trimStart();
    const format = /\.xml$/i.test(name) || head.startsWith("<") ? "xml" : /\.json$/i.test(name) || head.startsWith("{") || head.startsWith("[") ? "json" : "csv";
    let headers: string[];
    let records: Record<string, string>[];
    if (format === "csv") {
      const t = readCsv(bytes);
      headers = t.headers;
      records = t.rows.map((r) => Object.fromEntries(t.headers.map((h, i) => [h, r[i] ?? ""])));
    } else {
      const path = typeof form.get("recordPath") === "string" ? String(form.get("recordPath")).slice(0, 200) : "";
      const text = new TextDecoder().decode(bytes).replace(/^﻿/, "");
      ({ headers, records } = flattenRecords(text, format, path || null));
    }
    const source = await ensureCsvSource(ctx);
    const batchId = await stageRecords(ctx, source, { label: name || "plik", headers, records });
    return NextResponse.json({ batchId });
  } catch (error) {
    if (error instanceof CsvError) return apiError(new AppError(error.message, "bad_csv", 422));
    return apiError(error);
  }
}
