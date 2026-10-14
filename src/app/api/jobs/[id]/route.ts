import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, assertSameOrigin } from "@/lib/api";
import { authorize } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { cancelJob, retryJob } from "@/lib/jobs/queue";

/** Retry a failed job or cancel a queued one. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const ctx = await authorize("editor");
    const { id } = await params;
    if (!z.uuid().safeParse(id).success) throw new AppError("Nie znaleziono zadania.", "not_found", 404);
    const parsed = z.object({ action: z.enum(["retry", "cancel"]) }).safeParse(await req.json().catch(() => null));
    if (!parsed.success) throw new AppError("Nieprawidłowa operacja.", "bad_request");
    if (parsed.data.action === "retry") await retryJob(ctx, id);
    else await cancelJob(ctx, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
