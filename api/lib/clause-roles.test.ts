import { describe, expect, it } from "vitest";
import { readClauseRoles, refineDirectionByObject } from "./clause-roles";
import { detectIntent } from "./intent-detector";
import { collectClues, weighClues } from "./evidence-weighing";
import { readsAsReversalRefund, saysMoneyCameBack } from "./refund-context";

const direction = (text: string) => refineDirectionByObject(detectIntent(text), text).intent;

describe("what an acquiring verb took decides the direction", () => {
  it("a ride or a service taken is spending", () => {
    expect(direction("خدت ميكروباص من الموقف")).toBe("expense");
    expect(direction("خدت من البيت تاكسي للنادي")).toBe("expense");
  });

  it("money taken is income", () => {
    expect(direction("خدت من ابويا")).toBe("income");
    expect(direction("جالي تحويل من خالي")).toBe("income");
    expect(direction("خدت من الشغل مكافاه")).toBe("income");
  });
});

describe("words in a scene role do not vote on the category", () => {
  it("keeps the place passed through silent when a purchase follows", () => {
    expect(readClauseRoles("وانا راجع من الشغل جبت فاكهه").silent.has("الشغل")).toBe(true);
    expect(readClauseRoles("اتعشيت مع صحابي").silent.has("صحابي")).toBe(true);
    // Nothing bought after it: the place is what was paid for.
    expect(readClauseRoles("رحت المستشفي").silent.size).toBe(0);
  });

  it("files the purchase, not the place", () => {
    const weighing = weighClues(collectClues("وانا راجع من الشغل جبت فاكهه"),
      { category: "عمل", subCategory: "عام", matchKind: "dict_unigram" });
    expect(weighing.override).toMatchObject({ category: "أكل وشرب", reason: "purpose_over_scene" });
  });

  it("reads a thing bought for someone's occasion as a gift", () => {
    expect(readClauseRoles("جبت شوكولاته لعيد ميلاد مراتي").occasion).toBe("عيد ميلاد");
    const weighing = weighClues(collectClues("جبت شوكولاته لعيد ميلاد مراتي"),
      { category: "أكل وشرب", subCategory: "سناكس", matchKind: "dict_unigram" });
    expect(weighing.override).toMatchObject({ category: "هدايا وصدقات", subCategory: "عيد ميلاد" });
  });

  it("reads the kind of shop", () => {
    expect(readClauseRoles("صرفت في محل الموبايلات").venue?.category).toBe("تسوق");
  });
});

describe("money back from an undone purchase", () => {
  it("is a refund when the money came back", () => {
    expect(readsAsReversalRefund("الاوردر اتلغي ورجعولي")).toBe(true);
    expect(saysMoneyCameBack("كنسلت الحجز واستردت")).toBe(true);
  });

  it("is only a cancellation when the order itself was taken back", () => {
    expect(saysMoneyCameBack("استرجعت الاوردر")).toBe(false);
    expect(readsAsReversalRefund("مروان رجعلي فلوسي")).toBe(false);
  });
});
