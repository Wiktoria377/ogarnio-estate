import { describe, expect, it } from "vitest";
import { aiCost, budgetState, formatCost, mrrMinor, rateFor, renderCost, storageCost, type Rate } from "@/core/admin/costs";

const RATES: Rate[] = [
  { kind: "ai_input_mtok", model: "claude-opus-5-5", amount: 5 },
  { kind: "ai_output_mtok", model: "claude-opus-5-5", amount: 25 },
  { kind: "ai_input_mtok", model: "*", amount: 1 },
  { kind: "video_render_minute", model: "*", amount: 0.02 },
];

describe("cost rates", () => {
  it("exact, prefix, then wildcard", () => {
    expect(rateFor(RATES, "ai_input_mtok", "claude-opus-5-5")).toBe(5);
    expect(rateFor(RATES, "ai_input_mtok", "claude-opus-5-5-20261001")).toBe(5);
    expect(rateFor(RATES, "ai_input_mtok", "claude-haiku-5-5")).toBe(1);
    expect(rateFor(RATES, "ai_output_mtok", "claude-haiku-5-5")).toBeNull();
    expect(rateFor([], "storage_gb_month")).toBeNull();
  });
  it("prices tokens and reports unpriced usage instead of zero", () => {
    const c = aiCost([
      { model: "claude-opus-5-5", input_tokens: 2_000_000, output_tokens: 100_000 },
      { model: "claude-haiku-5-5", input_tokens: 1_000_000, output_tokens: 50_000 },
      { model: "offline-test-provider", input_tokens: 999, output_tokens: 999 },
    ], RATES);
    expect(c.amount).toBeCloseTo(10 + 2.5 + 1, 6);
    expect(c.partial).toBe(true);
    expect(c.unpricedTokens).toBe(50_000);
    expect(formatCost(c, "USD")).toContain("nieznane");
  });
  it("offline provider and empty usage are free", () => {
    expect(aiCost([{ model: "offline-test-provider", input_tokens: 10, output_tokens: 10 }], [])).toEqual({ amount: 0, partial: false, unpricedTokens: 0 });
  });
  it("render and storage", () => {
    expect(renderCost(90, RATES).amount).toBeCloseTo(0.03, 6);
    expect(renderCost(90, []).partial).toBe(true);
    expect(renderCost(0, []).partial).toBe(false);
    expect(storageCost(2 * 1024 ** 3, [{ kind: "storage_gb_month", model: "*", amount: 0.1 }]).amount).toBeCloseTo(0.2, 6);
  });
});

describe("MRR and budgets", () => {
  const plans = [{ id: "solo", price_minor: 14900, billing_interval: "month" as const }, { id: "agency", price_minor: 958800, billing_interval: "year" as const }];
  it("counts active and past_due at list price; trials do not count", () => {
    expect(mrrMinor([{ status: "active", plan: "solo", provider: "stripe" }, { status: "past_due", plan: "agency", provider: "stripe" }, { status: "trialing", plan: "solo", provider: null }, { status: "canceled", plan: "solo", provider: "stripe" }], plans)).toBe(14900 + 79900);
  });
  it("budget levels", () => {
    expect(budgetState(100, 80, { amount: 50, partial: false, unpricedTokens: 0 }).level).toBe("ok");
    expect(budgetState(100, 80, { amount: 85, partial: false, unpricedTokens: 0 })).toMatchObject({ level: "alert", pct: 85 });
    expect(budgetState(100, 80, { amount: 100, partial: false, unpricedTokens: 0 }).level).toBe("exceeded");
    expect(budgetState(0, 80, { amount: 0.01, partial: false, unpricedTokens: 0 }).level).toBe("exceeded");
  });
});
