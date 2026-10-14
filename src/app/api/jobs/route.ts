import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/api";
import { authorize } from "@/lib/session";
import { AppError } from "@/lib/errors";
import { JOB_COLUMNS } from "@/lib/jobs/queue";

const UUID = /^[0-9a-f-]{36}$/;

/** Job statuses for a campaign or a material (polled by the UI). */
export async function GET(req: NextRequest) {
  try {
    const ctx = await authorize("member");
    const campaign = req.nextUrl.searchParams.get("campaign");
    const item = req.nextUrl.searchParams.get("item");
    let q = ctx.supabase.from("generation_jobs").select(JOB_COLUMNS).eq("workspace_id", ctx.workspace.id);
    if (campaign && UUID.test(campaign)) q = q.eq("campaign_id", campaign);
    else if (item && UUID.test(item)) q = q.eq("content_item_id", item);
    else throw new AppError("Podaj kampanię lub materiał.", "bad_request");
    const { data, error } = await q.order("created_at", { ascending: true }).limit(100);
    if (error) throw new AppError("Nie udało się pobrać statusu zadań.", "jobs_read", 500);
    return NextResponse.json({ jobs: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiError(error);
  }
}
