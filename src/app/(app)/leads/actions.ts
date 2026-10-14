"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LEAD_STATUSES } from "@/core/analytics/metrics";
import { toActionError, type ActionResult } from "@/lib/errors";
import { updateLead } from "@/lib/analytics/service";
import { authorizePerm } from "@/lib/session";

const patchSchema = z.object({
  status: z.enum(Object.keys(LEAD_STATUSES) as [keyof typeof LEAD_STATUSES, ...(keyof typeof LEAD_STATUSES)[]]).optional(),
  assignedTo: z.uuid().nullable().optional(),
  note: z.string().max(1000).optional(),
});

export async function changeLead(id: string, patch: z.input<typeof patchSchema>): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("leads.manage");
    await updateLead(ctx, z.uuid().parse(id), patchSchema.parse(patch));
    revalidatePath(`/leads/${id}`);
    revalidatePath("/leads");
    return { ok: true, data: undefined, message: "Zapisano." };
  } catch (error) {
    return toActionError(error);
  }
}
