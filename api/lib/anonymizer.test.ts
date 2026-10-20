/**
 * What leaves the server for a model (decision 0025): no card or account digits, IBANs, phone numbers, references or
 * names of people, while amounts and balances stay. Every message here is invented; the repository is public.
 */
import { describe, expect, it } from "vitest";
import { redactSensitiveData, redactWithFindings } from "./anonymizer";

describe("card and account digits", () => {
  it("masks a card ending however the bank writes it, and keeps the last four on the server", () => {
    const cases: Array<[string, string]> = [
      ["Purchase EGP 450.00 on card **4821 at SPINNEYS", "4821"],
      ["Your card ending with 7712 was charged EGP 99.99", "7712"],
      ["Card ends in 3301, amount EGP 20", "3301"],
      ["تم خصم 300 جنيه من بطاقتك المنتهية ب 5567 لدى كارفور", "5567"],
      ["تم خصم 300 جنيه من بطاقتك المنتهية بـ٥٥٦٧", "5567"],
      ["تم شراء بمبلغ ٢٥٠ جنيه بالبطاقة رقم ٥٥٤٤", "5544"],
      ["account XXXX-9012 debited EGP 70", "9012"],
    ];
    for (const [message, last4] of cases) {
      const { text, findings } = redactWithFindings(message);
      expect(text).toContain("[REDACTED_CARD]");
      expect(text).not.toMatch(new RegExp(last4));
      expect(findings.cardLast4).toEqual([last4]);
    }
  });

  it("masks 12 to 19 digit account and card numbers, grouped or not, and IBANs", () => {
    expect(redactSensitiveData("Transfer from 100234567890123 EGP 500")).toBe(
      "Transfer from [REDACTED_ACCOUNT] EGP 500",
    );
    expect(redactSensitiveData("Card 4000 1234 5678 9010 used for USD 20.00")).toBe(
      "Card [REDACTED_ACCOUNT] used for USD 20.00",
    );
    expect(redactSensitiveData("IBAN EG380019000500000000263180002 credited EGP 900")).toBe(
      "IBAN [REDACTED_IBAN] credited EGP 900",
    );
    expect(redactSensitiveData("IBAN EG38 0019 0005 0000 0000 2631 8000 2 credited")).toBe(
      "IBAN [REDACTED_IBAN] credited",
    );
  });

  it("masks an account named with its number word", () => {
    const { text, findings } = redactWithFindings("تم سحب 2000 جنيه من حسابك رقم 123456789");
    expect(text).toBe("تم سحب 2000 جنيه من حسابك رقم [REDACTED_ACCOUNT]");
    expect(findings.cardLast4).toEqual(["6789"]);
  });
});

describe("phone numbers", () => {
  it("masks Egyptian mobiles in every common form", () => {
    for (const phone of ["01012345678", "+201112223334", "00201512345678", "+20 10 1234 5678", "010****5678"]) {
      expect(redactSensitiveData(`استلمت 300 جنيه من ${phone} بنجاح`)).toBe(
        "استلمت 300 جنيه من [REDACTED_PHONE] بنجاح",
      );
    }
  });

  it("keeps a bank's short hotline, which identifies no one", () => {
    expect(redactSensitiveData("Call 19666 for help")).toBe("Call 19666 for help");
  });
});

describe("references", () => {
  it("masks reference and transaction numbers after their keyword", () => {
    expect(redactSensitiveData("Ref: 88321765. Thank you")).toBe("Ref: [REDACTED_REF]. Thank you");
    expect(redactSensitiveData("Transaction ID: TXN99887766 done")).toBe("Transaction ID: [REDACTED_REF] done");
    expect(redactSensitiveData("رقم مرجعي 9F3K2201 الرصيد 2500 جنيه")).toBe("رقم مرجعي [REDACTED_REF] الرصيد 2500 جنيه");
    expect(redactSensitiveData("رقم العملية: 554433 بنجاح")).toBe("رقم العملية: [REDACTED_REF] بنجاح");
  });

  it("does not take an amount for a reference", () => {
    expect(redactSensitiveData("ref 12345.50 EGP")).toBe("ref 12345.50 EGP");
    expect(redactSensitiveData("transaction 500 EGP")).toBe("transaction 500 EGP");
  });
});

describe("names of people", () => {
  it("masks a name after من, إلى, لـ, to, from and Dear", () => {
    expect(redactSensitiveData("تم تحويل 500 جنيه إلى محمد أحمد علي عبر انستاباي")).toBe(
      "تم تحويل 500 جنيه إلى [REDACTED_NAME] عبر انستاباي",
    );
    expect(redactSensitiveData("تم تحويل 200 جنيه إلى عبد الكريم سعيد عبر فودافون كاش")).toBe(
      "تم تحويل 200 جنيه إلى [REDACTED_NAME] عبر فودافون كاش",
    );
    expect(redactSensitiveData("تم تحويل مبلغ 750 جنيه لـ أحمد حسن بنجاح")).toBe(
      "تم تحويل مبلغ 750 جنيه لـ [REDACTED_NAME] بنجاح",
    );
    expect(redactSensitiveData("استلمت 1500 جم من MOHAMED AHMED رصيدك 3200 جم")).toBe(
      "استلمت 1500 جم من [REDACTED_NAME] رصيدك 3200 جم",
    );
    expect(redactSensitiveData("تم إيداع 3000 جنيه من حساب Mohamed Ali Hassan")).toBe(
      "تم إيداع 3000 جنيه من حساب [REDACTED_NAME]",
    );
    expect(redactSensitiveData("Transfer of EGP 2,000.00 to AHMED SAMIR via InstaPay")).toBe(
      "Transfer of EGP 2,000.00 to [REDACTED_NAME] via InstaPay",
    );
    expect(redactSensitiveData("from AHMED to MOHAMED via wallet")).toBe("from [REDACTED_NAME] to [REDACTED_NAME] via wallet");
    expect(redactSensitiveData("Dear MONA HASSAN, salary credited")).toBe("Dear [REDACTED_NAME], salary credited");
  });

  it("leaves accounts, banks, wallets and ordinary words after the same prepositions", () => {
    for (const message of [
      "تم خصم 300 جنيه من حسابك",
      "تم سحب 1000 جنيه من ماكينة الصراف",
      "تم تحويل 400 جنيه من البنك الأهلي",
      "عزيزي العميل تم خصم 99 جنيه",
      "EGP 500 transferred to your account",
      "Your card was used to pay EGP 300",
      "received from InstaPay EGP 200",
    ]) {
      expect(redactSensitiveData(message)).toBe(message);
    }
  });
});

describe("what the model still needs", () => {
  it("keeps amounts, balances, fees, dates and merchants", () => {
    const message =
      "تم خصم مبلغ 1,250.50 جنيه من بطاقتك المنتهية ب 4821 لدى CARREFOUR MAADI يوم 20/10/2026 رسوم 5 جنيه الرصيد المتاح 12,340.75 جنيه";
    expect(redactSensitiveData(message)).toBe(
      "تم خصم مبلغ 1,250.50 جنيه من بطاقتك المنتهية ب [REDACTED_CARD] لدى CARREFOUR MAADI يوم 20/10/2026 رسوم 5 جنيه الرصيد المتاح 12,340.75 جنيه",
    );
  });

  it("keeps four digits after a card word when they are an amount", () => {
    expect(redactSensitiveData("card 2500 EGP refund")).toBe("card 2500 EGP refund");
    expect(redactSensitiveData("رصيد البطاقة 3000 جنيه")).toBe("رصيد البطاقة 3000 جنيه");
  });

  it("still masks one-time codes and e-mail addresses", () => {
    expect(redactSensitiveData("رمز التحقق الخاص بك هو 5892 لعملية بمبلغ 1500 جنيه")).toBe(
      "رمز التحقق الخاص بك هو [REDACTED_OTP] لعملية بمبلغ 1500 جنيه",
    );
    expect(redactSensitiveData("receipt sent to someone@example.com")).toBe("receipt sent to [REDACTED_EMAIL]");
  });

  it("returns an empty string for nothing", () => {
    expect(redactSensitiveData("")).toBe("");
  });
});
