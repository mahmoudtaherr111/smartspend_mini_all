import { beforeEach, describe, expect, it, vi } from "vitest";
import { MySqlDialect } from "drizzle-orm/mysql-core";

const recorded = vi.hoisted(() => ({ where: [] as unknown[], inserts: [] as unknown[] }));

vi.mock("./queries/connection", () => {
  const db = {
    select: () => ({
      from: () => ({
        where: (condition: unknown) => {
          recorded.where.push(condition);
          return { limit: async () => [] };
        },
      }),
    }),
    insert: () => ({
      values: async (row: unknown) => {
        recorded.inserts.push(row);
      },
    }),
  };
  return { db, getDb: () => db };
});

import { adsRouter } from "./ads-router";
import { analyticsRouter } from "./analytics-router";

const caller = (plan: string | null) => ({
  user: plan ? { id: 7, type: "local", name: "U", role: "user", plan } : null,
  req: new Request("http://local.test/trpc"),
  ip: `ads-test-${plan}`,
});

/** The plan values the ad query compares with, read from the SQL it builds. */
function targetedPlans(condition: unknown): unknown[] {
  return new MySqlDialect().sqlToQuery(condition as never).params;
}

describe("which ads a caller is served", () => {
  beforeEach(() => {
    recorded.where.length = 0;
  });

  it("follows the caller's own plan, not the plan the request names", async () => {
    await adsRouter.createCaller(caller("pro") as never).list({ placement: "sidebar", userPlan: "free" });
    expect(targetedPlans(recorded.where[0])).toContain("pro");
    expect(targetedPlans(recorded.where[0])).not.toContain("free");

    await adsRouter.createCaller(caller("ultra") as never).list({ userPlan: "free" });
    expect(targetedPlans(recorded.where[1])).toContain("pro");

    await adsRouter.createCaller(caller(null) as never).list({ userPlan: "pro" });
    expect(targetedPlans(recorded.where[2])).toContain("free");
    expect(targetedPlans(recorded.where[2])).not.toContain("pro");
  });
});

describe("usage events from the app", () => {
  beforeEach(() => {
    recorded.inserts.length = 0;
  });

  it("stores the session length the app sends", async () => {
    await analyticsRouter
      .createCaller(caller("free") as never)
      .trackEvent({ event: "session_duration", metadata: { durationInSeconds: 42 } });
    expect(recorded.inserts).toEqual([
      expect.objectContaining({ event: "session_duration", metadata: { durationInSeconds: 42 } }),
    ]);
  });

  it("refuses other event names and large metadata", async () => {
    const track = analyticsRouter.createCaller(caller("free") as never).trackEvent;
    await expect(track({ event: "anything" as never })).rejects.toThrow();
    const big = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`k${i}`, i]));
    await expect(track({ event: "session_duration", metadata: big })).rejects.toThrow();
    await expect(
      track({ event: "session_duration", metadata: { nested: { a: 1 } as never } }),
    ).rejects.toThrow();
    expect(recorded.inserts).toHaveLength(0);
  });
});
