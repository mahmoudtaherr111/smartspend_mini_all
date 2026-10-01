import { describe, expect, it, vi } from "vitest";

vi.mock("./snapshot", () => ({ loadCallSnapshot: vi.fn(), memoryBrief: vi.fn() }));
vi.mock("./profile-questions", () => ({ markAsked: vi.fn(async () => undefined) }));

import { createCallBrain } from "./index";
import type { VoiceAppCalls, VoiceTool } from "./tools/types";

/** A tool that makes a pending draft of 1,500, as change_draft budget_update does. */
const makeDraft: VoiceTool = {
  declaration: { name: "make_draft", description: "test", parameters: { type: "object", properties: {} } },
  run: async (_args, ctx) => {
    const draft = ctx.drafts.add({ kind: "coach", title: "تعديل حد الميزانية", lines: [{ label: "أكل", amount: 1_500 }], payload: {} });
    return { response: { ok: true, draft_id: draft.id } };
  },
};

function brainWithDraft() {
  let at = Date.parse("2026-10-01T10:00:00Z");
  const brain = createCallBrain({ app: {} as VoiceAppCalls, tools: [makeDraft], now: () => new Date(at) });
  const identity = { userId: 1, userType: "local", plan: "pro", callId: "vc_test" } as never;
  const run = () =>
    brain.runTool({ id: "t1", name: "make_draft", args: {} } as never, { identity, signal: new AbortController().signal } as never);
  return { brain, run, advance: (ms: number) => (at += ms) };
}

describe("asking for a draft's read-back", () => {
  it("waits for the model to speak after the draft: the turn its tool call closed is not a missing preview", async () => {
    // The evaluation: Live closed the turn as change_draft went out, the note went at once, and interrupted the
    // correct read-back that followed, so the user heard the draft twice.
    const { brain, run, advance } = brainWithDraft();
    await run();
    advance(20);
    expect(brain.onTurnEnd?.()).toBeNull();
    advance(1_500);
    brain.onAssistantWords?.("تعديل حد الميزانية: ألف وخمسمية جنيه. أأكد؟");
    expect(brain.onTurnEnd?.()).toBeNull();
  });

  it("still asks once when the model spoke after the draft without reading its amount", async () => {
    const { brain, run, advance } = brainWithDraft();
    await run();
    advance(1_000);
    brain.onAssistantWords?.("لحظة واحدة وأظبطهالك.");
    expect(brain.onTurnEnd?.()).toMatchObject({ kind: "draft_preview_incomplete" });
    advance(1_000);
    brain.onAssistantWords?.("تمام.");
    expect(brain.onTurnEnd?.()).toBeNull();
  });
});
