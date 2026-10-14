import { describe, expect, it } from "vitest";
import { buildMemoryContext, candidatesFromEdit, dedupeKey, deriveSuggestions, diffVariant, isEmptyMemory, pickExamples, type FeedbackEvent } from "@/core/brand-memory/learn";
import { buildGenerationUserPrompt } from "@/core/marketing-engine/prompt";
import { TestProvider } from "@/core/ai/test-provider";
import { z } from "zod";

const v = (p: Partial<{ headline: string; hook: string; cta: string; text: string }> = {}) => ({
  angle: "Konkret (test)",
  headline: p.headline ?? "Przestronne mieszkanie z balkonem w spokojnej okolicy Mokotowa",
  hook: p.hook ?? "Wyjątkowa okazja dla rodziny.",
  cta: p.cta ?? "Napisz wiadomość, aby umówić prezentację.",
  sections: [{ content: p.text ?? "Wyjątkowa okazja: trzy pokoje, balkon i spokojna okolica." }],
});

let n = 0;
const ev = (kind: string, data: Record<string, unknown>): FeedbackEvent => ({ id: `e${++n}`, kind, data, created_at: new Date(2026, 9, 1, 10, n).toISOString() });

describe("diffVariant and candidates", () => {
  it("detects CTA, headline and removed words", () => {
    const d = diffVariant(v(), v({ headline: "Mieszkanie z balkonem", cta: "Zadzwoń do biura", hook: "Dla rodziny.", text: "Trzy pokoje, balkon i spokojna okolica." }));
    expect(d.cta).toEqual({ before: "Napisz wiadomość, aby umówić prezentację.", after: "Zadzwoń do biura" });
    expect(d.headline?.after).toBe("Mieszkanie z balkonem");
    expect(d.removed).toContain("wyjątkowa");
    expect(d.removed).toContain("okazja");
  });

  it("offers a choice after one edit, never more than the person changed", () => {
    const c = candidatesFromEdit(diffVariant(v(), v({ headline: "Mieszkanie z balkonem", cta: "Zadzwoń do biura" })));
    expect(c.map((x) => x.kind)).toEqual(["cta", "headline", "headline_style"]);
    expect(c[2]!.content).toMatch(/Krótsze nagłówki \(do ok\. \d+ znaków\)/);
    expect(candidatesFromEdit(diffVariant(v(), v()))).toEqual([]);
  });

  it("ignores case and punctuation changes", () => {
    expect(diffVariant(v({ cta: "Zadzwoń!" }), v({ cta: "zadzwoń" })).cta).toBeUndefined();
  });
});

describe("deriveSuggestions (repeated decisions only)", () => {
  it("one edit is never a suggestion; two identical CTA edits are", () => {
    const one = [ev("content_edited", { cta: { before: "a", after: "Zadzwoń do biura" }, removed: [] })];
    expect(deriveSuggestions(one, new Set())).toEqual([]);
    const two = [...one, ev("content_edited", { cta: { before: "b", after: "zadzwoń do biura!" }, removed: [] })];
    const s = deriveSuggestions([...two].reverse(), new Set()); // the database returns newest first
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ kind: "cta", content: "Zadzwoń do biura", dedupeKey: dedupeKey("cta", "Zadzwoń do biura") });
    expect(s[0]!.evidence).toHaveLength(2);
  });

  it("finds repeatedly removed words, shortened headlines, templates, colours, rejections", () => {
    const events = [
      ev("content_edited", { removed: ["okazja", "luksus"], headline: { before: "x".repeat(80), after: "y".repeat(40) } }),
      ev("content_edited", { removed: ["okazja"], headline: { before: "x".repeat(70), after: "y".repeat(35) } }),
      ev("graphic_template", { template: "editorial", templateLabel: "Edytorski" }),
      ev("graphic_template", { template: "editorial", templateLabel: "Edytorski" }),
      ev("graphic_template", { template: "editorial", templateLabel: "Edytorski" }),
      ev("graphic_template", { template: "bold", templateLabel: "Wyrazisty" }),
      ev("graphic_edited", { colors: ["#1e3a5f"] }),
      ev("graphic_edited", { colors: ["#1E3A5F", "#FFFFFF"] }),
      ev("variant_rejected", { angle: "Pytanie retoryczne (test)" }),
      ev("variant_rejected", { angle: "pytanie retoryczne" }),
    ];
    const s = deriveSuggestions(events, new Set());
    const by = (k: string) => s.filter((x) => x.kind === k).map((x) => x.content);
    expect(by("avoid")).toEqual(["okazja"]);
    expect(by("headline_style")).toEqual(["Krótsze nagłówki (do ok. 40 znaków)"]);
    expect(by("template")).toEqual(["Edytorski"]);
    expect(by("color")).toEqual(["#1E3A5F"]);
    expect(by("rejected")[0]).toMatch(/Pytanie retoryczne/);
  });

  it("does not re-propose anything already in memory (also dismissed)", () => {
    const events = [ev("content_edited", { cta: { after: "Zadzwoń" } }), ev("content_edited", { cta: { after: "Zadzwoń" } })];
    expect(deriveSuggestions(events, new Set([dedupeKey("cta", "Zadzwoń")]))).toEqual([]);
  });
});

describe("memory context and selective retrieval", () => {
  const ex = (contentType: string, platform: string | null, headline: string) => ({ contentType, platform, headline, hook: "h", cta: "c", excerpt: "e" });
  const mem = buildMemoryContext(
    [
      { id: "1", kind: "cta", content: "Zadzwoń do biura", detail: {} },
      { id: "2", kind: "avoid", content: "okazja", detail: {} },
      { id: "3", kind: "template", content: "Edytorski", detail: { template: "editorial" } },
    ],
    [ex("sales_post", "instagram", "A"), ex("listing", "website", "B"), ex("sales_post", "facebook", "C"), ex("sales_post", "instagram", "D")],
  );

  it("groups explicit entries by kind", () => {
    expect(mem.ctas).toEqual(["Zadzwoń do biura"]);
    expect(mem.avoid).toEqual(["okazja"]);
    expect(mem.templates).toEqual(["editorial"]);
    expect(isEmptyMemory(mem)).toBe(false);
    expect(isEmptyMemory(buildMemoryContext([], []))).toBe(true);
  });

  it("picks at most two examples, same type and platform first", () => {
    expect(pickExamples(mem, "sales_post", "instagram").map((e) => e.headline)).toEqual(["A", "D"]);
    expect(pickExamples(mem, "listing", "instagram").map((e) => e.headline)).toEqual(["B", "A"]);
    expect(pickExamples(mem, "email", null)).toEqual([]);
    expect(pickExamples(null, "x", null)).toEqual([]);
  });
});

describe("offline provider follows brand instructions", () => {
  it("uses preferred CTAs, skips avoided words and limits headlines", async () => {
    const p = new TestProvider();
    const r = await p.complete({
      operation: "generate", tier: "standard" as never, system: "", user: "",
      schema: z.object({ variants: z.array(z.object({ headline: z.string(), hook: z.string(), cta: z.string(), sections: z.array(z.object({ content: z.string() })) }).passthrough()) }).passthrough(),
      testHint: { kind: "generate", sections: [{ key: "body", label: "Treść" }], facts: [{ label: "Opis", value: "Okazja, mieszkanie z balkonem" }], subject: "Wyjątkowa okazja: mieszkanie na Mokotowie z balkonem", count: 2, usesHashtags: false, seed: 0, brand: { ctas: ["Zadzwoń do biura", "Umów prezentację"], avoid: ["okazja"], headlineMax: 30 } },
    });
    const out = r.data as { variants: { headline: string; hook: string; cta: string }[] };
    expect(out.variants.map((x) => x.cta)).toEqual(["Zadzwoń do biura", "Umów prezentację"]);
    for (const x of out.variants) {
      expect(x.headline.length).toBeLessThanOrEqual(30);
      expect(`${x.headline} ${x.hook}`.toLowerCase()).not.toContain("okazja");
    }
  });
});

describe("prompt", () => {
  it("adds explicit memory to the brand block and examples only for matching content", async () => {
    const { getContentType } = await import("@/verticals/real-estate/content-types");
    const def = getContentType("property_sales_post")!;
    expect(def).toBeTruthy();
    const brand = {
      companyName: "Biuro", tagline: null, colors: { primary: "#000000", secondary: "#111111", accent: "#222222", background: "#FFFFFF", text: "#000000" },
      headingFont: "manrope", bodyFont: "manrope", contact: { email: null, phone: null, address: null, website: null }, socials: {}, style: "modern_minimal", personality: null, targetAudience: null,
      communicationStyle: "professional_warm", addressForm: "pan_pani", emojiPolicy: "none", preferredPhrases: null, avoidedPhrases: null, logoKey: null,
      profile: (await import("@/core/brand/profile")).EMPTY_EXTENDED, profileVersion: null,
      memory: buildMemoryContext([{ id: "1", kind: "cta", content: "Zadzwoń <do> biura", detail: {} }], [{ contentType: def.id, platform: "instagram", headline: "Wzorcowy nagłówek", hook: "h", cta: "c", excerpt: "e" }]),
    } as never;
    const prompt = buildGenerationUserPrompt({
      def, brand, facts: null, audienceLabel: "Rodziny", previous: [],
      request: { contentType: def.id, platform: "instagram", goal: "sell", tone: "brand", length: "medium", ctaType: "contact", variants: 2, topic: "", extraInstructions: "", marketData: "", audience: "families", sequenceCount: undefined } as never,
    } as never);
    expect(prompt).toContain("Pamięć marki, preferowane CTA");
    expect(prompt).toContain("Zadzwoń ‹do› biura");
    expect(prompt).toContain("<przyklady_stylu>");
    expect(prompt).toContain("Wzorcowy nagłówek");
  });
});
