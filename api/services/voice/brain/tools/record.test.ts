import { describe, expect, it, vi } from "vitest";
import { DraftBook } from "../drafts";
import { FactLedger } from "../facts";
import { confusableWith, confirmTool, changeDraftTool, recordDraftTool } from "./record";
import type { ParseOutcome, SaveExpenseItem, ToolContext, VoiceAppCalls } from "./types";

function context(parse: ParseOutcome, clock = { now: 1_000_000 }) {
  const saved: SaveExpenseItem[][] = [];
  const deleted: number[][] = [];
  const dismissed: number[] = [];
  const app: VoiceAppCalls = {
    parseExpense: vi.fn(async () => parse),
    saveExpenses: vi.fn(async (_identity, items: SaveExpenseItem[]) => {
      saved.push(items);
      return { ids: items.map((_, index) => 500 + index) };
    }),
    deleteExpenses: vi.fn(async (_identity, ids: number[]) => { deleted.push(ids); }),
    listBudgets: vi.fn(async () => []),
    dismissClarification: vi.fn(async (_identity, id: number) => { dismissed.push(id); }),
    waitingEntry: vi.fn(async (_identity, id: number) => (id === 44 ? { words: "150 يوم الخميس" } : null)),
    answerProfileQuestion: vi.fn(),
  };
  const drafts = new DraftBook(() => clock.now);
  const ctx: ToolContext = {
    identity: { callId: "vc_test0000000000", userId: 7, userType: "local", plan: "pro", role: "user" },
    ledger: new FactLedger(),
    drafts,
    app,
    signal: new AbortController().signal,
    now: () => new Date(clock.now),
    salaryDay: async () => 25,
    openClarifications: [],
  };
  return { ctx, app, saved, deleted, dismissed, clock };
}

const twoItems: ParseOutcome = {
  decision: "review",
  items: [
    { amount: 60, type: "expense", category: "مواصلات" },
    { amount: 70, type: "expense", category: "أكل وشرب", subCategory: "فطار" },
  ],
  classificationLogId: 91,
};

describe("confusableWith", () => {
  it("pairs the numbers that sound alike", () => {
    expect(confusableWith(15)).toBe(50);
    expect(confusableWith(50)).toBe(15);
    expect(confusableWith(15_000)).toBe(50_000);
    expect(confusableWith(55)).toBeNull();
    expect(confusableWith(120)).toBeNull();
  });
});

describe("record_draft", () => {
  it("drafts what the parser found, and says the amounts exactly", async () => {
    const { ctx } = context(twoItems);
    ctx.drafts.heardUser("دفعت ستين مواصلات وسبعين فطار");
    const result = await recordDraftTool.run({ words: "دفعت ستين مواصلات وسبعين فطار", items: [{ amount: 60 }, { amount: 70 }] }, ctx);
    expect(result.response).toMatchObject({
      ok: true,
      items: [{ what: "مواصلات", say: "ستين" }, { what: "فطار", say: "سبعين" }],
      total_say: "مية وتلاتين",
    });
    expect(result.card).toMatchObject({ kind: "draft", total: 130, status: "pending" });
    expect(ctx.ledger.allows(130, false)).toBe(true);
  });

  it("asks about an amount the model and the parser disagree on", async () => {
    const { ctx } = context({ ...twoItems, items: [{ amount: 15, type: "expense", category: "مواصلات" }] });
    const result = await recordDraftTool.run({ words: "دفعت خمستاشر مواصلات", items: [{ amount: 50 }] }, ctx);
    expect(result.response).toMatchObject({ ok: false, needs: "confirm_amounts", amounts: [{ amount: 15, say: "خمستاشر", or: "خمسين" }] });
    expect(ctx.drafts.latestPending()).toBeUndefined();
  });

  it("asks about an amount that was never heard from the user", async () => {
    const { ctx } = context({ ...twoItems, items: [{ amount: 500, type: "expense", category: "مواصلات" }] });
    ctx.drafts.heardUser("دفعت خمسين مواصلات");
    const result = await recordDraftTool.run({ words: "دفعت خمسمية مواصلات" }, ctx);
    expect(result.response).toMatchObject({ ok: false, needs: "confirm_amounts" });
  });

  it("passes the parser's question on, and closes it once the expense is recorded", async () => {
    const clarify = context({ decision: "clarify", items: [], clarificationQuestion: "مين أحمد؟", clarificationId: 33 });
    const asked = await recordDraftTool.run({ words: "اديت أحمد مية" }, clarify.ctx);
    expect(asked.response).toMatchObject({ ok: false, needs: "clarification", question: "مين أحمد؟" });
    expect(clarify.ctx.openClarifications).toEqual([33]);
  });
});

describe("confirm", () => {
  it("refuses without the user's own yes after the draft, then writes once it comes", async () => {
    const { ctx, saved, clock } = context(twoItems);
    const draft = await recordDraftTool.run({ words: "دفعت ستين مواصلات وسبعين فطار" }, ctx);
    const draftId = String(draft.response.draft_id);

    vi.useFakeTimers();
    const refused = confirmTool.run({ draft_id: draftId }, ctx);
    await vi.advanceTimersByTimeAsync(1_300);
    expect((await refused).response).toMatchObject({ ok: false, reason: "no_yes" });
    vi.useRealTimers();
    expect(saved).toEqual([]);

    clock.now += 2_000;
    ctx.drafts.heardUser("آه سجلهم");
    const done = await confirmTool.run({ draft_id: draftId }, ctx);
    expect(done.response).toMatchObject({ ok: true, done: "اتسجلت عمليتين بإجمالي مية وتلاتين" });
    expect(saved[0].map((item) => item.clientRequestId)).toEqual([
      `vc:vc_test0000000000:${draftId}:0`,
      `vc:vc_test0000000000:${draftId}:1`,
    ]);
    expect(saved[0][0]).toMatchObject({ rawText: "دفعت ستين مواصلات وسبعين فطار", classificationLogId: 91 });
    expect(done.card).toMatchObject({ status: "executed" });
  });

  it("finishes an entry left waiting with the user's answer, and closes it only once it is saved", async () => {
    const waitingFood: ParseOutcome = { decision: "review", items: [{ amount: 150, type: "expense", category: "أكل وشرب" }] };
    const { ctx, app, saved, dismissed, clock } = context(waitingFood);
    // The user answers without repeating the amount they typed back then; it is still theirs.
    ctx.drafts.heardUser("كانت أكل");
    const draft = await recordDraftTool.run({ words: "كانت أكل", clarification_id: 44, items: [{ amount: 150 }] }, ctx);
    expect(app.parseExpense).toHaveBeenCalledWith(ctx.identity, "150 يوم الخميس (كانت أكل)");
    expect(draft.response).toMatchObject({ ok: true, items: [{ say: "مية وخمسين" }] });
    expect(dismissed).toEqual([]);

    // The yes comes after the draft is read back, not within the same utterance.
    clock.now += 4_000;
    ctx.drafts.heardUser("آه");
    expect((await confirmTool.run({ draft_id: draft.response.draft_id }, ctx)).response).toMatchObject({ ok: true });
    expect(saved[0][0]).toMatchObject({ rawText: "150 يوم الخميس (كانت أكل)" });
    expect(dismissed).toEqual([44]);
  });

  it("refuses to finish an entry that is no longer waiting", async () => {
    const { ctx, app } = context(twoItems);
    expect((await recordDraftTool.run({ words: "كانت أكل", clarification_id: 45 }, ctx)).response)
      .toMatchObject({ ok: false, error: "not_waiting" });
    expect(app.parseExpense).not.toHaveBeenCalled();
  });

  it("refuses a yes that changes an amount", async () => {
    const { ctx, clock } = context(twoItems);
    const draft = await recordDraftTool.run({ words: "دفعت ستين مواصلات وسبعين فطار" }, ctx);
    clock.now += 1_000;
    ctx.drafts.heardUser("آه بس المواصلات خمسين");
    expect((await confirmTool.run({ draft_id: draft.response.draft_id }, ctx)).response).toMatchObject({ ok: false, reason: "changed" });
  });

  it("undoes what this call recorded, after its own confirmation", async () => {
    const { ctx, deleted, clock } = context(twoItems);
    const draft = await recordDraftTool.run({ words: "دفعت ستين مواصلات وسبعين فطار" }, ctx);
    clock.now += 1_000;
    ctx.drafts.heardUser("تمام");
    await confirmTool.run({ draft_id: draft.response.draft_id }, ctx);

    const undo = await changeDraftTool.run({ action: "undo_last" }, ctx);
    expect(undo.response).toMatchObject({ ok: true });
    clock.now += 1_000;
    ctx.drafts.heardUser("أيوه الغيها");
    const done = await confirmTool.run({ draft_id: undo.response.draft_id }, ctx);
    expect(done.response).toMatchObject({ ok: true, done: "اتلغى آخر تسجيل" });
    expect(deleted).toEqual([[500, 501]]);
  });

  it("offers no undo when nothing was recorded in this call", async () => {
    const { ctx } = context(twoItems);
    expect((await changeDraftTool.run({ action: "undo_last" }, ctx)).response).toMatchObject({ ok: false, error: "nothing_to_undo" });
    expect((await changeDraftTool.run({ action: "goal_stop" }, ctx)).response).toMatchObject({ ok: false, error: "not_by_voice" });
  });
});
