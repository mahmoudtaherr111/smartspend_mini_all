import { describe, expect, it } from "vitest";
import { resolveVoiceEntitlements, rolloutBucket, voiceMonth } from "./voice";

const freeUser = { id: 7, type: "local" as const, plan: "free", role: "user" };
const noUsage = { usedSecondsThisMonth: 0, spentTodayUsd: 0 };

describe("resolveVoiceEntitlements", () => {
  it("reads the registry defaults when nothing was saved", () => {
    const result = resolveVoiceEntitlements(freeUser, {}, noUsage, "2026-09");

    expect(result).toMatchObject({
      plan: "free",
      enabled: true,
      v2: false,
      minutesPerMonth: 2,
      maxCallSeconds: 60,
      allowedCallSeconds: 60,
      model: "gemini-3.8-live",
      thinkingLevel: "low",
      blockedReason: null,
    });
  });

  it("gives staff and allowlisted users the new call before the rollout", () => {
    expect(resolveVoiceEntitlements({ ...freeUser, role: "admin" }, {}, noUsage, "2026-09").v2).toBe(true);
    expect(resolveVoiceEntitlements(freeUser, { voice_v2_allowlist: "oauth:7, local:7" }, noUsage, "2026-09").v2).toBe(true);
    expect(resolveVoiceEntitlements(freeUser, { voice_v2_allowlist: "oauth:7" }, noUsage, "2026-09").v2).toBe(false);
  });

  it("rolls out by a stable bucket", () => {
    const bucket = rolloutBucket(freeUser);
    expect(bucket).toBe(rolloutBucket({ id: 7, type: "local" }));
    expect(resolveVoiceEntitlements(freeUser, { voice_v2_rollout_percent: String(bucket + 1) }, noUsage, "2026-09").v2).toBe(true);
    expect(resolveVoiceEntitlements(freeUser, { voice_v2_rollout_percent: String(bucket) }, noUsage, "2026-09").v2).toBe(false);
    expect(resolveVoiceEntitlements(freeUser, { voice_v2_rollout_percent: "100" }, noUsage, "2026-09").v2).toBe(true);
  });

  it("limits the call to what the month has left", () => {
    const settings = { voice_call_limit_pro: "30", voice_call_duration_pro: "600" };
    const pro = { ...freeUser, plan: "pro" };

    expect(resolveVoiceEntitlements(pro, settings, { usedSecondsThisMonth: 1700, spentTodayUsd: 0 }, "2026-09"))
      .toMatchObject({ remainingSecondsThisMonth: 100, allowedCallSeconds: 100, blockedReason: null });
    expect(resolveVoiceEntitlements(pro, settings, { usedSecondsThisMonth: 1800, spentTodayUsd: 0 }, "2026-09"))
      .toMatchObject({ remainingSecondsThisMonth: 0, allowedCallSeconds: 0, blockedReason: "month_used" });
  });

  it("stops at the daily cost cap and at the kill switch", () => {
    expect(resolveVoiceEntitlements(freeUser, {}, { usedSecondsThisMonth: 0, spentTodayUsd: 0.1 }, "2026-09").blockedReason)
      .toBe("daily_cost_cap");
    const killed = resolveVoiceEntitlements({ ...freeUser, role: "admin" }, { voice_v2_kill_switch: "true" }, noUsage, "2026-09");
    expect(killed).toMatchObject({ v2: false, blockedReason: "kill_switch" });
  });

  it("refuses a plan the admin switched off", () => {
    expect(resolveVoiceEntitlements(freeUser, { voice_call_enabled_free: "false" }, noUsage, "2026-09").blockedReason)
      .toBe("disabled");
  });

  it("uses a per-plan model when the admin set one", () => {
    const ultra = { ...freeUser, plan: "ultra" };
    const settings = { voice_v2_model_ultra: "gemini-3.8-live-extended-thinking", voice_v2_thinking_level: "medium" };

    expect(resolveVoiceEntitlements(ultra, settings, noUsage, "2026-09"))
      .toMatchObject({ model: "gemini-3.8-live-extended-thinking", thinkingLevel: "medium" });
    expect(resolveVoiceEntitlements(freeUser, settings, noUsage, "2026-09").model).toBe("gemini-3.8-live");
  });
});

describe("voiceMonth", () => {
  it("is the Cairo month", () => {
    // 01:30 on 1 October in Cairo is still 30 September in UTC.
    expect(voiceMonth(new Date("2026-09-30T22:30:00Z"))).toBe("2026-10");
    expect(voiceMonth(new Date("2026-09-30T20:30:00Z"))).toBe("2026-09");
  });
});
