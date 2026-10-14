import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { runQa } from "@/lib/qa";
import { authorize } from "@/lib/session";

export const maxDuration = 120;

/** Quality assurance of the current version of one material (rules and measurements, no AI cost). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const ctx = await authorize("member");
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new AppError("Nieprawidłowe dane.", "bad_request");
    return NextResponse.json(await runQa(ctx, id));
  } catch (error) {
    return apiError(error);
  }
}
