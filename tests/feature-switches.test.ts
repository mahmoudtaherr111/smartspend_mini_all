import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ usd: 0, reads: 0, fail: false }));

vi.mock("../api/lib/ai-ledger", () => ({
  ledgerTotalCostUsdSince: async () => {
    state.reads += 1;
    if (state.fail) throw new Error("no database");
    return state.usd;
  },
}));
vi.mock("../api/lib/settings-cache", () => ({ getSystemSettings: async () => ({}) }));

import {
  aiSwitchesOff,
  assertAiSwitchOn,
  assertDailyAiCost,
  forgetDailyCostReading,
} from "../api/lib/feature-switches";

describe("feature switches", () => {
  beforeEach(() => {
    state.usd = 0;
    state.reads = 0;
    state.fail = false;
    forgetDailyCostReading();
  });

  it("stops only the switch an admin turned off", async () => {
    const settings = { ai_off_speech: "true", ai_off_chat: "false" };
    await expect(assertAiSwitchOn("speech", settings)).rejects.toThrow("مؤقتًا");
    await expect(assertAiSwitchOn("chat", settings)).resolves.toBeUndefined();
    expect(aiSwitchesOff(settings)).toEqual(["speech"]);
  });

  it("stops AI at the day's cost cap", async () => {
    state.usd = 50;
    await expect(assertDailyAiCost({ ai_daily_cost_cap_usd: "50" })).rejects.toThrow("بكره");
  });

  it("holds the default cap when an admin never saved one", async () => {
    state.usd = 60;
    await expect(assertDailyAiCost({})).rejects.toThrow("بكره");
  });

  it("lets calls through under the cap, and reads the cost once a minute", async () => {
    state.usd = 10;
    await assertDailyAiCost({ ai_daily_cost_cap_usd: "50" });
    await assertDailyAiCost({ ai_daily_cost_cap_usd: "50" });
    expect(state.reads).toBe(1);
  });

  it("has no ceiling at zero, and never stops the app when the cost cannot be read", async () => {
    await assertDailyAiCost({ ai_daily_cost_cap_usd: "0" });
    expect(state.reads).toBe(0);
    state.fail = true;
    await expect(assertDailyAiCost({ ai_daily_cost_cap_usd: "50" })).resolves.toBeUndefined();
  });
});
