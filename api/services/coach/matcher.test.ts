import { describe, expect, it } from "vitest";
import { decideMatch, learnedPhrase, matchTokens, type MatchCommitment, type MatchPayment } from "./matcher";

const payment = (over: Partial<MatchPayment>): MatchPayment => ({ id: 1, amount: 5000, text: "", contactId: null, day: "2026-11-02", ...over });
const school = (over: Partial<MatchCommitment> = {}): MatchCommitment => ({
  id: 10, title: "مدرسة محمد", kind: "school", contactId: null, beneficiaryName: "محمد", provider: null, hints: [],
  open: [{ dueDay: "2026-11-01", effectiveDay: "2026-11-01", remaining: 5000 }], ...over,
});
const fridge: MatchCommitment = {
  id: 20, title: "قسط التلاجة", kind: "installment", contactId: null, provider: "فاليو", hints: [],
  open: [
    { dueDay: "2026-11-05", effectiveDay: "2026-11-05", remaining: 1500 },
    { dueDay: "2026-12-05", effectiveDay: "2026-12-05", remaining: 1500 },
  ],
};

describe("decideMatch", () => {
  it("links on its own when one commitment is named and the amount is exactly what is due", () => {
    const decision = decideMatch(payment({ text: "دفعت 5000 جنيه مصاريف مدرسة محمد ابني" }), [school(), fridge]);
    expect(decision).toEqual({ status: "linked", cashflowId: 10, allocations: [{ cashflowId: 10, dueDay: "2026-11-01", amount: 5000 }] });
  });

  it("asks when the amount is not what is due, even with the name", () => {
    const decision = decideMatch(payment({ text: "دفعت قسط مدرسة محمد 3000", amount: 3000 }), [school()]);
    expect(decision).toEqual({ status: "ask", candidates: [{ cashflowId: 10, dueDay: "2026-11-01", amount: 5000 }] });
  });

  it("asks which child when two schools are possible", () => {
    const malak = school({ id: 11, title: "مدرسة ملك", beneficiaryName: "ملك" });
    const decision = decideMatch(payment({ text: "دفعت قسط المدرسة 5000" }), [school(), malak]);
    expect(decision.status).toBe("ask");
    if (decision.status === "ask") expect(decision.candidates.map((c) => c.cashflowId).sort()).toEqual([10, 11]);
  });

  it("stays silent when nothing points at a commitment", () => {
    expect(decideMatch(payment({ text: "قهوة", amount: 50 }), [school(), fridge])).toEqual({ status: "none" });
    expect(decideMatch(payment({ text: "سوبر ماركت", amount: 5000 }), [school()])).toEqual({ status: "none" });
  });

  it("pays two installments when the sentence says two and the amount is both", () => {
    const decision = decideMatch(payment({ text: "دفعت قسطين التلاجة 3000", amount: 3000, day: "2026-11-04" }), [fridge]);
    expect(decision).toEqual({
      status: "linked",
      cashflowId: 20,
      allocations: [
        { cashflowId: 20, dueDay: "2026-11-05", amount: 1500 },
        { cashflowId: 20, dueDay: "2026-12-05", amount: 1500 },
      ],
    });
  });

  it("links a debt repayment by the person alone, and a confirmed phrase or sender as strongly as the name", () => {
    const farida: MatchCommitment = {
      id: 30, title: "سلفة فريدة", kind: "debt", contactId: 7, hints: [],
      open: [{ dueDay: "2026-10-01", effectiveDay: "2026-10-01", remaining: 500, undated: true }],
    };
    expect(decideMatch(payment({ text: "رجعتلي", amount: 500, contactId: 7 }), [farida]).status).toBe("linked");
    const loan: MatchCommitment = {
      id: 40, title: "قرض العربية", kind: "loan", contactId: null, hints: [{ kind: "sender", value: "cib", weight: 2 }],
      open: [{ dueDay: "2026-11-01", effectiveDay: "2026-11-01", remaining: 3200 }],
    };
    expect(decideMatch(payment({ text: "خصم من الحساب", amount: 3200, sender: "cib" }), [loan]).status).toBe("linked");
    const learned = { ...fridge, hints: [{ kind: "phrase", value: "فاليو", weight: 1 }] };
    expect(decideMatch(payment({ text: "دفعت فاليو 1500", amount: 1500, day: "2026-11-04" }), [learned]).status).toBe("linked");
    // An undone phrase no longer counts.
    const undone = { ...fridge, title: "قسط", hints: [{ kind: "phrase", value: "فاليو", weight: 0 }], provider: null };
    expect(decideMatch(payment({ text: "دفعت فاليو 1500", amount: 1500, day: "2026-11-04" }), [undone]).status).toBe("none");
  });

  it("does not link a payment more than ten days before its due date", () => {
    const decision = decideMatch(payment({ text: "قسط التلاجة", amount: 1500, day: "2026-10-20" }), [fridge]);
    expect(decision.status).toBe("none");
  });

  it("does not link on its own when another commitment shows a sign of the payment too", () => {
    // Two valU plans: the provider points at both, so the user picks.
    const tv = { ...fridge, id: 21, title: "قسط التليفزيون", open: [{ dueDay: "2026-11-05", effectiveDay: "2026-11-05", remaining: 1500 }] };
    const decision = decideMatch(payment({ text: "دفعت فاليو 1500", amount: 1500, day: "2026-11-04" }), [fridge, tv]);
    expect(decision.status).toBe("ask");
    // Naming one of them is enough: the other shows no sign.
    expect(decideMatch(payment({ text: "دفعت قسط التلاجة 1500", amount: 1500, day: "2026-11-04" }), [fridge, tv]).status).toBe("linked");
  });
});

describe("tokens", () => {
  it("drops paying verbs, money words and the article, and keeps the names", () => {
    expect(matchTokens("دفعت ٥٠٠٠ جنيه للمدرسة بتاعة محمد")).toEqual(["5000", "مدرسه", "محمد"]);
    expect(matchTokens("فاليو بالتقسيط")).toEqual(["فاليو", "تقسيط"]);
    expect(learnedPhrase("دفعت قسط مدرسة محمد 5000 جنيه")).toBe("قسط محمد مدرسه");
  });
});
