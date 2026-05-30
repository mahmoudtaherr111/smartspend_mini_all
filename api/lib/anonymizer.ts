/**
 * Egyptian Financial SMS Anonymizer — SmartSpend
 * ══════════════════════════════════════════════
 * Utility to redact sensitive user data (card numbers, bank accounts,
 * phone numbers, names, and OTPs) before database storage or external AI transit.
 */

export function redactSensitiveData(text: string): string {
  if (!text) return "";
  let r = text;

  // 1. Redact credit card / account masked formats (e.g., ****1234, ***1234, ending with 1234)
  r = r.replace(/\*{3,}\d{4}/g, "[REDACTED_CARD]");
  r = r.replace(
    /account ending with \d{4}/gi,
    "account ending with [REDACTED_CARD]",
  );
  r = r.replace(/حساب رقم \*{3,}\d{4}/g, "حساب رقم [REDACTED_CARD]");
  r = r.replace(/بطاقة رقم \*{3,}\d{4}/g, "بطاقة رقم [REDACTED_CARD]");

  // 2. Redact local and international mobile numbers (e.g., 01012345678, +201012345678, 011..., 012..., 015...)
  r = r.replace(/(?:\+?20)?0?1[0125]\d{8}\b/g, "[REDACTED_PHONE]");

  // 3. Redact full card/account numbers (12 to 19 digits)
  r = r.replace(/\b\d{12,19}\b/g, "[REDACTED_ACCOUNT_FULL]");

  // 4. Redact OTP / Verification codes (4 to 6 digits) when preceded by OTP keywords
  // (e.g., "رمز التحقق الخاص بك هو 5892", "code is 1234")
  const otpKeywords =
    /(?:رمز|كود|التحقق|برقم|otp|code|verification|passcode|pin)(?:[^\d]{1,30})?(\b\d{4,6}\b)/gi;
  r = r.replace(otpKeywords, (match, p1) =>
    match.replace(p1, "[REDACTED_OTP]"),
  );

  // 5. Redact P2P transaction names (Arabic & English templates)
  // "إلى Mohamed Ahmed عبر انستاباي" -> "إلى [REDACTED_NAME] عبر انستاباي"
  // "من Ahmed Ali عبر انستاباي" -> "من [REDACTED_NAME] عبر انستاباي"
  // "إلى حساب Mohamed Ahmed" -> "إلى حساب [REDACTED_NAME]"
  // "to Mohamed Ahmed via InstaPay" -> "to [REDACTED_NAME] via InstaPay"
  // "from Ahmed Ali via InstaPay" -> "from [REDACTED_NAME] via InstaPay"
  r = r.replace(
    /(?:إلى|الى|من|حساب|لرقم|لرقم محفظة)\s+([A-Za-z\s]{3,25})(?=\s+(?:عبر|بنجاح|via|through|$))/g,
    (match, p1) => {
      const name = p1.trim();
      if (
        /^(instapay|vodafone|orange|etisalat|cib|nbe|qnb|bank|egp|le|usd|eur)$/i.test(
          name,
        )
      ) {
        return match;
      }
      return match.replace(p1, "[REDACTED_NAME] ");
    },
  );

  r = r.replace(
    /(?:to|from)\s+([A-Za-z\s]{3,25})(?=\s+(?:via|through|successfully|$))/gi,
    (match, p1) => {
      const name = p1.trim();
      if (
        /^(instapay|vodafone|orange|etisalat|cib|nbe|qnb|bank|egp|le|usd|eur)$/i.test(
          name,
        )
      ) {
        return match;
      }
      return match.replace(p1, "[REDACTED_NAME] ");
    },
  );

  return r;
}
