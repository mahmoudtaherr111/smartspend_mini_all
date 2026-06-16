import { describe, expect, it } from "vitest";
import {
  buildAICostOverview,
  normalizeAICostAnalyticsEvent,
} from "./ai-cost-analytics";

describe("ai cost analytics", () => {
  it("normalizes telemetry rows and exposes route/cache/fallback signals", () => {
    const event = normalizeAICostAnalyticsEvent({
      id: 1,
      userId: 7,
      userType: "local",
      event: "ai_cost_chat",
      metadata: {
        intentKind: "finance_query",
        totalTokens: 320,
        llmCalls: 1,
        embeddingCalls: 0,
        latencyMs: 120,
        costUnits: 430,
        trace: {
          route: "finance.summary",
          cacheHits: ["finance:today"],
        },
      },
    });

    expect(event).toMatchObject({
      channel: "chat",
      route: "finance.summary",
      cacheHit: true,
      fallback: false,
      totalTokens: 320,
      llmCalls: 1,
    });
  });

  it("aggregates totals by channel, route, and user", () => {
    const overview = buildAICostOverview([
      normalizeAICostAnalyticsEvent({
        userId: 1,
        userType: "oauth",
        event: "ai_cost_chat",
        metadata: { route: "finance.summary", totalTokens: 100, costUnits: 150, llmCalls: 0, cacheHit: true },
      }),
      normalizeAICostAnalyticsEvent({
        userId: 1,
        userType: "oauth",
        event: "ai_cost_embedding",
        metadata: {
          route: "memory.search",
          totalTokens: 20,
          costUnits: 45,
          embeddingCalls: 1,
          embeddingApiStatus: "fallback_local_hash",
        },
      }),
    ]);

    expect(overview.totals).toMatchObject({
      count: 2,
      totalTokens: 120,
      totalCostUnits: 195,
      embeddingCalls: 1,
      cacheHitRate: 1,
      fallbackRate: 0.5,
    });
    expect(overview.byChannel.chat.count).toBe(1);
    expect(overview.byRoute["memory.search"].embeddingCalls).toBe(1);
    expect(overview.byUser["oauth:1"].count).toBe(2);
  });
});
