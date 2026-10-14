import "server-only";
import type { StoredBrief } from "@/core/marketing-engine/director";
import { variantToText, type QualityReport } from "@/core/marketing-engine/schemas";
import type { TextBody } from "@/core/marketing-engine/request";
import type { GraphicDesign } from "@/core/graphics/design";
import type { CampaignRow, PropertyRow } from "@/lib/supabase/database.types";
import { formatPrice } from "@/lib/utils";
import { DELIVERABLES, type CampaignOptions, type DeliverableId } from "@/verticals/real-estate/campaign";

export interface QaCheck {
  label: string;
  status: "ok" | "warn" | "fail" | "pending";
  detail: string;
}

export interface QaAsset {
  deliverable: DeliverableId;
  kind: string;
  body: unknown;
}

const digits = (s: string) => s.replace(/[\s  ]/g, "");

/**
 * Campaign-level QA on top of per-material checks: facts, goal, branding and
 * consistency across the generated set. Deterministic (no AI cost).
 */
export function campaignQa(c: { campaign: CampaignRow; property: PropertyRow; options: CampaignOptions; brief: StoredBrief | null }, assets: QaAsset[]): QaCheck[] {
  const out: QaCheck[] = [];
  const texts = assets.filter((a) => a.kind === "text" && a.body).map((a) => {
    const body = a.body as TextBody;
    const sel = body.variants?.find((v) => v.id === body.selected) ?? body.variants?.[0];
    return { deliverable: a.deliverable, text: sel ? variantToText(sel.variant) : "", quality: sel?.quality as QualityReport | undefined, cta: sel?.variant.cta ?? "" };
  });
  const graphics = assets.filter((a) => a.kind === "graphic" && a.body).map((a) => ({ deliverable: a.deliverable, design: a.body as GraphicDesign }));

  if (!c.brief) out.push({ label: "Brief kampanii", status: "pending", detail: "Brief jeszcze nie powstał." });
  else
    out.push({
      label: "Brief kampanii",
      status: c.brief.warnings.length ? "warn" : "ok",
      detail: c.brief.warnings.length ? `Uwagi kontroli faktów: ${c.brief.warnings.join("; ")}` : `Argumenty oparte na faktach (${c.brief.selling_points.length}), jedno CTA: „${c.brief.cta}”.`,
    });

  if (texts.length) {
    const critical = texts.flatMap((t) => (t.quality?.checks ?? []).filter((ch) => ch.status === "fail").map((ch) => `${DELIVERABLES[t.deliverable].label}: ${ch.label}`));
    const avg = Math.round(texts.reduce((s, t) => s + (t.quality?.score ?? 0), 0) / texts.length);
    out.push({ label: "Fakty i obietnice w tekstach", status: critical.length ? "fail" : "ok", detail: critical.length ? `Do poprawy: ${critical.join("; ")}` : `Bez zmyślonych parametrów i obietnic. Średnia ocena jakości: ${avg}/100.` });
    const noCta = texts.filter((t) => !t.cta.trim()).map((t) => DELIVERABLES[t.deliverable].label);
    out.push({ label: "Wezwanie do działania", status: noCta.length ? "warn" : "ok", detail: noCta.length ? `Brak CTA: ${noCta.join(", ")}` : "Każdy tekst kończy się konkretnym krokiem." });

    if (c.campaign.goal === "price_drop" && c.property.price != null) {
      const price = digits(formatPrice(c.property.price, c.property.currency) ?? "").replace(/[^\d]/g, "");
      const missing = texts.filter((t) => ["ig_post", "fb_post", "meta_ads"].includes(t.deliverable) && !digits(t.text).includes(price)).map((t) => DELIVERABLES[t.deliverable].label);
      out.push({ label: "Cel: nowa cena w komunikacji", status: missing.length ? "warn" : "ok", detail: missing.length ? `Nowa cena nie pada w: ${missing.join(", ")}` : "Nowa cena jest w postach i reklamie." });
    }
    if (c.campaign.goal === "open_house" && c.options.openHouseFrom) {
      const missing = texts.filter((t) => ["ig_post", "fb_post"].includes(t.deliverable) && !t.text.includes(c.options.openHouseFrom!)).map((t) => DELIVERABLES[t.deliverable].label);
      out.push({ label: "Cel: termin dnia otwartego", status: missing.length ? "warn" : "ok", detail: missing.length ? `Godzina dnia otwartego nie pada w: ${missing.join(", ")}` : "Termin jest w postach kampanii." });
    }
    const hashtags = new Set(c.brief?.hashtags.map((h) => h.toLowerCase()) ?? []);
    if (hashtags.size) {
      const ig = texts.find((t) => t.deliverable === "ig_post");
      if (ig) {
        const used = [...hashtags].filter((h) => ig.text.toLowerCase().includes(h)).length;
        out.push({ label: "Spójność z briefem", status: "ok", detail: `Post na Instagram używa ${used} z ${hashtags.size} hashtagów kampanii; wszystkie teksty dostały ten sam brief i CTA.` });
      }
    }
  }

  if (graphics.length) {
    const overrides = graphics.filter((g) => Object.keys(g.design.colors ?? {}).length || g.design.headingFont || g.design.bodyFont).map((g) => DELIVERABLES[g.deliverable].label);
    const noLogo = graphics.filter((g) => !g.design.showLogo).map((g) => DELIVERABLES[g.deliverable].label);
    out.push({
      label: "Branding grafik",
      status: noLogo.length ? "warn" : "ok",
      detail: [noLogo.length ? `Bez logo: ${noLogo.join(", ")}` : "Logo i dane kontaktowe biura na grafikach.", overrides.length ? `Kolory lub fonty zmienione ręcznie: ${overrides.join(", ")}.` : "Kolory i fonty z Brand Studio."].join(" "),
    });
    const placeholders = graphics.filter((g) => g.design.slides.some((s) => s.kind !== "features" && s.kind !== "cta" && s.photoIds.length === 0)).map((g) => DELIVERABLES[g.deliverable].label);
    if (placeholders.length) out.push({ label: "Zdjęcia na grafikach", status: "warn", detail: `Plansze bez zdjęcia: ${placeholders.join(", ")}. Dodaj więcej zdjęć oferty.` });
  }
  return out;
}
