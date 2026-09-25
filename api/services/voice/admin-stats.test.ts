import { describe, expect, it } from "vitest";
import { summarizeVoiceCalls, type VoiceCallStatRow } from "./admin-stats";

const row = (over: Partial<VoiceCallStatRow>): VoiceCallStatRow => ({
  id: "vc_1", userId: 1, userType: "local", model: "gemini-3.8-live", client: "web", status: "ended",
  startedAt: new Date("2026-09-25T10:00:00Z"), billedSeconds: 60, endReason: "user", toolCalls: 2, incidents: 0,
  reconnects: 0, costUsd: "0.06", memoryStatus: "saved", metrics: { firstAudioMs: { p50: 900, p95: 1500 } }, ...over,
});

describe("summarizeVoiceCalls", () => {
  it("adds up calls, callers, minutes and cost per minute", () => {
    const stats = summarizeVoiceCalls(7, [
      row({}),
      row({ id: "vc_2", billedSeconds: 120, costUsd: "0.12", metrics: { firstAudioMs: { p50: 1100, p95: 2400 }, toolCostUsd: 0.002 } }),
      row({ id: "vc_3", userId: 2, model: "gemini-3.8-live-extended-thinking", billedSeconds: 60, costUsd: "0.16", endReason: "network" }),
    ], ["spoken_number_mismatch", "tool_error", "spoken_number_mismatch"]);
    expect(stats).toMatchObject({ calls: 3, callers: 2, minutes: 4, averageCallSeconds: 80, costUsd: 0.34, toolCostUsd: 0.002 });
    expect(stats.costPerMinuteUsd).toBeCloseTo(0.085);
    expect(stats.firstAudioMs).toEqual({ p50: 900, p95: 2400 });
    expect(stats.endReasons).toEqual([{ key: "user", count: 2 }, { key: "network", count: 1 }]);
    expect(stats.incidents[0]).toEqual({ key: "spoken_number_mismatch", count: 2 });
    expect(stats.models[0]).toMatchObject({ key: "gemini-3.8-live", count: 2, minutes: 3 });
  });

  it("stays readable with no calls", () => {
    expect(summarizeVoiceCalls(1, [], [])).toMatchObject({ calls: 0, costPerMinuteUsd: null, firstAudioMs: { p50: null, p95: null } });
  });

  it("leaves calls still running out of the end reasons", () => {
    expect(summarizeVoiceCalls(1, [row({ status: "live", endReason: null })], []).endReasons).toEqual([]);
  });
});
