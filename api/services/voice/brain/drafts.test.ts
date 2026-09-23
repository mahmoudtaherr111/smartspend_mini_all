import { describe, expect, it } from "vitest";
import { DraftBook, readReply } from "./drafts";

function book() {
  let now = 1_000_000;
  const drafts = new DraftBook(() => now);
  return { drafts, advance: (ms: number) => { now += ms; } };
}

const expenseDraft = { kind: "expenses" as const, title: "مصروفين", lines: [{ label: "مواصلات", amount: 60 }], total: 60, payload: {} };

describe("readReply", () => {
  it("hears a yes, a no and a change", () => {
    expect(readReply("آه سجلهم")).toBe("yes");
    expect(readReply("أيوه تمام")).toBe("yes");
    expect(readReply("لا استنى")).toBe("no_or_change");
    expect(readReply("سجل بس المواصلات ستين")).toBe("no_or_change");
    expect(readReply("هو إحنا فين من الشهر")).toBe("unclear");
    expect(readReply("")).toBe("unclear");
  });

  it("takes a yes that repeats the draft's own amount, and \"مش مشكلة\" as a yes", () => {
    expect(readReply("آه الستين دي سجلها", [60])).toBe("yes");
    expect(readReply("آه الستين دي سجلها", [50])).toBe("no_or_change");
    expect(readReply("مش مشكلة، سجل")).toBe("yes");
  });
});

describe("DraftBook.gate", () => {
  it("lets a yes said after the draft execute it", () => {
    const { drafts, advance } = book();
    const draft = drafts.add(expenseDraft);
    advance(2_000);
    drafts.heardUser("آه سجل");
    expect(drafts.gate(draft.id, false)).toMatchObject({ ok: true });
  });

  it("does not take a yes said before the draft existed", () => {
    const { drafts, advance } = book();
    drafts.heardUser("تمام");
    advance(3_000);
    const draft = drafts.add(expenseDraft);
    expect(drafts.gate(draft.id, false)).toEqual({ ok: false, reason: "no_yes" });
  });

  it("refuses a reply that changes a number or says no", () => {
    const { drafts, advance } = book();
    const draft = drafts.add(expenseDraft);
    advance(2_000);
    drafts.heardUser("آه بس خليها سبعين");
    expect(drafts.gate(draft.id, false)).toEqual({ ok: false, reason: "changed" });
  });

  it("only the latest pending draft, and not after it expires", () => {
    const { drafts, advance } = book();
    const first = drafts.add(expenseDraft);
    const second = drafts.add(expenseDraft);
    advance(1_000);
    drafts.heardUser("آه");
    expect(drafts.gate(first.id, false)).toEqual({ ok: false, reason: "not_pending" });
    expect(drafts.gate(second.id, false)).toMatchObject({ ok: true });
    advance(3 * 60_000);
    expect(drafts.gate(second.id, false)).toEqual({ ok: false, reason: "expired" });
  });

  it("takes a tap on the card without words, but never twice", () => {
    const { drafts } = book();
    const draft = drafts.add(expenseDraft);
    expect(drafts.gate(draft.id, true)).toMatchObject({ ok: true });
    drafts.settle(draft.id, "executed", { message: "اتسجل" });
    expect(drafts.gate(draft.id, true)).toEqual({ ok: false, reason: "not_pending" });
    expect(drafts.summary()).toEqual({ done: ["اتسجل"], notDone: [] });
  });
});
