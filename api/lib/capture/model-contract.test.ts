import { describe, expect, it } from "vitest";
import {
  CAPTURE_MODEL_REPLY_SCHEMA,
  CAPTURE_SYSTEM_PROMPT,
  captureUserPrompt,
  checkCaptureReply,
  labelAmounts,
  ledgerKindOf,
  parseCaptureReply,
  proposeCapturePosting,
  type CaptureModelReply,
} from "./model-contract";

const reply = (fields: Partial<CaptureModelReply>): CaptureModelReply => ({
  status: "completed", kind: "purchase", direction: "out", amount: "N1", amountEgp: null, fee: null, feeIncluded: null, balance: null,
  party: null, partyType: "unknown", method: "card", category: null, subcategory: null, recurring: false, ...fields,
});
const read = (message: string, fields: Partial<CaptureModelReply>) => {
  const labelled = labelAmounts(message);
  const check = checkCaptureReply(reply(fields), labelled);
  return { labelled, check, posting: proposeCapturePosting(check) };
};

describe("labelAmounts", () => {
  it("labels every amount with the currency written next to it, whatever the language", () => {
    const { text, amounts } = labelAmounts("Your card had a transaction of EGP 1,250.00 at SHOP. Available bal.EGP 675.6");
    expect(text).toBe("Your card had a transaction of EGP {N1:1,250.00} at SHOP. Available bal.EGP {N2:675.6}");
    expect(amounts).toEqual([{ label: "N1", value: 1250, currency: "EGP" }, { label: "N2", value: 675.6, currency: "EGP" }]);
    expect(labelAmounts("تم خصم 340.50 ج.م ورصيدك ٢٬١١٥ جنيه").amounts).toEqual([
      { label: "N1", value: 340.5, currency: "EGP" }, { label: "N2", value: 2115, currency: "EGP" },
    ]);
  });

  it("reads currencies before or after, glued or apart, and foreign ones", () => {
    const { amounts } = labelAmounts("USD 9.99 = EGP498.51, 300 دولار أمريكي, 20 جنيه استرليني, LE 75, 100ج, 45.00 EUR");
    expect(amounts.map((item) => [item.value, item.currency])).toEqual([[9.99, "USD"], [498.51, "EGP"], [300, "USD"], [20, "GBP"], [75, "EGP"], [100, "EGP"], [45, "EUR"]]);
  });

  it("leaves dates, times, percents, masked cards, codes and markers alone", () => {
    const { amounts } = labelAmounts("on 03/11/2026 14:22, 20% off, card *3381, dial *9*7#, [CARD_1] [PHONE_2], 04-11, then 85");
    expect(amounts).toEqual([{ label: "N1", value: 85, currency: null }]);
  });

  it("keeps a number with no currency as unknown, for the check to decide", () => {
    expect(labelAmounts("تم سحب 3,000 من الماكينة").amounts).toEqual([{ label: "N1", value: 3000, currency: null }]);
  });
});

describe("checkCaptureReply", () => {
  it("takes every value from the message, never from the model", () => {
    const { check, posting } = read("Purchase EGP 85 at ZED. Bal EGP 675.6", { balance: "N2", party: "ZED", partyType: "merchant", category: "food", subcategory: "groceries" });
    expect(check).toMatchObject({ ok: true, facts: { amount: { value: 85, currency: "EGP" }, balance: { value: 675.6 }, category: "food", subcategory: "groceries" } });
    expect(posting).toEqual({ status: "ready", flow: "out", ownership: "other", principalEgp: "85.00", feeEgp: "0.00", totalEgp: "85.00" });
  });

  it("refuses a reply with no amount, or the balance as the amount", () => {
    expect(read("Purchase EGP 85", { amount: null }).check).toEqual({ ok: false, codes: ["amount_missing"] });
    expect(read("Purchase EGP 85", { amount: "N7" }).check).toEqual({ ok: false, codes: ["amount_missing"] });
    expect(read("Paid EGP 85. Bal EGP 600", { amount: "N2", balance: "N2" }).check).toEqual({ ok: false, codes: ["amount_is_balance"] });
    expect(read("x", { status: "completed", amount: null, kind: "other" }).check.ok).toBe(false);
    expect(checkCaptureReply({ status: "done" }, labelAmounts("x"))).toEqual({ ok: false, codes: ["shape"] });
  });

  it("takes the direction from the kind when the kind has one", () => {
    // An ATM withdrawal is money leaving the account, whatever word the model chose for the cash in the user's hand.
    expect(read("سحب نقدي 2,000 جنيه", { kind: "cash_withdrawal", direction: "in" }).posting).toMatchObject({ status: "ready", flow: "out", ownership: "own" });
    expect(read("Salary EGP 15,000", { kind: "salary", direction: "out" }).posting).toMatchObject({ flow: "in" });
    expect(read("Transfer EGP 400", { kind: "transfer", direction: "in" }).posting).toMatchObject({ flow: "in", ownership: "unknown" });
    expect(read("Transfer EGP 400", { kind: "transfer", direction: null }).posting).toEqual({ status: "waiting", reason: "direction_missing" });
  });

  it("adds a separate fee and subtracts an included one", () => {
    expect(read("تم تحويل 500 جنيه رسوم 2.5 جنيه", { kind: "transfer", fee: "N2", feeIncluded: false, partyType: "person", party: "[PHONE_1]" }).posting)
      .toEqual({ status: "ready", flow: "out", ownership: "other", principalEgp: "500.00", feeEgp: "2.50", totalEgp: "502.50" });
    expect(read("تم تحويل 1,005 جنيه شاملة رسوم 5 جنيه", { kind: "transfer", fee: "N2", feeIncluded: true }).posting)
      .toMatchObject({ principalEgp: "1000.00", feeEgp: "5.00", totalEgp: "1005.00" });
    expect(read("Received EGP 500, fee EGP 5", { kind: "transfer", direction: "in", fee: "N2" }).posting).toMatchObject({ principalEgp: "500.00", feeEgp: "0.00" });
    expect(read("Paid EGP 5 fee EGP 5", { fee: "N2", feeIncluded: true }).posting).toEqual({ status: "waiting", reason: "fee_exceeds_total" });
  });

  it("drops side facts that cannot be right instead of the reading", () => {
    const { check } = read("Paid EGP 85 at X", { fee: "N1", balance: "N9", party: "N1", amountEgp: "N1", category: "salary" });
    expect(check).toMatchObject({ ok: true, facts: { fee: null, balance: null, party: null, egp: null, category: null } });
    expect(read("Sent EGP 4,000 to [CARD_1]", { kind: "transfer", party: "[CARD_1]" }).check).toMatchObject({ facts: { party: null } });
  });

  it("needs the pound value of a foreign charge", () => {
    expect(read("Purchase USD 9.99 at NETFLIX. Amount in EGP 498.51", { amountEgp: "N2" }).posting).toMatchObject({ status: "ready", principalEgp: "498.51" });
    expect(read("Purchase USD 9.99 at NETFLIX", {}).posting).toEqual({ status: "waiting", reason: "egp_missing" });
    expect(ledgerKindOf((read("Purchase USD 9.99", {}).check as { facts: never }).facts)).toBe("international_purchase");
  });

  it("records nothing when no money moved", () => {
    expect(read("Declined EGP 4,500", { status: "declined" }).posting).toEqual({ status: "no_posting", state: "failed" });
    expect(read("Hold EGP 2,000", { status: "pending" }).posting).toEqual({ status: "no_posting", state: "held" });
    expect(read("20% off", { status: "not_transaction", amount: null, kind: "other" }).posting).toEqual({ status: "no_posting", state: "none" });
  });

  it("marks the user's own money changing pockets", () => {
    expect(read("Transfer EGP 10,000 from your account to your account", { kind: "transfer", partyType: "own_account" }).posting).toMatchObject({ ownership: "own" });
    expect(read("Payment of EGP 8,320 received for your credit card", { kind: "card_payment", direction: "in" }).posting).toMatchObject({ flow: "out", ownership: "own" });
  });
});

describe("the prompt", () => {
  it("asks for labels, not numbers, and lists the category ids", () => {
    expect(CAPTURE_SYSTEM_PROMPT).toContain("Refer to numbers ONLY by their label");
    expect(CAPTURE_SYSTEM_PROMPT).toContain("food(expense): fast_food");
    expect(JSON.stringify(CAPTURE_MODEL_REPLY_SCHEMA)).not.toContain("quote");
  });

  it("sends the sender and the labelled message only", () => {
    expect(JSON.parse(captureUserPrompt(labelAmounts("Paid EGP 85"), "CIB"))).toEqual({ sender: "CIB", message: "Paid EGP {N1:85}" });
  });

  it("reads a fenced reply and refuses prose", () => {
    expect(parseCaptureReply('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseCaptureReply("I think it is a purchase")).toBeNull();
  });
});
