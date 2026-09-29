import { describe, expect, it } from "vitest";
import { DoneClaimCheck, FailureClaimCheck, WrittenAmountCheck } from "./claims";
import { extractSpokenNumbers } from "./validator";

describe("DoneClaimCheck", () => {
  it("catches a waiting draft called recorded, once a reply", () => {
    const check = new DoneClaimCheck();
    expect(check.add("سجلت خمسين جنيه ", true)).toBe(true);
    expect(check.add("مواصلات، أأكد؟", true)).toBe(false);
    check.endTurn();
    expect(check.add("تمام اتسجلت.", true)).toBe(true);
  });

  it("finds the claim across pieces of the transcription and through diacritics", () => {
    const check = new DoneClaimCheck();
    expect(check.add("خلاص ", true)).toBe(false);
    expect(check.add("سَجّلت الأكل", true)).toBe(true);
  });

});

describe("FailureClaimCheck", () => {
  it("catches a failure claimed when no tool failed, retries twice, then only records", () => {
    const check = new FailureClaimCheck();
    check.newRequest();
    expect(check.add("خليني أشوف حساباتك.")).toBeNull();
    expect(check.add("بعتذر، حصل عطل في النظام")).toEqual({ toolsCalled: 0, retry: true });
    expect(check.add(" ومش قادر أوصل")).toBeNull();
    check.endTurn();
    expect(check.add("للأسف حصلت مشكلة تقنية")).toEqual({ toolsCalled: 0, retry: true });
    check.endTurn();
    expect(check.add("حدث خطأ في النظام الآن")).toEqual({ toolsCalled: 0, retry: false });
  });

  it("leaves a failure alone when a tool of the request did fail", () => {
    const check = new FailureClaimCheck();
    check.newRequest();
    check.toolAnswered(false);
    expect(check.add("حصل عطل ومش قادر أجيب الرقم")).toBeNull();
    check.newRequest();
    check.toolAnswered(true);
    expect(check.add("حصل عطل")).toEqual({ toolsCalled: 1, retry: true });
  });

  it("does not take ordinary words for a failure", () => {
    const check = new FailureClaimCheck();
    check.newRequest();
    expect(check.add("صرفك على الأكل زاد، ومفيش مشكلة لو قللنا الطلبات شوية")).toBeNull();
  });
});

describe("DoneClaimCheck: what it leaves alone", () => {
  it("leaves questions, other words and replies without a waiting draft alone", () => {
    const check = new DoneClaimCheck();
    expect(check.add("خمسين مواصلات، أسجلهم؟", true)).toBe(false);
    expect(check.add(" التسجيلات كتير", true)).toBe(false);
    check.endTurn();
    expect(check.add("آخر حاجة سجلتها كانت أكل", false)).toBe(false);
  });
});

describe("WrittenAmountCheck", () => {
  const amounts = (text: string) => extractSpokenNumbers(text).map((number) => number.value);
  it("catches a replaced amount said as the written one, and leaves the right one alone", () => {
    const check = new WrittenAmountCheck();
    const recent = { written: [50], replaced: [15] };
    expect(check.add("تمام، اتسجلت ", recent, amounts)).toBeNull();
    expect(check.add("خمستاشر جنيه عيش.", recent, amounts)).toEqual({ spoken: 15, written: 50 });
    check.endTurn();
    expect(check.add("تمام، اتسجلت خمسين جنيه عيش.", recent, amounts)).toBeNull();
    expect(check.add("اتسجلت خمستاشر", null, amounts)).toBeNull();
  });
});

