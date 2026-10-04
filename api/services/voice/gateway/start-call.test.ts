import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("../../../queries/connection", () => ({
  db: mockDb,
}));

vi.mock("../../entitlements/voice", () => ({
  getVoiceEntitlements: vi.fn(async () => ({
    blockedReason: null,
    model: "gemini-3.8-live",
    thinkingLevel: "low",
    month: "2026-10",
    allowedCallSeconds: 180,
    remainingSecondsThisMonth: 1200,
    ultra: null,
  })),
}));

vi.mock("../../../lib/redis-client", () => ({
  executeSlidingWindowRateLimit: vi.fn(async () => ({ allowed: true })),
  getRedisClient: vi.fn(async () => null),
  getCacheRuntimeStatus: vi.fn(() => ({ memoryFallbackAllowed: true })),
}));

vi.mock("../../../lib/settings-cache", () => ({
  getSystemSettings: vi.fn(async () => ({})),
}));

vi.mock("./store", () => ({
  callStateAvailable: vi.fn(async () => true),
  putTicket: vi.fn(async () => undefined),
}));

vi.mock("./persistence", () => ({
  closeAbandonedCalls: vi.fn(async () => 0),
}));

vi.mock("./admission", () => ({
  admissionLimits: vi.fn(() => ({ poolMax: 10, userMax: 1 })),
  admitCall: vi.fn(),
  releaseCall: vi.fn(async () => undefined),
}));

import { admitCall, releaseCall } from "./admission";
import { startVoiceCall } from "./start-call";

describe("startVoiceCall multi-device handling", () => {
  const user = { id: 7, type: "local" as const, plan: "pro", role: "user" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.insert.mockReturnValue({ values: vi.fn(async () => undefined) });
  });

  it("admits a new call when no existing call is active", async () => {
    vi.mocked(admitCall).mockResolvedValueOnce({ ok: true, inUse: 1 });
    const result = await startVoiceCall(user, { client: "web" });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      expect(result.callId).toMatch(/^vc_/);
      expect(result.ticket).toBeTruthy();
    }
  });

  it("automatically reclaims the seat if the user had a reconnecting (disconnected) call on another device", async () => {
    // First attempt fails because Redis seat is held
    vi.mocked(admitCall)
      .mockResolvedValueOnce({ ok: false, reason: "user_busy", inUse: 1 })
      .mockResolvedValueOnce({ ok: true, inUse: 1 });

    const updateWhere = vi.fn(async () => undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    mockDb.update.mockReturnValue({ set: updateSet });

    const selectWhere = vi.fn(async () => [
      { id: "vc_old123", status: "reconnecting", model: "gemini-3.8-live" },
    ]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    mockDb.select.mockReturnValue({ from: selectFrom });

    const result = await startVoiceCall(user, { client: "web" });

    // Old reconnecting call was closed cleanly and its seat released
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ended",
        endReason: "device_switched",
      }),
    );
    expect(releaseCall).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "vc_old123",
      }),
    );
    // Admitted successfully without blocking the user!
    expect(result.kind).toBe("ok");
  });

  it("returns canTakeover when another device is still actively live", async () => {
    vi.mocked(admitCall).mockResolvedValueOnce({
      ok: false,
      reason: "user_busy",
      inUse: 1,
    });

    const selectWhere = vi.fn(async () => [
      { id: "vc_live456", status: "live", model: "gemini-3.8-live" },
    ]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    mockDb.select.mockReturnValue({ from: selectFrom });

    const result = await startVoiceCall(user, { client: "web" });

    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      expect(result.reason).toBe("user_busy");
      expect(result.canTakeover).toBe(true);
      expect(result.activeCallId).toBe("vc_live456");
    }
  });

  it("terminates the live call and admits the new device when takeover is true", async () => {
    vi.mocked(admitCall)
      .mockResolvedValueOnce({ ok: false, reason: "user_busy", inUse: 1 })
      .mockResolvedValueOnce({ ok: true, inUse: 1 });

    const updateWhere = vi.fn(async () => undefined);
    const updateSet = vi.fn(() => ({ where: updateWhere }));
    mockDb.update.mockReturnValue({ set: updateSet });

    const selectWhere = vi.fn(async () => [
      { id: "vc_live456", status: "live", model: "gemini-3.8-live" },
    ]);
    const selectFrom = vi.fn(() => ({ where: selectWhere }));
    mockDb.select.mockReturnValue({ from: selectFrom });

    const result = await startVoiceCall(user, { client: "web", takeover: true });

    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "ended",
        endReason: "takeover",
      }),
    );
    expect(releaseCall).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "vc_live456",
      }),
    );
    expect(result.kind).toBe("ok");
  });
});
