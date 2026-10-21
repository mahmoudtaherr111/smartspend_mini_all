/**
 * The reader on the messages the plan names (section 4.10). Every message is written for this repository, which is
 * public: the shapes follow formats seen from Egyptian banks, the numbers, names and cards are invented.
 */
import { describe, expect, it } from "vitest";
import { explainReading } from "./explain";
import { readMessage } from "./read";
import type { ReaderInput } from "./types";

const RECEIVED = new Date("2025-11-24T17:00:00Z"); // 19:00 in Cairo

const read = (text: string, extra: Partial<ReaderInput> = {}) => readMessage({ text, receivedAt: RECEIVED, ...extra });

describe("card purchases", () => {
  it("reads a CIB credit card charge, and never takes the available limit for the amount", () => {
    const reading = read(
      "Your credit card ending with#8016 was charged for EGP 118.00 at SAOOD MARKET on 24/11/25 at 18:27. Card available limit is EGP 10000.21",
    );
    expect(reading).toMatchObject({
      status: "transaction",
      kind: "card_purchase",
      direction: "out",
      amount: { value: 118, currency: "EGP", currencyInferred: false },
      availableLimit: { value: 10000.21, currency: "EGP" },
      balanceAfter: null,
      card: { suffix: "8016" },
      counterparty: { type: "merchant", name: "SAOOD MARKET", merchantKey: "saood market" },
      occurredAtFrom: "message",
      confidence: "certain",
    });
    expect(reading.occurredAt.toISOString()).toBe("2025-11-24T16:27:00.000Z");
  });

  it("reads a dollar charge as international, and asks for its pound value since none is written", () => {
    const reading = read("Your credit card ending with#8016 was charged for USD 99.99 at AMAZON MKTPLACE on 20/11/25 at 09:15. Card available limit is EGP 15000.50");
    expect(reading).toMatchObject({
      kind: "international_purchase",
      amount: { value: 99.99, currency: "USD" },
      amountEgp: null,
      counterparty: { type: "merchant", name: "AMAZON MKTPLACE" },
      confidence: "likely",
    });
    expect(reading.missing).toContain("amount_egp");
  });

  it("pairs a foreign amount with the pound equivalent written next to it", () => {
    const reading = read("تم خصم USD 20.00 بما يعادل EGP 1,010.50 من بطاقتك المنتهية ب 4421 لدى OPENAI *CHATGPT SUBSCR");
    expect(reading).toMatchObject({
      kind: "international_purchase",
      amount: { value: 20, currency: "USD" },
      amountEgp: { value: 1010.5, currency: "EGP" },
      card: { suffix: "4421" },
      counterparty: { type: "merchant", name: "OPENAI *CHATGPT SUBSCR", merchantKey: "openai chatgpt subscr" },
      subscriptionHint: true,
    });
  });

  it("reads an NBE Arabic debit at a merchant as a purchase, the credit card's available amount as its limit", () => {
    const reading = read("تم خصم 100.50 جم من بطاقة الائتمان رقم 1111 عند KASHIERFast يوم 09-10 الساعة 10:11 المتاح 9000.00 جم");
    expect(reading).toMatchObject({
      status: "transaction",
      kind: "card_purchase",
      direction: "out",
      amount: { value: 100.5, currency: "EGP" },
      availableLimit: { value: 9000, currency: "EGP" },
      card: { suffix: "1111" },
      counterparty: { type: "merchant", name: "KASHIERFast" },
      confidence: "certain",
    });
    expect(reading.occurredAt.toISOString()).toBe("2025-10-09T07:11:00.000Z");
  });

  it("reads a debit card's available amount as the balance after", () => {
    const reading = read("تم خصم EGP 250.00 من بطاقتك رقم 5521 عند CARREFOUR MAADI 012 المتاح EGP 3,400.75");
    expect(reading).toMatchObject({
      kind: "card_purchase",
      amount: { value: 250 },
      balanceAfter: { value: 3400.75 },
      availableLimit: null,
      counterparty: { merchantKey: "carrefour" },
    });
  });
});

describe("refunds", () => {
  it("reads a refund in euros written without a leading zero", () => {
    const reading = read("The transaction on your credit card#8016 from ORACLE IRELAND with EUR .93 on 02/11/25 has been refunded");
    expect(reading).toMatchObject({
      status: "transaction",
      kind: "refund",
      direction: "in",
      amount: { value: 0.93, currency: "EUR" },
      counterparty: { type: "merchant", name: "ORACLE IRELAND", merchantKey: "oracle" },
    });
  });
});

describe("transfers", () => {
  it("reads an incoming InstaPay transfer with the sender's name and the reference", () => {
    const reading = read("تم إضافة تحويل لحظي لحسابكم رقم 4444 بمبلغ 400.00 جم من محمد محمد رقم مرجعي 123456789012 يوم 09-10 الساعة 20:11");
    expect(reading).toMatchObject({
      status: "transaction",
      kind: "transfer_in",
      direction: "in",
      amount: { value: 400, currency: "EGP" },
      account: { suffix: "4444" },
      counterparty: { type: "person", name: "محمد محمد" },
      reference: "123456789012",
      confidence: "certain",
    });
  });

  it("reads a wallet transfer to a phone number", () => {
    const reading = read("تم تحويل 200 جنيه لرقم 01012345678 بنجاح. رصيدك الحالي 350.50 جنيه", { sourceKind: "wallet", sourceSlug: "vodafone_cash" });
    expect(reading).toMatchObject({
      kind: "wallet_send",
      direction: "out",
      amount: { value: 200 },
      balanceAfter: { value: 350.5 },
      counterparty: { type: "person", phone: "01012345678", phoneTail: "5678" },
    });
  });

  it("reads money received from a masked number in a wallet", () => {
    const reading = read("تم استلام 500 جنيه من رقم 010****5678. رصيدك 850.00 جنيه", { sourceKind: "wallet", sourceSlug: "vodafone_cash" });
    expect(reading).toMatchObject({ kind: "wallet_receive", direction: "in", amount: { value: 500 }, counterparty: { phoneTail: "5678", phone: null } });
  });

  it("reads a transfer to an InstaPay address", () => {
    const reading = read("تم تحويل 1,000 جنيه إلى ahmed.ali@instapay بنجاح", { sourceKind: "payment_network", sourceSlug: "instapay" });
    expect(reading).toMatchObject({ kind: "transfer_out", direction: "out", amount: { value: 1000 }, counterparty: { type: "person", ipa: "ahmed.ali@instapay" } });
  });

  it("reads money sent into the user's own account as coming in, between their own accounts", () => {
    const reading = read("تم تحويل مبلغ 1500 جنيه إلى حسابك رقم ***7788");
    expect(reading).toMatchObject({ kind: "transfer_in", direction: "internal", counterparty: { type: "own_account" } });
  });
});

describe("other money movements", () => {
  it("reads an ATM withdrawal", () => {
    expect(read("تم سحب نقدي 1,000.00 جنيه من ماكينة الصراف ببطاقتك رقم 3321. الرصيد المتاح 5,200.00 جنيه")).toMatchObject({
      kind: "atm_withdrawal",
      direction: "out",
      amount: { value: 1000 },
      balanceAfter: { value: 5200 },
    });
  });

  it("reads a salary", () => {
    expect(read("Your account XX5678 has been credited with EGP 15,000.00 salary for October")).toMatchObject({
      kind: "salary",
      direction: "in",
      amount: { value: 15000, currency: "EGP" },
      account: { suffix: "5678" },
    });
  });

  it("takes a bare number after the verb as pounds, and says so", () => {
    const reading = read("تم خصم 250 من حسابك");
    expect(reading.amount).toMatchObject({ value: 250, currency: "EGP", currencyInferred: true });
    expect(reading.confidence).toBe("likely");
  });
});

describe("messages that are not a transaction", () => {
  it("drops a declined payment", () => {
    expect(read("تم رفض عملية شراء بمبلغ 750 جنيه لدى ZARA لعدم كفاية الرصيد، رصيد غير كاف")).toMatchObject({
      status: "not_transaction",
      kind: "declined",
      direction: null,
    });
  });

  it("recognises a one-time code", () => {
    expect(read("رمز التحقق 482915 لا تشاركه مع أي حد")).toMatchObject({ status: "not_transaction", kind: "otp" });
    expect(read("Your OTP for EGP 500.00 purchase at NOON is 773910. Do not share it")).toMatchObject({ kind: "otp" });
  });

  it("does not read a purchase's safety footer as a one-time code", () => {
    expect(read("تم خصم 75.00 جم من بطاقتك رقم 9911 عند TALABAT. لا تشارك الرقم السري مع أحد").status).toBe("transaction");
  });

  it("drops a promotion even when it says خصم", () => {
    expect(read("خصم 50% على كل المشتريات بالكارت لحد آخر الشهر! اعرف أكتر www.bank.example")).toMatchObject({
      status: "not_transaction",
      kind: "promo",
    });
  });

  it("reads a balance message as a balance only", () => {
    expect(read("رصيدك الحالي 1,250.00 جم")).toMatchObject({ status: "not_transaction", kind: "balance_only", balanceAfter: { value: 1250 } });
  });

  it("reads a credit card statement as a due date", () => {
    expect(read("كشف حساب بطاقتك: الحد الأدنى للسداد 1,500 جم تاريخ الاستحقاق 25/10")).toMatchObject({
      status: "not_transaction",
      kind: "statement_due",
      minimumDue: { value: 1500 },
    });
  });

  it("is unsure when an outgoing and an incoming verb are equally strong", () => {
    expect(read("تم تحويل 300 جنيه واستلمت 300 جنيه").status).toBe("unsure");
  });
});

describe("normalization", () => {
  it("reads Arabic-Indic digits and separators", () => {
    expect(read("تم خصم ١٬٢٥٠٫٥٠ جنيه من بطاقتك رقم ٤٤٢١ عند كارفور").amount).toMatchObject({ value: 1250.5, currency: "EGP" });
  });

  it("keeps the position of each piece in the original message", () => {
    const text = "تم خصم 100.50 جم عند KASHIER";
    const reading = read(text);
    const span = reading.amount!.span;
    expect(text.slice(span.start, span.end)).toBe("100.50 جم");
  });
});

describe("explanation", () => {
  it("says in Egyptian Arabic what the message wrote", () => {
    const reading = read("تم خصم 100.50 جم من بطاقة الائتمان رقم 1111 عند KASHIERFast يوم 09-10 الساعة 10:11 المتاح 9000.00 جم");
    expect(explainReading(reading)).toBe("لقينا «تم خصم» يعني شراء بالكارت، المبلغ 100.5 ج.م، التاجر KASHIERFast، الكارت آخره 1111، والمتاح في الكارت 9,000 ج.م.");
  });
});
