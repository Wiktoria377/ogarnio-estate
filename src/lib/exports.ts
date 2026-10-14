import "server-only";
import type { WorkspaceContext } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";

export type ExportFormat = "png" | "jpg" | "pdf" | "zip" | "mp4" | "txt" | "md";

/** Append-only export history (who downloaded what, which version). Never blocks the download. */
export async function logExport(ctx: WorkspaceContext, e: { itemId: string | null; format: ExportFormat; version?: number | null; size?: number }) {
  // Written by the server only (members have no insert policy, so history cannot be forged).
  const { error } = await createAdminClient().from("export_events").insert({
    workspace_id: ctx.workspace.id,
    content_item_id: e.itemId,
    user_id: ctx.userId,
    format: e.format,
    version: e.version ?? null,
    size_bytes: e.size ?? null,
  });
  if (error) console.warn("[exports] log failed", error.message);
}
