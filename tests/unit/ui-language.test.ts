/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import {
  isUiLanguage,
  directionOf,
  readStoredLanguage,
  storeLanguage,
  applyDocumentLanguage,
  LANGUAGE_STORAGE_KEY,
} from "../../src/i18n/language";
import { formatCurrency, formatMonthLabel } from "../../src/i18n/format";
import { formatMessage, translate } from "../../src/i18n/context";
import { ar } from "../../src/i18n/ar";
import { en } from "../../src/i18n/en";

describe("UI Language Core Infrastructure", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("language validation & direction", () => {
    it("recognizes supported languages", () => {
      expect(isUiLanguage("ar")).toBe(true);
      expect(isUiLanguage("en")).toBe(true);
      expect(isUiLanguage("fr")).toBe(false);
      expect(isUiLanguage(null)).toBe(false);
      expect(isUiLanguage(undefined)).toBe(false);
    });

    it("maps direction accurately", () => {
      expect(directionOf("ar")).toBe("rtl");
      expect(directionOf("en")).toBe("ltr");
    });
  });

  describe("storage persistence", () => {
    it("returns null when storage is empty or invalid", () => {
      expect(readStoredLanguage()).toBeNull();
      localStorage.setItem(LANGUAGE_STORAGE_KEY, "invalid-lang");
      expect(readStoredLanguage()).toBeNull();
    });

    it("reads and writes valid language to localStorage", () => {
      storeLanguage("en");
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en");
      expect(readStoredLanguage()).toBe("en");

      storeLanguage("ar");
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("ar");
      expect(readStoredLanguage()).toBe("ar");
    });

    it("applies document lang and dir attributes", () => {
      applyDocumentLanguage("ar");
      expect(document.documentElement.lang).toBe("ar");
      expect(document.documentElement.dir).toBe("rtl");

      applyDocumentLanguage("en");
      expect(document.documentElement.lang).toBe("en");
      expect(document.documentElement.dir).toBe("ltr");
    });
  });

  describe("formatCurrency helper", () => {
    it("formats amounts in Arabic with ج.م suffix", () => {
      expect(formatCurrency(1250, "ar")).toBe("1,250 ج.م");
      expect(formatCurrency(0, "ar")).toBe("0 ج.م");
      expect(formatCurrency(null, "ar")).toBe("0 ج.م");
    });

    it("formats amounts in English with EGP suffix", () => {
      expect(formatCurrency(1250, "en")).toBe("1,250 EGP");
      expect(formatCurrency(50000, "en")).toBe("50,000 EGP");
      expect(formatCurrency(undefined, "en")).toBe("0 EGP");
    });
  });

  describe("formatMonthLabel helper", () => {
    it("formats YYYY-MM in Arabic", () => {
      expect(formatMonthLabel("2026-10", "ar")).toBe("أكتوبر 2026");
      expect(formatMonthLabel("2026-01", "ar")).toBe("يناير 2026");
      expect(formatMonthLabel("2026-12", "ar")).toBe("ديسمبر 2026");
    });

    it("formats YYYY-MM in English", () => {
      expect(formatMonthLabel("2026-10", "en")).toBe("October 2026");
      expect(formatMonthLabel("2026-01", "en")).toBe("January 2026");
      expect(formatMonthLabel("2026-12", "en")).toBe("December 2026");
    });

    it("returns raw string if invalid format", () => {
      expect(formatMonthLabel("invalid", "en")).toBe("invalid");
    });
  });

  describe("message formatting and translation", () => {
    it("interpolates variables in message templates", () => {
      const template = "Hello {name} 👋 • {subtitle}";
      const rendered = formatMessage(template, { name: "Ahmed", subtitle: "Record" });
      expect(rendered).toBe("Hello Ahmed 👋 • Record");
    });

    it("translates keys from ar dictionary", () => {
      expect(translate(null, "dashboard.income")).toBe("دخل الشهر");
      expect(translate(null, "aiCenter.title")).toBe("مركز الذكاء الاصطناعي");
    });

    it("translates keys from en dictionary when loaded", () => {
      expect(translate(en, "dashboard.income")).toBe("Monthly Income");
      expect(translate(en, "aiCenter.title")).toBe("AI Center");
    });

    it("every key in ar has a corresponding translation in en", () => {
      const arKeys = Object.keys(ar) as Array<keyof typeof ar>;
      for (const key of arKeys) {
        expect(en[key], `Missing English translation for ${key}`).toBeDefined();
        expect(typeof en[key]).toBe("string");
        expect(en[key].length).toBeGreaterThan(0);
      }
    });
  });
});
