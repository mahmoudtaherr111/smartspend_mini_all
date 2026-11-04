/**
 * Reply shapes the live models returned on synthetic messages (2026-11-04, gemini-3.x flash-lite, qwen3.8-27b): each
 * was read right but failed a check that was stricter than the message. No real message is in this file.
 */
import { describe, expect, it } from "vitest";
import { checkCaptureReply, proposeCapturePosting, type CaptureModelReply } from "./model-contract";

const money = (value: number, quote: string, currency = "EGP") => ({ value, currency, quote });
const base: CaptureModelReply = {
  state: "done", stateQuote: null, type: "transfer", flow: "out", flowQuote: null, ownership: "unknown", ownershipQuote: null,
  amount: null, egp: null, fee: null, balance: null, limit: null, partyType: "unknown", party: null, partyQuote: null,
  via: "other", category: null, recurring: false,
};
const posting = (reply: Partial<CaptureModelReply>, text: string) => proposeCapturePosting(checkCaptureReply({ ...base, ...reply }, text));

describe("sms-v4 checks follow how Egyptian bank messages are written", () => {
  it("takes a transfer's direction from the preposition before its counterparty", () => {
    const text = "تم تحويل 40 جنيه لرقم [PHONE_1] مصاريف الخدمة 1 جنيه رصيد حسابك 254.04.";
    const reply = { stateQuote: "تم تحويل", flowQuote: "تم تحويل", amount: money(40, "40 جنيه"), partyType: "person" as const, party: "[PHONE_1]",
      partyQuote: "لرقم [PHONE_1]", fee: { ...money(1, "مصاريف الخدمة 1 جنيه"), includedInAmount: false, inclusionQuote: "مصاريف الخدمة 1 جنيه" },
      balance: money(254.04, "254.04"), via: "wallet" as const };
    expect(posting(reply, text)).toEqual({ status: "ready", flow: "out", ownership: "unknown", principalEgp: "40.00", feeEgp: "1.00", totalEgp: "41.00" });
    // The same words do not prove money coming in.
    expect(posting({ ...reply, flow: "in", fee: null }, text)).toMatchObject({ status: "rejected", codes: expect.arrayContaining(["flow_evidence_role"]) });
    expect(posting({ ...reply, fee: null, partyQuote: "من [PHONE_1]", flow: "in" }, text.replace("لرقم", "من"))).toMatchObject({ status: "ready", flow: "in" });
  });

  it("drops a balance written without its currency instead of rejecting the transfer", () => {
    const text = "تم تحويل 40 جنيه لرقم [PHONE_1] رصيد حسابك 254.04.";
    const check = checkCaptureReply({ ...base, stateQuote: "تم تحويل", flowQuote: "تم تحويل", amount: money(40, "40 جنيه"), partyType: "person", party: "[PHONE_1]",
      partyQuote: "لرقم [PHONE_1]", balance: money(254.04, "رصيد حسابك 254.04") }, text);
    expect(check).toMatchObject({ ok: true, reply: { balance: null }, repairs: expect.arrayContaining(["balance"]) });
  });

  it("accepts an ATM withdrawal and a refund written without تم", () => {
    expect(posting({ type: "cash_out", stateQuote: "سحب نقدي", flowQuote: "سحب نقدي", amount: money(2000, "2,000 جنيه") },
      "سحب نقدي 2,000 جنيه من ماكينة ATM بكارت [CARD_1]")).toMatchObject({ status: "ready", flow: "out", principalEgp: "2000.00" });
    expect(posting({ type: "refund", flow: "in", stateQuote: "تم رد", flowQuote: "تم رد", amount: money(450, "450.00 جنيه") },
      "تم رد مبلغ 450.00 جنيه إلى بطاقتك [CARD_1] مرتجع عملية سابقة")).toMatchObject({ status: "ready", flow: "in", principalEgp: "450.00" });
  });

  it("does not take the user's own card as an own-account transfer", () => {
    const check = checkCaptureReply({ ...base, type: "purchase", stateQuote: "Successful transaction", flowQuote: "transaction of", ownership: "own",
      ownershipQuote: "Your Card [CARD_1]", amount: money(85, "EGP 85"), partyType: "merchant", party: "ZED MARKET", partyQuote: "@FAWRYPF*ZED MARKET" },
    "Your Card [CARD_1] had a Successful transaction of EGP 85 @FAWRYPF*ZED MARKET");
    expect(check).toMatchObject({ ok: true, reply: { ownership: "unknown" }, repairs: expect.arrayContaining(["ownership"]) });
  });

  it("still refuses a purchase quote that says the money came in", () => {
    expect(posting({ type: "purchase", stateQuote: "تم خصم", flowQuote: "تم استلام", amount: money(75, "75 جنيه") },
      "تم خصم 75 جنيه من بطاقتك. تم استلام")).toMatchObject({ status: "rejected", codes: expect.arrayContaining(["flow_evidence_role"]) });
  });
});

describe("no-movement messages", () => {
  const promo = "خصم 30% على كل مشترياتك من TALABAT بكارت [CARD_1] لحد آخر الشهر.";
  it("accepts an offer read as no movement without a state quote", () => {
    expect(posting({ state: "none", type: "promo", flow: null, partyType: "merchant", party: "TALABAT", partyQuote: "من TALABAT" }, promo)).toEqual({ status: "no_posting", state: "none" });
  });
  it("still needs a quote when the message says money moved", () => {
    expect(posting({ state: "none", type: "promo", flow: null }, "تم خصم 75 جنيه من بطاقتك. خصم 30% على مشترياتك القادمة"))
      .toMatchObject({ status: "rejected" });
  });
});
