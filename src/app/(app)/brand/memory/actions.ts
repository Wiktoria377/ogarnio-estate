"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizePerm } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/errors";
import { clearMemory, decideSuggestion, deleteEntry, explicitSchema, saveExplicit, setMemoryEnabled, updateEntry } from "@/lib/brand-memory/service";

const id = z.uuid();
const done = () => revalidatePath("/brand/memory");

/** Saves one decision as an explicit preference (content editors may do this from their edits). */
export async function rememberPreference(input: z.input<typeof explicitSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await authorizePerm("content.edit");
    const memId = await saveExplicit(ctx, input);
    done();
    return { ok: true, data: { id: memId }, message: "Zapamiętano preferencję. Będzie używana w kolejnych materiałach." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function decideMemorySuggestion(memId: string, decision: "accept" | "dismiss"): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("content.edit");
    await decideSuggestion(ctx, id.parse(memId), z.enum(["accept", "dismiss"]).parse(decision));
    done();
    return { ok: true, data: undefined, message: decision === "accept" ? "Sugestia zapisana w pamięci marki." : "Sugestia odrzucona. Nie wróci." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateMemoryEntry(memId: string, content: string): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("content.edit");
    await updateEntry(ctx, id.parse(memId), content);
    done();
    return { ok: true, data: undefined, message: "Zapisano zmianę." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteMemoryEntry(memId: string): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("content.edit");
    await deleteEntry(ctx, id.parse(memId));
    done();
    return { ok: true, data: undefined, message: "Usunięto z pamięci marki." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function clearBrandMemory(): Promise<ActionResult<{ memory: number; events: number }>> {
  try {
    const ctx = await authorizePerm("brand.edit");
    const r = await clearMemory(ctx);
    done();
    return { ok: true, data: r, message: `Wyczyszczono pamięć marki (${r.memory} preferencji, ${r.events} zapisanych decyzji).` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function setBrandMemoryEnabled(enabled: boolean): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("brand.edit");
    await setMemoryEnabled(ctx, z.boolean().parse(enabled));
    done();
    return { ok: true, data: undefined, message: enabled ? "Pamięć marki włączona." : "Pamięć marki wyłączona. Nowe materiały nie korzystają z zapisanych preferencji i decyzje nie są zapisywane." };
  } catch (error) {
    return toActionError(error);
  }
}
