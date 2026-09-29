/**
 * The classification cache is correct by its key, not by being cleared
 * (docs/decisions/0013-caching-as-one-system.md).
 *
 * It used to be keyed on the text and a few settings and kept correct by clearing it on
 * every save, from every write path that remembered to. That wiped every user's repeats on
 * each coffee, still served old answers on any other server process, and missed whatever a
 * write path forgot. These lock the replacement: what the answer depends on is in the key,
 * so a change misses by itself, and nothing a caller does to a result reaches the next one.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const rules: Array<Record<string, unknown>> = [];

vi.mock("../queries/connection", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }),
    }),
    // A correction rule that applies records its hit.
    update: () => ({ set: () => ({ where: async () => [] }) }),
    query: {},
  },
  pool: {},
}));

vi.mock("./correction-rules", async (original) => ({
  ...(await original<object>()),
  loadCorrectionRules: async () => rules.map((rule) => ({ ...rule })),
}));

import { runSmartPipeline } from "./smart-pipeline";
import { clearClassificationCache } from "./classification-cache";

const input = (userId: number, extra: Record<string, unknown> = {}) => ({
  userId,
  userType: "local",
  userPlan: "free",
  userDict: [],
  apiKey: "",
  modelName: "gemini-3.1-flash-lite",
  maxTokens: 128,
  pipelineSettings: {},
  text: "دفعت 120 على القهوة",
  ...extra,
});

const routeOf = (r: { log: { routing?: Record<string, unknown> } }) =>
  (r.log.routing as { route?: string } | undefined)?.route;
const HIT = "classification_cache_hit";

beforeEach(() => {
  rules.length = 0;
  clearClassificationCache();
});

describe("the classification cache", () => {
  it("serves a repeated sentence while nothing it depends on changed", async () => {
    expect(routeOf(await runSmartPipeline(input(960_001) as never))).not.toBe(HIT);
    expect(routeOf(await runSmartPipeline(input(960_001) as never))).toBe(HIT);
  });

  it("misses by itself after a correction, with no one clearing it", async () => {
    await runSmartPipeline(input(960_002) as never);
    rules.push({
      id: 1,
      pattern: "قهوه",
      category: "ترفيه",
      subCategory: "خروجة",
      type: "expense",
      amountMin: null,
      amountMax: null,
    });
    expect(routeOf(await runSmartPipeline(input(960_002) as never))).not.toBe(HIT);
  });

  it("misses when the user's dictionary or known people change", async () => {
    await runSmartPipeline(input(960_003) as never);
    const taught = input(960_003, { userDict: [{ word: "القهوة", category: "ترفيه", subCategory: "خروجة" }] });
    expect(routeOf(await runSmartPipeline(taught as never))).not.toBe(HIT);
    const withPeople = input(960_003, { userProfileContext: { knownPeople: [{ name: "مروان", category: "أصدقاء" }] } });
    expect(routeOf(await runSmartPipeline(withPeople as never))).not.toBe(HIT);
  });

  it("keeps one user's answers away from another's", async () => {
    await runSmartPipeline(input(960_004) as never);
    expect(routeOf(await runSmartPipeline(input(960_005) as never))).not.toBe(HIT);
  });

  it("does not let a caller's change to a result reach the next request", async () => {
    const first = await runSmartPipeline(input(960_006) as never);
    const category = first.items[0]?.category;
    await runSmartPipeline(input(960_006) as never);
    const handed = await runSmartPipeline(input(960_006) as never);
    handed.items[0].category = "تغيير من المتصل";
    const next = await runSmartPipeline(input(960_006) as never);
    expect(routeOf(next)).toBe(HIT);
    expect(next.items[0]?.category).toBe(category);
  });

  it("reports no model attempts on a hit, so nothing is billed twice", async () => {
    await runSmartPipeline(input(960_007) as never);
    const hit = await runSmartPipeline(input(960_007) as never);
    expect(routeOf(hit)).toBe(HIT);
    expect(hit.tokensUsed).toBe(0);
    expect(hit.log.providerRoute).toBeUndefined();
  });

  it("keeps month totals out of the way unless they move the 'higher than usual' check", async () => {
    const at = (totalExpense: number) => input(960_008, { monthlyContext: { totalIncome: 10_000, totalExpense } });
    await runSmartPipeline(at(4_000) as never);
    expect(routeOf(await runSmartPipeline(at(4_050) as never))).toBe(HIT);
    expect(routeOf(await runSmartPipeline(at(9_000) as never))).not.toBe(HIT);
  });
});
