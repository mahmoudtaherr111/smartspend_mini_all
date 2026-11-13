/**
 * A reading as the items the apps already read: every field they consume keeps its type, and
 * what the engine read travels beside it in `reading`.
 */
import { describe, expect, it } from "vitest";
import { storedShape } from "../../lib/understanding/bridge";
import type { UnderstoodEvent } from "../../lib/understanding/engine";
import { decisionOf, overallConfidenceOf, toParsedItem, toParsedItems } from "./items";

function event(over: Partial<UnderstoodEvent> = {}): UnderstoodEvent {
  const base = {
    quote: "دفعت 300 نت", amount: 300, kind: "spending", flow: "out", category: "bills", sub: "internet_landline", what: "نت",
    person: "", personRole: "none", personRelation: "", commitment: "", installments: 0, wallet: "", date: "", doubt: "none",
    flags: [], reasons: [], commitmentId: null, commitmentDueDay: null, walletId: null,
    ...over,
  } as Omit<UnderstoodEvent, "stored">;
  return { ...base, stored: over.stored ?? storedShape(base) } as UnderstoodEvent;
}

const ctx = { people: [{ name: "أحمد سامي", relation: "أخ" }] };

describe("toParsedItem", () => {
  it("maps a clean spending event to the item the apps read", () => {
    const item = toParsedItem(event(), ctx);
    expect(item).toMatchObject({
      amount: 300, category: "فواتير", subCategory: "إنترنت", type: "expense", description: "نت", confidence: 100,
      needsReview: false, parsedBy: "ai", currency: "EGP", clause: "دفعت 300 نت",
      reading: { category: "bills", sub: "internet_landline", kind: "spending", flow: "out", commitmentId: null, walletId: null, installments: 0, flags: [] },
    });
    expect(item.direction).toBeUndefined();
    expect(item.date).toBeUndefined();
    expect(item.reviewReasons).toBeUndefined();
    expect(item.person_mentioned).toBeUndefined();
  });

  it("marks a shown event for review with its reasons and confidence 60", () => {
    const item = toParsedItem(event({ flags: ["amount_derived"], reasons: ["amount_derived", "dated"] }), ctx);
    expect(item).toMatchObject({ confidence: 60, needsReview: true, reviewReasons: ["amount_derived", "dated"] });
    expect(item.reading?.flags).toEqual(["amount_derived"]);
  });

  it("sends a named day at noon UTC, and the quote when there is no label", () => {
    const item = toParsedItem(event({ date: "2026-11-09", what: "" }), ctx);
    expect(item.date).toBe("2026-11-09T12:00:00.000Z");
    expect(item.description).toBe("دفعت 300 نت");
  });

  it("carries a transfer's and a refund's direction", () => {
    const loan = toParsedItem(event({ kind: "loan", flow: "out", category: "debts", sub: "people" }), ctx);
    expect(loan).toMatchObject({ type: "transfer", direction: "outgoing", category: "تحويل", subCategory: "دين/سلفة" });
    const refund = toParsedItem(event({ kind: "refund", flow: "in", category: "shopping", sub: "clothes" }), ctx);
    expect(refund).toMatchObject({ type: "expense", direction: "incoming", category: "تسوق" });
  });

  it("names a known contact by their own name and relation, and an unknown one as said", () => {
    const known = toParsedItem(event({ person: "لأحمد", personRelation: "" }), ctx);
    expect(known).toMatchObject({ person_mentioned: "أحمد سامي", person_relationship: "أخ" });
    const stranger = toParsedItem(event({ person: "كريم", personRelation: "صاحبي" }), ctx);
    expect(stranger).toMatchObject({ person_mentioned: "كريم", person_relationship: "صاحبي" });
    const noRelation = toParsedItem(event({ person: "كريم" }), ctx);
    expect(noRelation.person_mentioned).toBe("كريم");
    expect(noRelation.person_relationship).toBeUndefined();
  });

  it("keeps a person within the save procedures' limits", () => {
    const item = toParsedItem(event({ person: "ا".repeat(80), personRelation: "ب".repeat(50) }), { people: [] });
    expect(item.person_mentioned).toHaveLength(60);
    expect(item.person_relationship).toHaveLength(40);
  });

  it("files work under the business, with the business's own category when one was named", () => {
    const item = toParsedItem(event({ category: "work", sub: "goods_materials", businessCategory: "خامات" }), { people: [], businessId: 9 });
    expect(item).toMatchObject({ businessId: 9, category: "عمل", subCategory: "خامات" });
    const personal = toParsedItem(event(), { people: [], businessId: 9 });
    expect(personal.businessId).toBeUndefined();
    const noBusiness = toParsedItem(event({ category: "work", sub: "goods_materials", businessCategory: "خامات" }), { people: [] });
    expect(noBusiness.businessId).toBeUndefined();
    expect(noBusiness.subCategory).toBe("عام");
  });

  it("resolves the commitment and wallet into the reading", () => {
    const item = toParsedItem(event({ commitment: "c1", commitmentId: 41, commitmentDueDay: "2026-11-15", installments: 2, wallet: "w1", walletId: 7 }), ctx);
    expect(item.reading).toMatchObject({ commitmentId: 41, commitmentDueDay: "2026-11-15", installments: 2, walletId: 7 });
  });
});

describe("toParsedItems", () => {
  it("leaves out events without an amount", () => {
    const items = toParsedItems({ events: [event(), event({ amount: 0, reasons: ["amount_missing"] })] }, ctx);
    expect(items).toHaveLength(1);
  });
});

describe("the decision", () => {
  it("is auto_save, review or clarify, and never a question in the sandbox", () => {
    expect(decisionOf("save")).toBe("auto_save");
    expect(decisionOf("show")).toBe("review");
    expect(decisionOf("ask")).toBe("clarify");
    expect(decisionOf("ask", true)).toBe("review");
    expect(decisionOf("show", true)).toBe("review");
  });

  it("reports 0 for a question and the weakest item otherwise", () => {
    const clean = toParsedItem(event(), ctx);
    const shown = toParsedItem(event({ reasons: ["dated"] }), ctx);
    expect(overallConfidenceOf("clarify", [clean])).toBe(0);
    expect(overallConfidenceOf("review", [])).toBe(0);
    expect(overallConfidenceOf("review", [clean, shown])).toBe(60);
    expect(overallConfidenceOf("auto_save", [clean])).toBe(100);
  });
});
