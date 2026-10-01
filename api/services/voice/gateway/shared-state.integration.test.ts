import { afterAll, describe, expect, it } from "vitest";
import { randomUUID } from "crypto";
import { getRedisClient } from "../../../lib/redis-client";
import { admitCall, breakerState, releaseCall, seatsInUse, tripBreaker } from "./admission";
import { deleteCallState, loadCallState, saveCallState } from "./store";

const suite = describe.runIf(process.env.RUN_REDIS_INTEGRATION === "1");
const run = `review_${randomUUID()}`;
const keys: string[] = [];
suite("voice shared state on real Redis", () => {
  it("trips quota pauses atomically and never shortens a concurrent pause", async () => {
    const pool = `${run}_breaker`;
    keys.push(`voice:breaker:${pool}`, `voice:breaker:trips:${pool}`);
    const holds = await Promise.all([1, 2, 3].map(() => tripBreaker(pool)));
    expect(holds.sort((a, b) => a - b)).toEqual([60000, 120000, 240000]);
    expect((await breakerState(pool))?.retryAfterMs).toBeGreaterThan(239000);
  });
  afterAll(async () => {
    const client = await getRedisClient();
    if (client && keys.length) await client.del(keys);
  });
  it("only one concurrent applicant takes the last seat, and moving a pool preserves user ownership", async () => {
    const pool = `${run}_pool`;
    const moved = `${run}_moved`;
    const user = { id: 989901, type: run };
    keys.push(
      `voice:admit:pool:${pool}`,
      `voice:admit:pool:${moved}`,
      `voice:admit:user:${user.type}:${user.id}`,
    );
    const limits = { poolMax: 1, userMax: 1 };
    const results = await Promise.all(
      ["c1", "c2"].map((callId) => admitCall({ pool, callId, user }, limits)),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const callId = results[0].ok ? "c1" : "c2";
    expect(
      await admitCall({ pool: moved, callId, user }, limits),
    ).toMatchObject({ ok: true });
    await releaseCall({ pool, callId, user }, { keepUser: true });
    expect(
      await admitCall({ pool, callId: "third", user }, limits),
    ).toMatchObject({ ok: false, reason: "user_busy" });
    expect(await seatsInUse([moved])).toEqual({ [moved]: 1 });
    await releaseCall({ pool: moved, callId, user });
    expect(
      await admitCall({ pool, callId: "third", user }, limits),
    ).toMatchObject({ ok: true });
  });
  it("rejects older owners, preserves newer checkpoints and does not resurrect a closed call", async () => {
    const callId = `${run}_call`;
    keys.push(`voice:call:${callId}`);
    expect(
      await saveCallState(callId, {
        epoch: 1,
        revision: 1,
        owner: "old",
        value: 1,
      }),
    ).toBe(true);
    expect(
      await saveCallState(callId, {
        epoch: 2,
        revision: 4,
        owner: "new",
        value: 4,
      }),
    ).toBe(true);
    expect(
      await saveCallState(callId, {
        epoch: 1,
        revision: 90,
        owner: "old",
        value: 90,
      }),
    ).toBe(false);
    expect(
      await saveCallState(callId, {
        epoch: 2,
        revision: 2,
        owner: "new",
        value: 2,
      }),
    ).toBe(true);
    expect(await loadCallState(callId)).toMatchObject({
      owner: "new",
      value: 4,
    });
    expect(
      await saveCallState(callId, {
        epoch: 2,
        revision: 5,
        owner: "competitor",
      }),
    ).toBe(false);
    await deleteCallState(callId);
    expect(await saveCallState(callId, { epoch: 3, owner: "new" })).toBe(false);
    expect(await loadCallState(callId)).toBeNull();
  });
});
