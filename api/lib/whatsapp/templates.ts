/**
 * The WhatsApp templates the product sends (decision 0038), defined here and submitted to Meta from the admin
 * console. Meta reviews each one; a template is sendable only once it is APPROVED. Marketing templates are written by
 * admins in the console, not here. Texts follow docs/guides/writing-app-messages.md: Egyptian Arabic, no emoji.
 */
import type { TemplateMessage } from "./client";

export const TEMPLATE_LANGUAGE = "ar";

export interface ProductTemplate {
  name: string;
  category: "AUTHENTICATION" | "UTILITY";
  /** The Graph API definition submitted for review. */
  definition: Record<string, unknown>;
}

/**
 * Verification codes. Meta writes an authentication template's text itself ("<code> هو كود التحقق الخاص بك."), with
 * the security note and the expiry we ask for; the button copies the code, and Android suggests it on the keyboard.
 */
export const VERIFICATION_TEMPLATE: ProductTemplate = {
  name: "smartspend_verification",
  category: "AUTHENTICATION",
  definition: {
    name: "smartspend_verification",
    language: TEMPLATE_LANGUAGE,
    category: "AUTHENTICATION",
    message_send_ttl_seconds: 600,
    components: [
      { type: "BODY", add_security_recommendation: true },
      { type: "FOOTER", code_expiration_minutes: 10 },
      { type: "BUTTONS", buttons: [{ type: "OTP", otp_type: "COPY_CODE", text: "انسخ الكود" }] },
    ],
  },
};

/** The monthly report is ready: the month, what was spent and the largest category, the rest in the app. */
export const MONTHLY_REPORT_TEMPLATE: ProductTemplate = {
  name: "smartspend_monthly_report",
  category: "UTILITY",
  definition: {
    name: "smartspend_monthly_report",
    language: TEMPLATE_LANGUAGE,
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "تقرير شهر {{1}} جاهز في SmartSpend. صرفت {{2}}، وأكبر بند كان {{3}}. التفاصيل كلها في التطبيق.",
        example: { body_text: [["أكتوبر 2026", "8,450 ج.م", "الأكل"]] },
      },
      { type: "FOOTER", text: "تقدر توقف التقارير من الإعدادات في التطبيق" },
    ],
  },
};

/** A payment the person planned is due: what it is, how much and when. */
export const PAYMENT_REMINDER_TEMPLATE: ProductTemplate = {
  name: "smartspend_payment_reminder",
  category: "UTILITY",
  definition: {
    name: "smartspend_payment_reminder",
    language: TEMPLATE_LANGUAGE,
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "تذكير من SmartSpend: {{1}} بمبلغ {{2}} ميعاده {{3}}.",
        example: { body_text: [["فاتورة الكهربا", "650 ج.م", "الخميس 5 نوفمبر"]] },
      },
      { type: "FOOTER", text: "تقدر توقف التذكيرات من الإعدادات في التطبيق" },
    ],
  },
};

export const PRODUCT_TEMPLATES: readonly ProductTemplate[] = [
  VERIFICATION_TEMPLATE,
  MONTHLY_REPORT_TEMPLATE,
  PAYMENT_REMINDER_TEMPLATE,
];

/** The message that sends a verification code: the code in the body and again in the copy button. */
export function verificationMessage(code: string): TemplateMessage {
  return {
    name: VERIFICATION_TEMPLATE.name,
    language: TEMPLATE_LANGUAGE,
    body: [code],
    buttons: [{ index: 0, subType: "url", parameter: code }],
  };
}
