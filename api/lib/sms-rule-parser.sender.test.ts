import { describe, expect, it } from "vitest";
import { parseSmsByRules } from "./sms-rule-parser";

describe("the sender names the provider", () => {
  const message = "تم خصم 250.00 جنيه من حسابكم";

  it("reads the provider from the notification's sender when the text does not say it", () => {
    expect(parseSmsByRules(message, "CIB").provider).toBe("CIB");
    expect(parseSmsByRules(message, "Vodafone Cash").provider).toBe("VodafoneCash");
    expect(parseSmsByRules(message, "WE Pay").provider).toBe("WEPay");
  });

  it("does not take a sender that merely contains the letters of WE for WE Pay", () => {
    expect(parseSmsByRules(message, "Western Union").provider).not.toBe("WEPay");
  });
});
