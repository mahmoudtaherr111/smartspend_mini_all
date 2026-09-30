import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/redis-client", () => ({ getRedisClient: vi.fn(async () => null) }));

import { admitCall, breakerState, releaseCall, resetAdmissionMemory, SEAT_TTL_MS, seatsInUse, tripBreaker } from "./admission";

const user = (id: number, type = "local") => ({ id, type });
const limits = { poolMax: 2, userMax: 1 };

describe("voice admission (one process, no Redis)", () => {
  beforeEach(() => resetAdmissionMemory());

  it("fills a model's pool, then refuses, and a released seat is free again", async () => {
    const now = 1_000_000;
    expect(await admitCall({ pool: "m", callId: "c1", user: user(1) }, limits, now)).toMatchObject({ ok: true, inUse: 1 });
    expect(await admitCall({ pool: "m", callId: "c2", user: user(2) }, limits, now)).toMatchObject({ ok: true, inUse: 2 });
    expect(await admitCall({ pool: "m", callId: "c3", user: user(3) }, limits, now)).toMatchObject({ ok: false, reason: "pool_full" });
    await releaseCall({ pool: "m", callId: "c1", user: user(1) });
    expect(await admitCall({ pool: "m", callId: "c3", user: user(3) }, limits, now)).toMatchObject({ ok: true });
  });

  it("gives one live call per user, by id and type together", async () => {
    const now = 1_000_000;
    expect(await admitCall({ pool: "m", callId: "c1", user: user(7, "local") }, { poolMax: 0, userMax: 1 }, now)).toMatchObject({ ok: true });
    expect(await admitCall({ pool: "m", callId: "c2", user: user(7, "local") }, { poolMax: 0, userMax: 1 }, now)).toMatchObject({ ok: false, reason: "user_busy" });
    // The same number as a Google account is another person.
    expect(await admitCall({ pool: "m", callId: "c3", user: user(7, "oauth") }, { poolMax: 0, userMax: 1 }, now)).toMatchObject({ ok: true });
  });

  it("renews a held seat even when the pool is full, and lets a dead server's seat expire", async () => {
    const now = 1_000_000;
    await admitCall({ pool: "m", callId: "c1", user: user(1) }, limits, now);
    await admitCall({ pool: "m", callId: "c2", user: user(2) }, limits, now);
    expect(await admitCall({ pool: "m", callId: "c1", user: user(1) }, limits, now + 10_000)).toMatchObject({ ok: true, inUse: 2 });
    // c2 was never renewed: after its TTL the seat is free for someone else.
    expect(await admitCall({ pool: "m", callId: "c3", user: user(3) }, limits, now + SEAT_TTL_MS + 1)).toMatchObject({ ok: true });
    expect(await seatsInUse(["m"], now + SEAT_TTL_MS + 1)).toEqual({ m: 2 });
  });

  it("holds new calls on a model back after a quota refusal, longer each trip, and leaves other models alone", async () => {
    const now = 5_000_000;
    expect(await tripBreaker("extended", now)).toBe(60_000);
    expect(await admitCall({ pool: "extended", callId: "c1", user: user(1) }, limits, now + 1_000)).toMatchObject({ ok: false, reason: "provider_quota" });
    expect(await admitCall({ pool: "standard", callId: "c2", user: user(2) }, limits, now + 1_000)).toMatchObject({ ok: true });
    // A call already under way keeps its seat through the pause.
    expect(await admitCall({ pool: "extended", callId: "c9", user: user(9) }, limits, now + 1_000, { live: true })).toMatchObject({ ok: true });
    expect(await breakerState("extended", now + 61_000)).toBeNull();
    expect(await tripBreaker("extended", now + 61_000)).toBe(120_000);
  });
});
