import { NextResponse, type NextRequest } from "next/server";
import { getStorage } from "@/lib/storage";
import { readMediaToken } from "@/lib/publishing/media";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServerSupabase } from "@/lib/supabase/server";

/**
 * Public, signed and expiring media link for platform crawlers (Meta downloads
 * image_url / video_url itself). Only files of a publication that is waiting
 * for or in publishing are served; nothing else in storage is reachable.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; name: string }> }) {
  const { token } = await params;
  const t = token.length < 2000 ? readMediaToken(token) : null;
  if (!t || !t.k.startsWith(`${t.w}/`)) return new NextResponse("Not found", { status: 404 });
  const admin = createAdminClient();
  const { data: pub } = await admin.from("publications").select("state, media").eq("id", t.p).eq("workspace_id", t.w).maybeSingle();
  const media = (pub?.media ?? []) as { storage_path: string; mime: string }[];
  const file = media.find((m) => m.storage_path === t.k);
  if (!pub || !file || !["queued", "publishing", "processing", "published"].includes(pub.state)) return new NextResponse("Not found", { status: 404 });
  try {
    const data = await getStorage(admin as unknown as ServerSupabase).get(file.storage_path);
    return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": file.mime, "Content-Length": String(data.length), "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
