import { describe, expect, it } from "vitest";
import { DraftBook, readReply } from "./drafts";

function book() {
  let now = 1_000_000;
  const drafts = new DraftBook(() => now);
  return { drafts, advance: (ms: number) => { now += ms; } };
}

const expenseDraft = { kind: "expenses" as const, title: "مصروفين", lines: [{ label: "مواصلات", amount: 60 }], total: 60, payload: {} };

describe("voice consent boundaries", () => {
  it("waits for the whole spoken answer and a trailing correction before allowing a write", () => {
    const { drafts, advance } = book();
    const draft = drafts.add(expenseDraft);
    drafts.heardAssistant("هسجل ستين جنيه مواصلات، أسجلها؟");
    advance(1000);
    drafts.beginUserRequest(true);
    drafts.heardUser("آه");
    expect(drafts.gate(draft.id, false)).toMatchObject({
      ok: false,
      reason: "no_yes",
    });
    drafts.endUserSpeech();
    advance(300);
    drafts.heardUser(" بس لا متسجلش");
    advance(600);
    expect(drafts.gate(draft.id, false)).toMatchObject({
      ok: false,
      reason: "changed",
    });
  });

  it("a filler or wrong read-back never presents the financial draft", () => {
    const { drafts, advance } = book();
    const draft = drafts.add(expenseDraft);
    drafts.heardAssistant("خليني أراجع");
    advance(1000);
    drafts.heardUser("آه");
    expect(drafts.gate(draft.id, false)).toMatchObject({
      ok: false,
      reason: "not_presented",
    });
    drafts.heardAssistant(" هسجل سبعين جنيه، أسجلها؟");
    expect(draft.presentedAt).toBeUndefined();
    drafts.heardAssistant(" قصدي ستين جنيه، أسجلها؟");
    expect(draft.presentedAt).toBeDefined();
  });
});

describe("readReply", () => {
  it("hears a yes, a no and a change", () => {
    expect(readReply("آه سجلهم")).toBe("yes");
    expect(readReply("أيوه تمام")).toBe("yes");
    expect(readReply("لا استنى")).toBe("no_or_change");
    expect(readReply("سجل بس المواصلات ستين")).toBe("no_or_change");
    expect(readReply("هو إحنا فين من الشهر")).toBe("unclear");
    expect(readReply("")).toBe("unclear");
  });

  it("never takes a yes that comes with a no, a reservation, a condition or someone else's words", () => {
    // Each of these read as a yes before: a "no" wrapped around the verb, "but", "if", only understanding.
    expect(readReply("تمام بس ماتسجلش")).toBe("no_or_change");
    expect(readReply("تمام أنا بفهم بس")).toBe("unclear");
    expect(readReply("لو وافقت سجلها")).toBe("unclear");
    expect(readReply("أيوه متسجلهاش دلوقتي")).toBe("no_or_change");
    expect(readReply("هو قال آه سجلها")).toBe("unclear");
    expect(readReply("تمام، طب وإيه كمان؟")).toBe("unclear");
    expect(readReply("ماشي بعدين")).toBe("unclear");
    expect(readReply("آه خليها سبعين")).toBe("no_or_change");
  });

  it("reads 'drop it' by what the draft does: a no to a new record, a yes to an undo", () => {
    expect(readReply("الغيها", [], "expenses")).toBe("no_or_change");
    expect(readReply("آه امسحها", [], "action")).toBe("no_or_change");
    expect(readReply("آه الغيها", [], "undo")).toBe("yes");
  });

  it("folds spellings and takes a yes with a few words beside it, not a sentence about something else", () => {
    expect(readReply("أيوة يا سمارت سجلها لو سمحت")).toBe("yes");
    expect(readReply("آه سجل الأكل والمواصلات")).toBe("yes");
    expect(readReply("تمام الحمد لله النهارده كان يوم طويل في الشغل")).toBe("unclear");
  });

  it('takes a yes that repeats the draft\'s own amount, and "مش مشكلة" as a yes', () => {
    expect(readReply("آه الستين دي سجلها", [60])).toBe("yes");
    expect(readReply("آه الستين دي سجلها", [50])).toBe("no_or_change");
    expect(readReply("مش مشكلة، سجل")).toBe("yes");
  });
});

describe("DraftBook.gate", () => {
  it("lets a yes said after the draft was read out execute it", () => {
    const { drafts, advance } = book();
    const draft = drafts.add(expenseDraft);
    advance(500);
    drafts.heardAssistant();
    advance(2_000);
    drafts.heardUser("آه سجل");
    expect(drafts.gate(draft.id, false)).toMatchObject({ ok: true });
  });

  it("does not take a yes said before the draft existed, or before it was read out", () => {
    const { drafts, advance } = book();
    drafts.heardUser("تمام");
    advance(3_000);
    const draft = drafts.add(expenseDraft);
    advance(2_000);
    drafts.heardUser("آه");
    // The assistant has not presented it yet: the "آه" answered something else.
    expect(drafts.gate(draft.id, false)).toEqual({ ok: false, reason: "not_presented" });
    drafts.heardAssistant();
    expect(drafts.gate(draft.id, false)).toEqual({ ok: false, reason: "no_yes" });
  });

  it("refuses a reply that changes a number or says no", () => {
    const { drafts, advance } = book();
    const draft = drafts.add(expenseDraft);
    drafts.heardAssistant();
    advance(2_000);
    drafts.heardUser("آه بس خليها سبعين");
    expect(drafts.gate(draft.id, false)).toEqual({ ok: false, reason: "changed" });
  });

  it("only the latest pending draft, and not after it expires", () => {
    const { drafts, advance } = book();
    const first = drafts.add(expenseDraft);
    const second = drafts.add(expenseDraft);
    drafts.heardAssistant();
    advance(1_000);
    drafts.heardUser("آه");
    expect(drafts.gate(first.id, false)).toEqual({ ok: false, reason: "not_pending" });
    expect(drafts.gate(second.id, false)).toMatchObject({ ok: true });
    const third = drafts.add(expenseDraft);
    advance(3 * 60_000);
    expect(drafts.gate(third.id, true)).toEqual({ ok: false, reason: "expired" });
  });

  it("runs a draft once when a tap and a spoken yes arrive together", () => {
    const { drafts, advance } = book();
    const draft = drafts.add(expenseDraft);
    drafts.heardAssistant();
    advance(1_000);
    drafts.heardUser("آه سجلها");
    // Both pass the checks; the first claims the draft before any write is awaited.
    expect(drafts.gate(draft.id, true)).toMatchObject({ ok: true });
    expect(drafts.gate(draft.id, false)).toEqual({ ok: false, reason: "not_pending" });
    expect(drafts.get(draft.id)?.status).toBe("executing");
    expect(drafts.summary().notDone).toEqual(["مصروفين (لسه بنتأكد إنه اتنفذ)"]);
  });

  it("gives a claimed draft back when its write never started", () => {
    const { drafts } = book();
    const draft = drafts.add(expenseDraft);
    expect(drafts.gate(draft.id, true)).toMatchObject({ ok: true });
    drafts.release(draft.id);
    expect(drafts.get(draft.id)?.status).toBe("pending");
    expect(drafts.gate(draft.id, true)).toMatchObject({ ok: true });
  });

  it("takes a tap on the card without words, but never twice", () => {
    const { drafts } = book();
    const draft = drafts.add(expenseDraft);
    expect(drafts.gate(draft.id, true)).toMatchObject({ ok: true });
    drafts.settle(draft.id, "executed", { message: "اتسجل" });
    expect(drafts.gate(draft.id, true)).toEqual({ ok: false, reason: "not_pending" });
    expect(drafts.summary()).toEqual({ done: ["اتسجل"], notDone: [] });
  });

  it("knows, right after a write, what was written and which corrected amounts were replaced", () => {
    const { drafts, advance } = book();
    const fifteen = drafts.add({ ...expenseDraft, lines: [{ label: "عيش", amount: 15 }], total: 15 });
    const fifty = drafts.add({ ...expenseDraft, lines: [{ label: "عيش", amount: 50 }], total: 50 });
    expect(drafts.get(fifteen.id)?.status).toBe("cancelled");
    drafts.gate(fifty.id, true);
    drafts.settle(fifty.id, "executed", { resultIds: [1] });
    expect(drafts.justWritten()).toEqual({ written: [50, 50], replaced: [15, 15] });
    advance(1_000);
    drafts.heardUser("طب تمام");
    // The user spoke: the moment of saying what was written has passed.
    expect(drafts.justWritten()).toBeNull();
  });
});
