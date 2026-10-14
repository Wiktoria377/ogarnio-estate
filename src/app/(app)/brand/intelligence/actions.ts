"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authorizePerm } from "@/lib/session";
import { toActionError, type ActionResult } from "@/lib/errors";
import {
  addTextReference,
  approveDraft,
  deleteReference,
  discardDraft,
  restoreVersion,
  saveDraft,
  saveProfile,
  startAnalysis,
  startAnalysisSchema,
  textReferenceSchema,
} from "@/lib/brand-intel/service";

const done = () => {
  revalidatePath("/brand", "layout");
};

export async function startBrandAnalysis(input: z.input<typeof startAnalysisSchema>): Promise<ActionResult<{ id: string }>> {
  try {
    const ctx = await authorizePerm("brand.edit");
    const id = await startAnalysis(ctx, input);
    done();
    return { ok: true, data: { id }, message: "Analiza strony rozpoczęta. Wynik pojawi się za chwilę." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveBrandDraft(versionId: string, snapshot: unknown): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("brand.edit");
    await saveDraft(ctx, versionId, snapshot);
    done();
    return { ok: true, data: undefined, message: "Zapisano szkic profilu." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function approveBrandDraft(versionId: string, snapshot: unknown): Promise<ActionResult<{ version: number }>> {
  try {
    const ctx = await authorizePerm("brand.edit");
    const version = await approveDraft(ctx, versionId, snapshot);
    revalidatePath("/", "layout");
    return { ok: true, data: { version }, message: `Zatwierdzono profil marki (wersja ${version}). Nowe materiały będą go używać.` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function discardBrandDraft(versionId: string): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("brand.edit");
    await discardDraft(ctx, versionId);
    done();
    return { ok: true, data: undefined, message: "Odrzucono propozycję. Obowiązujący profil się nie zmienił." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function restoreBrandVersion(version: number): Promise<ActionResult<{ version: number }>> {
  try {
    const ctx = await authorizePerm("brand.edit");
    const v = await restoreVersion(ctx, z.number().int().positive().parse(version));
    revalidatePath("/", "layout");
    return { ok: true, data: { version: v }, message: `Przywrócono ustawienia (zapisane jako wersja ${v}).` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveBrandProfile(snapshot: unknown): Promise<ActionResult<{ version: number }>> {
  try {
    const ctx = await authorizePerm("brand.edit");
    const version = await saveProfile(ctx, snapshot);
    revalidatePath("/", "layout");
    return { ok: true, data: { version }, message: `Zapisano profil marki (wersja ${version}).` };
  } catch (error) {
    return toActionError(error);
  }
}

export async function addBrandTextReference(input: z.input<typeof textReferenceSchema>): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("brand.edit");
    await addTextReference(ctx, input);
    done();
    return { ok: true, data: undefined, message: "Dodano materiał referencyjny." };
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteBrandReference(id: string): Promise<ActionResult> {
  try {
    const ctx = await authorizePerm("brand.edit");
    await deleteReference(ctx, z.uuid().parse(id));
    done();
    return { ok: true, data: undefined, message: "Usunięto materiał." };
  } catch (error) {
    return toActionError(error);
  }
}
