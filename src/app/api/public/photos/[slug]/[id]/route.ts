import { NextResponse, type NextRequest } from "next/server";
import { getStorage } from "@/lib/storage";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServerSupabase } from "@/lib/supabase/server";

/** Photos of an offer whose public page is enabled (visualisations are labelled on the page). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (!/^[a-z0-9-]{3,80}$/.test(slug) || !/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const admin = createAdminClient();
  const { data: p } = await admin.from("properties").select("id, public_enabled").eq("public_slug", slug).maybeSingle();
  if (!p?.public_enabled) return new NextResponse("Not found", { status: 404 });
  const { data: photo } = await admin.from("property_photos").select("storage_path, mime_type").eq("id", id).eq("property_id", p.id).maybeSingle();
  if (!photo) return new NextResponse("Not found", { status: 404 });
  try {
    const data = await getStorage(admin as unknown as ServerSupabase).get(photo.storage_path);
    return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": photo.mime_type, "Content-Length": String(data.length), "Cache-Control": "public, max-age=600", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
