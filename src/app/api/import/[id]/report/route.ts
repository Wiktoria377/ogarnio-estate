import { type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { batchReportCsv } from "@/lib/import/service";
import { authorizePerm } from "@/lib/session";

/** Downloadable import report: every row with its decision, result, errors and warnings. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await authorizePerm("import.run");
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new AppError("Nie znaleziono importu.", "not_found", 404);
    const csv = await batchReportCsv(ctx, id);
    return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="raport-importu-${id.slice(0, 8)}.csv"`, "cache-control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
