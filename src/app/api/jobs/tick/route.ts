import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { drainFor } from "@/lib/jobs/worker";

export const maxDuration = 300;

/**
 * Processes queued jobs for up to ~4 minutes. For hosting without a persistent
 * Node process (JOB_WORKER=off): call it from a cron with
 * `Authorization: Bearer $JOB_TICK_SECRET`. Disabled when the secret is not set.
 */
export async function POST(req: NextRequest) {
  const secret = serverEnv().JOB_TICK_SECRET;
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "Brak dostępu." }, { status: 401 });
  }
  const processed = await drainFor(240_000);
  return NextResponse.json({ processed });
}
