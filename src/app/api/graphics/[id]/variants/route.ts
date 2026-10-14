import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CREATIVE_DIRECTION_IDS, type CreativeDirection } from "@/core/creative/composition";
import { aiErrorMessage } from "@/lib/ai";
import { apiError, assertSameOrigin } from "@/lib/api";
import { createCreativeVariants } from "@/lib/creative/variants";
import { AppError } from "@/lib/errors";
import { authorize } from "@/lib/session";

export const maxDuration = 300;

/** Five creative directions for one graphic, each saved as a separate editable graphic. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const ctx = await authorize("editor");
    const { id } = await params;
    const p = z.object({ directions: z.array(z.enum(CREATIVE_DIRECTION_IDS as [CreativeDirection, ...CreativeDirection[]])).min(1).max(5).optional() }).safeParse(await req.json().catch(() => ({})));
    if (!p.success || !z.uuid().safeParse(id).success) throw new AppError("Nieprawidłowe dane.", "bad_request");
    try {
      return NextResponse.json(await createCreativeVariants(ctx, id, p.data.directions));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(aiErrorMessage(error), "ai_error", 502);
    }
  } catch (error) {
    return apiError(error);
  }
}
