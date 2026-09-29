import { describe, expect, it, vi } from "vitest";

// The action runtime is the durable side of a voice action; here it counts what the call asks of it.
const runtime = vi.hoisted(() => ({ created: 0, confirmed: [] as number[], cancelled: [] as number[] }));
vi.mock("../../../action-runtime", () => ({
  actionSummary: () => "ميزانية أكل بألفين",
  goalSummary: () => "هدف",
  createGoalPayloadFromMessage: () => null,
  createPhase8PayloadFromMessage: () => null,
  validateGoalCreate: async (_ctx: unknown, payload: unknown) => payload,
  validateRuntimeAction: async (_ctx: unknown, _name: unknown, payload: unknown) => payload,
  createPendingGoalAction: async () => ({ action: { id: String(70 + ++runtime.created) } }),
  createPendingRuntimeAction: async () => ({ action: { id: String(70 + ++runtime.created) } }),
  confirmAction: async (_ctx: unknown, id: number, _proof: unknown, options: { suggestFollowUp?: boolean }) => {
    runtime.confirmed.push(id);
    expect(options).toEqual({ suggestFollowUp: false });
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { message: "اتعملت الميزانية" };
  },
  cancelAction: async (_ctx: unknown, id: number) => { runtime.cancelled.push(id); },
}));

import { DraftBook } from "../drafts";
import { FactLedger } from "../facts";
import { cancelTool, changeDraftTool, confirmTool } from "./record";
import type { ToolContext, VoiceAppCalls } from "./types";

function context(clock = { now: 1_000_000 }): ToolContext {
  return {
    identity: { callId: "vc_test0000000000", userId: 7, userType: "local", plan: "pro", role: "user" },
    ledger: new FactLedger(),
    drafts: new DraftBook(() => clock.now),
    app: {} as VoiceAppCalls,
    signal: new AbortController().signal,
    now: () => new Date(clock.now),
    salaryDay: async () => 25,
    openClarifications: [],
  };
}

describe("an action drafted in a call", () => {
  it("is made durable once, with the draft, and runs once however confirmation arrives", async () => {
    runtime.created = 0;
    runtime.confirmed = [];
    const clock = { now: 1_000_000 };
    const ctx = context(clock);
    const drafted = await changeDraftTool.run({ action: "budget_create", fields: { category: "أكل", monthlyLimit: 2000 } }, ctx);
    expect(drafted.response).toMatchObject({ ok: true });
    expect(runtime.created).toBe(1);

    ctx.drafts.heardAssistant();
    clock.now += 1_000;
    ctx.drafts.heardUser("آه اعملها");
    const draftId = String(drafted.response.draft_id);
    // Before, each confirmation made a new pending action and confirmed it, so this ran twice.
    const results = await Promise.all([
      confirmTool.run({ draft_id: draftId }, ctx),
      confirmTool.run({ draft_id: draftId }, ctx),
    ]);
    expect(results.map((result) => result.response.ok)).toEqual([true, false]);
    expect(runtime.created).toBe(1);
    expect(runtime.confirmed).toEqual([71]);
  });

  it("drops its pending action when the user cancels it", async () => {
    runtime.created = 0;
    runtime.cancelled = [];
    const ctx = context();
    const drafted = await changeDraftTool.run({ action: "budget_create", fields: { category: "أكل", monthlyLimit: 2000 } }, ctx);
    await cancelTool.run({ draft_id: drafted.response.draft_id }, ctx);
    expect(runtime.cancelled).toEqual([71]);
  });
});
