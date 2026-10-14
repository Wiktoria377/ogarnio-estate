import { NextResponse, type NextRequest } from "next/server";
import { authorize } from "@/lib/session";
import { getStorage } from "@/lib/storage";
import { apiError, assertSameOrigin } from "@/lib/api";
import { AppError, dbError } from "@/lib/errors";

/** Removes a track. Videos that used it render without music until another is chosen. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const ctx = await authorize("editor");
    const { id } = await params;
    const { data: row } = await ctx.supabase.from("media_assets").select("id, storage_path").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
    if (!row) throw new AppError("Nie znaleziono utworu.", "not_found", 404);
    const { error } = await ctx.supabase.from("media_assets").delete().eq("id", id).eq("workspace_id", ctx.workspace.id);
    if (error) throw dbError(error, "Nie udało się usunąć utworu.");
    await getStorage(ctx.supabase).remove([row.storage_path]).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
