import { describe, it, expect } from "vitest";
import { captureDraftSchema } from "../../contracts/financial-capture";
import {
  applyCaptureAnswer,
  assertCaptureReady,
  captureQuestions,
} from "./financial-capture-state";
import {
  notificationToDraft,
  financialMoneyMentions,
  notificationInputSchema,
} from "./notification-evidence";
import { paymentPurpose } from "./payment-purpose";
import {
  receiptEvidenceToDraft,
  receiptEvidenceSchema,
} from "./receipt-evidence";

const date = "2026-09-06T12:00:00+03:00";
const base = () =>
  captureDraftSchema.parse({
    schemaVersion: 1,
    channel: "text",
    sourceText: "دفعت50أكل",
    receivedAt: date,
    issues: [],
    ignoredReason: null,
    businessId: null,
    events: [
      {
        id: "first",
        description: "أكل",
        amount: 50,
        currency: "EGP",
        occurredAt: date,
        kind: "expense",
        category: "أكل وشرب",
        subCategory: "عام",
        merchant: null,
        status: "realized",
        evidence: "دفعت50أكل",
        issues: [],
      },
    ],
  });
const answer = (eventId: string, field: string, value: unknown) => ({
  captureId: "240710cd-a423-45e6-8c06-fc9e6f33b41b",
  version: 1,
  eventId,
  field,
  value,
});
describe("financial capture questions and invariants", () => {
  it("accepts a fully specified record without inventing fields", () =>
    expect(() => assertCaptureReady(base())).not.toThrow());
  it("changing one event cannot repair or overwrite a neighbour", () => {
    const draft = base();
    draft.events.push({ ...draft.events[0], id: "second", amount: null });
    const updated = applyCaptureAnswer(draft, {
      ...answer("first", "merchant", "مطعم"),
      field: "merchant",
      value: "مطعم",
    });
    expect(updated.events[1]).toEqual(draft.events[1]);
    expect(
      captureQuestions(updated).some(
        (q) => q.eventId === "second" && q.field === "amount",
      ),
    ).toBe(true);
    expect(() => assertCaptureReady(updated)).toThrow();
    expect(draft.events[0].merchant).toBeNull();
  });
  it.each(["USD", "EUR", "SAR"])(
    "does not relabel %s as pounds on confirmation",
    (currency) => {
      const d = base();
      d.events[0].currency = currency;
      expect(() => assertCaptureReady(d)).toThrow();
    },
  );
  it.each(["refund", "debt", "unknown"] as const)(
    "does not save unsupported/unknown %s as expense",
    (kind) => {
      const d = base();
      d.events[0].kind = kind;
      expect(() => assertCaptureReady(d)).toThrow();
    },
  );
  it.each(["pending", "rejected", "unknown"] as const)(
    "does not save status %s",
    (status) => {
      const d = base();
      d.events[0].status = status;
      expect(() => assertCaptureReady(d)).toThrow();
    },
  );
  it("answering amount cannot clear a crop blocker", () => {
    const d = base();
    d.issues = ["source_truncated"];
    const updated = applyCaptureAnswer(d, {
      ...answer("first", "amount", 100),
      field: "amount",
      value: 100,
    });
    expect(() => assertCaptureReady(updated)).toThrow();
  });
  it("rejects a missing event ID", () =>
    expect(() =>
      applyCaptureAnswer(base(), {
        ...answer("other", "amount", 100),
        field: "amount",
        value: 100,
      }),
    ).toThrow());
  it("rejects negative/infinite/oversize money and strings instead of money", () => {
    for (const value of [-1, Infinity, 1e12, "50"]) {
      expect(() =>
        applyCaptureAnswer(base(), {
          ...answer("first", "amount", value),
          field: "amount",
          value,
        }),
      ).toThrow();
    }
  });
  it("does not round fractions into a different saved amount", () => {
    const d = base();
    d.events[0].amount = 50.001;
    expect(() => assertCaptureReady(d)).toThrow();
  });
  it("a changed kind clears the old purpose", () => {
    const r = applyCaptureAnswer(base(), {
      ...answer("first", "kind", "income"),
      field: "kind",
      value: "income",
    });
    expect(r.events[0].category).toBeNull();
  });
  it("duplicate IDs are rejected even for equal amounts", () => {
    const d = base();
    d.events.push({ ...d.events[0] });
    expect(() => assertCaptureReady(d)).toThrow();
  });
  it("distinct events of equal amounts survive", () => {
    const d = base();
    d.events.push({ ...d.events[0], id: "second" });
    expect(() => assertCaptureReady(d)).not.toThrow();
  });
  it("a source-declined operation cannot be confirmed by a status patch", () => {
    const d = base();
    d.events[0].status = "rejected";
    expect(() =>
      applyCaptureAnswer(d, {
        ...answer("first", "status", "realized"),
        field: "status",
        value: "realized",
      }),
    ).toThrow();
  });
});
describe("payment evidence distinct from balances and channels", () => {
  it.each([
    "Your OTP is 887766 for payment EGP 450",
    "رمز التحقق ١٢٣٤٥٦ لشراء500جنيه",
  ])("drops secrets before persistence", (message) => {
    const d = notificationToDraft({ message });
    expect(d.ignoredReason).toBe("sensitive_authentication");
    expect(d.sourceText).toBe("");
    expect(d.events).toEqual([]);
  });
  it("separates amount, fee, balance and phone/reference digits", () => {
    expect(
      financialMoneyMentions(
        "تم تحويل750جنيه؛ رسوم العملية 1جنيه؛ الرصيد المتاح249جنيه؛ اتصل16607",
      ).map((m) => [m.amount, m.role]),
    ).toEqual([
      [750, "amount"],
      [1, "fee"],
      [249, "balance"],
    ]);
  });
  it.each(["٠١٢٣٤٥٦٧٨٩", "۰۱۲۳۴۵۶۷۸۹"])(
    "normalizes digits without changing monetary roles %s",
    (digits) => {
      const msg = "Paid EGP 125.50 at SHOP; balance EGP 850.25".replace(
        /\d/g,
        (d) => digits[Number(d)],
      );
      expect(notificationToDraft({ message: msg }).events[0].amount).toBe(
        125.5,
      );
    },
  );
  it("credit-card purchase is not earned income", () =>
    expect(
      notificationToDraft({
        message:
          "Your credit card has a successful transaction of EGP 10 at NETFLIX",
      }).events[0].kind,
    ).toBe("expense"));
  it("generic account credit asks about financial meaning", () =>
    expect(
      notificationToDraft({ message: "Account credited EGP 700" }).events[0]
        .kind,
    ).toBe("unknown"));
  it("informational may/will in support instructions do not make a completed payment pending", () => {
    for (const suffix of [
      "You may call 16607 for details",
      "More information will be sent shortly",
    ]) {
      expect(
        notificationToDraft({ message: `Paid EGP 40 at SHOP; ${suffix}` })
          .events[0].status,
      ).toBe("realized");
    }
  });
  it.each([
    "Refund EGP 700 will be credited within 7 days",
    "سيتم رد 700 جنيه",
    "Your payment of EGP 40 is due tomorrow",
  ])("does not record a future movement as completed: %s", (message) => {
    const d = notificationToDraft({ message });
    expect(d.events[0].status).toBe("pending");
    expect(() => assertCaptureReady(d)).toThrow();
  });
  it("keeps a posted refund separate from the original declined payment", () =>
    expect(
      notificationToDraft({
        message:
          "Refund EGP 700 credited for your previously declined transaction",
      }).events[0],
    ).toMatchObject({ kind: "refund", status: "realized" }));
  it("recognizes a named service but never invents a renewal", () => {
    expect(paymentPurpose("NETFLIX.COM", "Payment EGP 100")).toMatchObject({
      category: "اشتراكات",
      billingContext: "unspecified",
    });
    expect(
      paymentPurpose("ANTHROPIC*CLAUDE", "recurring payment"),
    ).toMatchObject({ category: "اشتراكات", billingContext: "recurring" });
  });
  it.each(["AMAZON.EG", "FAWRY", "APPLE.COM/BILL", "NETFLIX STORE CAIRO"])(
    "does not invent a SKU for %s",
    (merchant) =>
      expect(paymentPurpose(merchant, "Payment").category).toBeNull(),
  );
  it("does not default a partial bank date to receipt day", () =>
    expect(
      notificationToDraft({
        message: "Purchase EGP 10 at SHOP on 03/09",
        timestamp: date,
      }).events[0].occurredAt,
    ).toBeNull());
  it("rejects malformed fields before normalization", () => {
    expect(
      notificationInputSchema.safeParse({ message: "hello", sender: {} })
        .success,
    ).toBe(false);
    expect(
      notificationInputSchema.safeParse({ message: "x".repeat(12001) }).success,
    ).toBe(false);
  });
});
describe("documents retain checkout structure", () => {
  const document = () => ({
    documentKind: "receipt" as const,
    description: "سوبرماركت",
    merchant: null,
    amount: 100,
    currency: "EGP",
    occurredAt: date,
    status: "realized" as const,
    kind: "expense" as const,
    evidence: "total100 tendered200 change100",
    subtotal: 100,
    tax: 0,
    discount: 0,
    shipping: 0,
    itemsComplete: true,
    items: [
      { description: "a", lineTotal: 60 },
      { description: "b", lineTotal: 40 },
    ],
  });
  it("checkout total and its rows are one payment", () => {
    const d = receiptEvidenceToDraft({
      readability: "readable",
      sourceText: "x",
      documents: [document()],
    });
    expect(d.events).toHaveLength(1);
    expect(d.events[0].amount).toBe(100);
  });
  it("separate documents stay separate", () =>
    expect(
      receiptEvidenceToDraft({
        readability: "readable",
        sourceText: "x",
        documents: [
          document(),
          { ...document(), amount: 200, subtotal: 200, itemsComplete: false },
        ],
      }).events,
    ).toHaveLength(2));
  it("sum conflicts survive category changes", () => {
    const d = receiptEvidenceToDraft({
      readability: "readable",
      sourceText: "x",
      documents: [{ ...document(), amount: 120 }],
    });
    expect(d.events[0].issues).toContain("document_total_conflict");
  });
  it("invoice is not a paid receipt even if model says realized", () =>
    expect(
      receiptEvidenceToDraft({
        readability: "readable",
        sourceText: "x",
        documents: [{ ...document(), documentKind: "invoice" }],
      }).events[0].status,
    ).toBe("unknown"));
  it("schema rejects a malformed model response", () =>
    expect(receiptEvidenceSchema.safeParse({ amount: 50 }).success).toBe(
      false,
    ));
});
