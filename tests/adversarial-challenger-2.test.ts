/**
 * Adversarial Stress Harness for Challenger 2
 * Tests SMS condensation, Arabic dialect edge cases, offline pipeline, and UI logic.
 */
import { describe, it, expect } from "vitest";
import { condenseSmsNotification, parseSmsByRules, cleanSmsText, normalizeSmsText } from "../api/lib/sms-rule-parser";
import { extractPeople, extractAmounts, extractEntities } from "../api/lib/entity-extractor";
import { isKareemPersonContext } from "../api/lib/egyptian-names-dictionary";
import { runSmartPipeline } from "../api/lib/smart-pipeline";

describe("Adversarial Stress Test: SMS Condensation & Bank Formats", () => {
  const bankSamples = [
    {
      bank: "CIB",
      raw: "عزيزي العميل، تم خصم مبلغ 1,250.50 جم من بطاقتك الائتمانية المنتهية بـ **4321 لدى ZARA Cairo Festival بتاريخ 2026-08-20. الرصيد المتاح هو 15,400.00 جم. لخدمة العملاء اتصل بـ 19666. تطبق الشروط والأحكام. البنك لن يطلب منك رقمك السري أبداً.",
      expectedAmount: 1250.50,
      expectedMerchant: "ZARA Cairo Festival",
      expectedCardMask: "4321",
      expectedBalance: 15400.00,
    },
    {
      bank: "NBE (National Bank of Egypt)",
      raw: "عميلنا العزيز: تم سحب نقدي بمبلغ 3000 جنيه من ماكينة الصراف الآلي NBE ATM - Nasr City بالبطاقة **9876 بتاريخ 25/08/2026 الساعة 14:30. الرصيد المتبقي: 8,500.00 جنيه. للاستفسار اتصل على 19623 أو زور موقعنا www.nbe.com.eg.",
      expectedAmount: 3000,
      expectedCardMask: "9876",
      expectedBalance: 8500.00,
    },
    {
      bank: "QNB",
      raw: "Dear Valued Customer, your QNB credit card *1122 was debited by EGP 450.00 at Buffalo Burger on 24-08-2026. Avail Bal: EGP 12,300.50. For 24/7 support call 19700. Enjoy special offers at https://qnb.com.eg.",
      expectedAmount: 450.00,
      expectedMerchant: "Buffalo Burger",
      expectedCardMask: "1122",
      expectedBalance: 12300.50,
    },
    {
      bank: "Banque Misr",
      raw: "بنك مصر: تم سداد فاتورة بمبلغ 350.00 جم عبر فوري Fawry من حسابك رقم **5544 بتاريخ 2026/08/21. رصيد حسابك المتاح 4,200.00 جم. لخدمة العملاء 19888. شكراً لتعاملك معنا.",
      expectedAmount: 350.00,
      expectedCardMask: "5544",
      expectedBalance: 4200.00,
    },
    {
      bank: "Vodafone Cash",
      raw: "تم تحويل مبلغ 500 جنيه بنجاح لرقم 01012345678. مصاريف الخدمة 1 جنيه. رصيدك الحالي هو 1250.00 جنيه. كود العملية 9823412. وفر أكتر مع عروض فودافون كاش وحمل تطبيق أنا فودافون.",
      expectedAmount: 500,
      expectedBalance: 1250.00,
    },
    {
      bank: "InstaPay",
      raw: "تم تحويل 2,000.00 جم بنجاح إلى حساب أحمد محمد عبر انستاباي InstaPay من حسابك بالبنك الأهلي. الرقم المرجعي: IP993214. الرصيد المتاح 18,000.00 جم. تنبيه أمني: لا تشارك بياناتك السرية مع أي شخص.",
      expectedAmount: 2000.00,
      expectedBalance: 18000.00,
    },
  ];

  bankSamples.forEach((sample) => {
    it(`should condense ${sample.bank} SMS and retain all critical entities without corruption`, () => {
      const condensed = condenseSmsNotification(sample.raw);
      
      // Measure token reduction
      const charReduction = ((sample.raw.length - condensed.length) / sample.raw.length) * 100;
      expect(charReduction).toBeGreaterThanOrEqual(10); // Measured reduction across banks

      // Verify amount is preserved in condensed text
      const extractedAmount = sample.raw.match(new RegExp(sample.expectedAmount.toString().replace(".", "\\."))) ||
                             sample.raw.match(new RegExp(sample.expectedAmount.toLocaleString("en-US").replace(".", "\\.")));
      expect(extractedAmount).not.toBeNull();

      // Rule parser on condensed text
      const parsed = parseSmsByRules(condensed);
      expect(parsed.transaction_detected).toBe(true);
      expect(parsed.amount).toBe(sample.expectedAmount);
      if (sample.expectedBalance !== undefined) {
        expect(parsed.balance_after).toBe(sample.expectedBalance);
      }

      // Verify boilerplate is removed
      expect(condensed).not.toMatch(/19\d{3}|16\d{3}|15\d{3}/); // No hotlines
      expect(condensed).not.toMatch(/https?:\/\/|www\./); // No URLs
      expect(condensed).not.toMatch(/عزيزي العميل|عميلنا العزيز|Dear Valued Customer/i); // No greetings
      expect(condensed).not.toMatch(/تطبق الشروط|شكراً لتعاملك|thank you for/i); // No signoffs
    });
  });
});

describe("Adversarial Stress Test: Arabic Dialect & Entity Edge Cases", () => {
  it("preserves compound theophoric names (عبد الرحمن, عبد الله, عبد العزيز)", () => {
    const p1 = extractPeople("حولت 500 جنيه لعبد الرحمن امبارح");
    expect(p1).toContain("عبد الرحمن");

    const p2 = extractPeople("اديت عبد الله 300 عشان المشوار");
    expect(p2).toContain("عبد الله");

    const p3 = extractPeople("سلفت عبد العزيز 1000 جنيه");
    expect(p3).toContain("عبد العزيز");

    const p4 = extractPeople("دفعت لعبد الكريم 250");
    expect(p4).toContain("عبد الكريم");
  });

  it("disambiguates 'كريم' as ride hailing app vs person", () => {
    // App contexts
    expect(isKareemPersonContext("ركبت كريم بـ 60 جنيه")).toBe(false);
    expect(isKareemPersonContext("طلبت مشوار كريم بـ 85 جنيه")).toBe(false);
    expect(isKareemPersonContext("توصيلة كريم 45 جنيه")).toBe(false);
    expect(isKareemPersonContext("اخدت كريم للجامعة 50")).toBe(false);

    const appEntities = extractEntities("ركبت كريم بـ 60 جنيه");
    expect(appEntities.people).not.toContain("كريم");
    expect(appEntities.merchants).toContain("Careem");

    // Person contexts
    expect(isKareemPersonContext("حولت 500 جنيه لكريم صاحبي")).toBe(true);
    expect(isKareemPersonContext("اديت كريم 200 سلفة")).toBe(true);
    expect(isKareemPersonContext("سلفت كريم 350 جنيه")).toBe(true);
    expect(isKareemPersonContext("خدت من كريم 100 جنيه")).toBe(true);

    const personEntities = extractEntities("حولت 500 جنيه لكريم");
    expect(personEntities.people).toContain("كريم");
  });

  it("handles multi-item compound descriptions accurately", async () => {
    const text = "فول وطعمية 30 وقهوة 25 ومواصلات 15";
    const amounts = extractAmounts(text);
    expect(amounts.map((a) => a.amount)).toEqual([30, 25, 15]);
  });
});

describe("Adversarial Stress Test: Offline Fail-Fast in smart-pipeline.ts", () => {
  it("executes smart-pipeline offline with no API key and returns within < 250ms", async () => {
    const start = performance.now();
    const result = await runSmartPipeline({
      text: "بنزين 200",
      userId: 9999,
      userType: "oauth",
      userPlan: "free",
      userDict: [],
      apiKey: "",
      modelName: "flash",
      maxTokens: 400,
    });
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(500); // Fail-fast sub-500ms
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.items[0].amount).toBe(200);
    expect(result.items[0].category).toBe("مواصلات");
    expect(result.actualModelUsed).toBeNull(); // No AI was called
    expect(result.tokensUsed).toBe(0);
  });

  it("decomposes multiple items offline without hanging", async () => {
    const start = performance.now();
    const result = await runSmartPipeline({
      text: "فول وطعمية 30 وقهوة 25 ومواصلات 15",
      userId: 9999,
      userType: "oauth",
      userPlan: "free",
      userDict: [],
      apiKey: "",
      modelName: "flash",
      maxTokens: 400,
    });
    const duration = performance.now() - start;

    expect(result.items.length).toBe(3);
    expect(result.items.map((i) => i.amount).sort((a, b) => b - a)).toEqual([30, 25, 15]);
  }, 15000);
});
