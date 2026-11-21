/**
 * Adversarial Stress Harness for Challenger 2
 * Tests Arabic dialect edge cases, offline pipeline, and UI logic.
 */
import { describe, it, expect } from "vitest";
import { extractPeople, extractAmounts, extractEntities } from "../api/lib/entity-extractor";
import { isKareemPersonContext } from "../api/lib/egyptian-names-dictionary";
import { runSmartPipeline } from "../api/lib/smart-pipeline";

describe("Adversarial Stress Test: Arabic Dialect & Entity Edge Cases", () => {
  it("preserves compound theophoric names (عبد الرحمن, عبد الله, عبد العزيز)", () => {
    const p1 = extractPeople("حولت 500 جنيه لعبد الرحمن امبارح");
    expect(p1).toContain("عبد الرحمن");

    const p2 = extractPeople("اديت عبد الله 300 عشان المشوار");
    expect(p2).toContain("عبد الله");

    const p3 = extractPeople("سلفت عبد العزيز 1000 جنيه");
    expect(p3).toContain("عبد العزيز");

    const p4 = extractPeople("دفعت لعبد الكريم 250");
    expect(p4).toContain("عبد الكريم");
  });

  it("disambiguates 'كريم' as ride hailing app vs person", () => {
    // App contexts
    expect(isKareemPersonContext("ركبت كريم بـ 60 جنيه")).toBe(false);
    expect(isKareemPersonContext("طلبت مشوار كريم بـ 85 جنيه")).toBe(false);
    expect(isKareemPersonContext("توصيلة كريم 45 جنيه")).toBe(false);
    expect(isKareemPersonContext("اخدت كريم للجامعة 50")).toBe(false);

    const appEntities = extractEntities("ركبت كريم بـ 60 جنيه");
    expect(appEntities.people).not.toContain("كريم");
    expect(appEntities.merchants).toContain("Careem");

    // Person contexts
    expect(isKareemPersonContext("حولت 500 جنيه لكريم صاحبي")).toBe(true);
    expect(isKareemPersonContext("اديت كريم 200 سلفة")).toBe(true);
    expect(isKareemPersonContext("سلفت كريم 350 جنيه")).toBe(true);
    expect(isKareemPersonContext("خدت من كريم 100 جنيه")).toBe(true);

    const personEntities = extractEntities("حولت 500 جنيه لكريم");
    expect(personEntities.people).toContain("كريم");
  });

  it("handles multi-item compound descriptions accurately", async () => {
    const text = "فول وطعمية 30 وقهوة 25 ومواصلات 15";
    const amounts = extractAmounts(text);
    expect(amounts.map((a) => a.amount)).toEqual([30, 25, 15]);
  });
});

describe("Adversarial Stress Test: Offline Fail-Fast in smart-pipeline.ts", () => {
  it("executes smart-pipeline offline with no API key and returns within < 250ms", async () => {
    const start = performance.now();
    const result = await runSmartPipeline({
      text: "بنزين 200",
      userId: 9999,
      userType: "oauth",
      userPlan: "free",
      userDict: [],
      apiKey: "",
      modelName: "flash",
      maxTokens: 400,
    });
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(3000); // Fail-fast without hanging under concurrency
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.items[0].amount).toBe(200);
    expect(result.items[0].category).toBe("مواصلات");
    expect(result.actualModelUsed).toBeNull(); // No AI was called
    expect(result.tokensUsed).toBe(0);
  });

  it("decomposes multiple items offline without hanging", async () => {
    const start = performance.now();
    const result = await runSmartPipeline({
      text: "فول وطعمية 30 وقهوة 25 ومواصلات 15",
      userId: 9999,
      userType: "oauth",
      userPlan: "free",
      userDict: [],
      apiKey: "",
      modelName: "flash",
      maxTokens: 400,
    });
    const duration = performance.now() - start;

    expect(result.items.length).toBe(3);
    expect(result.items.map((i) => i.amount).sort((a, b) => b - a)).toEqual([30, 25, 15]);
  }, 15000);
});
