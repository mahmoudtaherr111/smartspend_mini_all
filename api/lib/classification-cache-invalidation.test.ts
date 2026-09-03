/**
 * "I corrected it and it made the same mistake again."
 *
 * The mechanical cause: correcting an expense invalidated muscle memory — the layer
 * that LEARNS — and not the classification cache, which holds results for seven days
 * keyed on the normalized text. So the next time the user said the same sentence, the
 * corrected answer never got a chance to run: the old one was served from cache.
 *
 * These lock the invariant that every layer able to replay an answer is cleared
 * whenever the user tells us that answer was wrong.
 */
import { describe, it, expect, vi } from "vitest";
import { invalidateUserClassificationCache, runSmartPipeline } from "./smart-pipeline";

vi.mock("../queries/connection", () => ({
  db: {
    select: () => ({
      from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }),
    }),
    query: {},
  },
  pool: {},
}));

const input = (userId: number) => ({
  userId,
  userType: "local",
  userPlan: "free",
  userDict: [],
  apiKey: "",
  modelName: "gemini-3.1-flash-lite",
  maxTokens: 128,
  pipelineSettings: {},
  text: "دفعت 120 على القهوة",
});

const routeOf = (r: { log: { routing?: Record<string, unknown> } }) =>
  (r.log.routing as { route?: string } | undefined)?.route;

describe("classification cache invalidation", () => {
  it("serves a repeated sentence from cache, until the user corrects it", async () => {
    const first = await runSmartPipeline(input(960_001) as never);
    expect(routeOf(first)).not.toBe("classification_cache_hit");

    // Same user, same sentence: this is the behaviour that makes a stale correction
    // invisible, and it is also the behaviour that keeps the system cheap.
    const second = await runSmartPipeline(input(960_001) as never);
    expect(routeOf(second)).toBe("classification_cache_hit");

    // What `expense.update` now calls. Before this, only muscle memory was cleared.
    invalidateUserClassificationCache(960_001, "local");

    const third = await runSmartPipeline(input(960_001) as never);
    expect(routeOf(third)).not.toBe("classification_cache_hit");
  });

  it("clears only the correcting user's entries", async () => {
    await runSmartPipeline(input(960_002) as never);
    await runSmartPipeline(input(960_003) as never);

    invalidateUserClassificationCache(960_002, "local");

    // The other user's cache is untouched — one person's correction must not cost
    // everyone else their cache hits.
    const other = await runSmartPipeline(input(960_003) as never);
    expect(routeOf(other)).toBe("classification_cache_hit");

    const corrected = await runSmartPipeline(input(960_002) as never);
    expect(routeOf(corrected)).not.toBe("classification_cache_hit");
  });

  it("clears a user's entries across every sentence they cached, not just one", async () => {
    const a = { ...input(960_004), text: "دفعت 120 على القهوة" };
    const b = { ...input(960_004), text: "اتغديت بـ 90" };
    await runSmartPipeline(a as never);
    await runSmartPipeline(b as never);
    expect(routeOf(await runSmartPipeline(b as never))).toBe("classification_cache_hit");

    invalidateUserClassificationCache(960_004, "local");

    // A correction usually implies a misunderstanding of a pattern, not of one string.
    expect(routeOf(await runSmartPipeline(a as never))).not.toBe("classification_cache_hit");
    expect(routeOf(await runSmartPipeline(b as never))).not.toBe("classification_cache_hit");
  });
});
