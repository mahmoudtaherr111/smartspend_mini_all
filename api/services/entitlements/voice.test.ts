import { describe, expect, it } from "vitest";
import { resolveVoiceEntitlements, voiceMonth } from "./voice";

const freeUser = { id: 7, type: "local" as const, plan: "free", role: "user" };
const noUsage = { usedSecondsThisMonth: 0, spentTodayUsd: 0 };

describe("resolveVoiceEntitlements", () => {
  it("reads the registry defaults when nothing was saved", () => {
    const result = resolveVoiceEntitlements(freeUser, {}, noUsage, "2026-09");

    expect(result).toMatchObject({
      plan: "free",
      enabled: true,
      killSwitch: false,
      minutesPerMonth: 2,
      maxCallSeconds: 60,
      allowedCallSeconds: 60,
      model: "gemini-3.8-live",
      thinkingLevel: "low",
      blockedReason: null,
    });
  });

  it("gives every user of a plan with calls the same call, staff or not", () => {
    const admin = resolveVoiceEntitlements({ ...freeUser, role: "admin" }, {}, noUsage, "2026-09");
    const user = resolveVoiceEntitlements(freeUser, {}, noUsage, "2026-09");
    expect(user).toEqual(admin);
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
    expect(killed).toMatchObject({ killSwitch: true, blockedReason: "kill_switch" });
  });

  it("refuses a plan the admin switched off", () => {
    expect(resolveVoiceEntitlements(freeUser, { voice_call_enabled_free: "false" }, noUsage, "2026-09").blockedReason)
      .toBe("disabled");
  });

  it("gives the coach call to nobody until the admin lists users or sets a percent", () => {
    expect(resolveVoiceEntitlements(freeUser, {}, noUsage, "2026-09")).toMatchObject({ coach: false, model: "gemini-3.8-live" });
    const listed = resolveVoiceEntitlements(freeUser, { voice_coach_allowlist: "oauth:7, local:7" }, noUsage, "2026-09");
    expect(listed).toMatchObject({ coach: true, model: "gemini-3.8-live-extended-thinking", thinkingLevel: "high" });
    // The same numeric id as a Google user is another person.
    expect(resolveVoiceEntitlements(freeUser, { voice_coach_allowlist: "oauth:7" }, noUsage, "2026-09").coach).toBe(false);
  });

  it("puts each user in or out of the coach rollout by a stable hash, never by chance", () => {
    const users = Array.from({ length: 400 }, (_, index) => ({ ...freeUser, id: index + 1 }));
    const inAt = (percent: string) =>
      users.filter((user) => resolveVoiceEntitlements(user, { voice_coach_rollout_percent: percent }, noUsage, "2026-09").coach);
    expect(inAt("0")).toHaveLength(0);
    expect(inAt("100")).toHaveLength(400);
    const five = inAt("5");
    expect(five.length).toBeGreaterThan(5);
    expect(five.length).toBeLessThan(45);
    // Raising the percent keeps everyone who was in: 5% is inside 25%.
    const quarter = new Set(inAt("25").map((user) => user.id));
    expect(five.every((user) => quarter.has(user.id))).toBe(true);
    expect(inAt("5").map((user) => user.id)).toEqual(five.map((user) => user.id));
  });

  it("keeps the coach's own model and level; a coach user is never moved to the standard model", () => {
    const settings = { voice_coach_allowlist: "local:7", voice_coach_thinking_level: "medium", voice_v2_model: "gemini-3.8-live" };
    expect(resolveVoiceEntitlements(freeUser, settings, noUsage, "2026-09"))
      .toMatchObject({ coach: true, model: "gemini-3.8-live-extended-thinking", thinkingLevel: "medium" });
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
