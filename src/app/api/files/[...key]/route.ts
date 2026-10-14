import type { NextRequest } from "next/server";
import { getWorkspaceContext } from "@/lib/session";
import { assertSafeKey, getStorage } from "@/lib/storage";
import { apiError } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { fileResponse, FILE_TYPES } from "@/lib/http-file";

/**
 * Serves private workspace files to members only. Supports single byte ranges
 * (206) so video and audio can be streamed and seeked in the browser.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  try {
    const ctx = await getWorkspaceContext();
    if (!ctx) throw new AppError("Zaloguj się.", "unauthenticated", 401);
    const key = (await params).key.join("/");
    const ws = key.split("/")[0] ?? "";
    if (!ctx.memberships.some((m) => m.workspace.id === ws)) throw new AppError("Brak dostępu.", "forbidden", 404);
    assertSafeKey(key, ws);
    const data = await getStorage(ctx.supabase).get(key);
    return fileResponse(req, data, FILE_TYPES[key.split(".").pop() ?? ""] ?? "application/octet-stream");
  } catch (error) {
    return apiError(error);
  }
}
