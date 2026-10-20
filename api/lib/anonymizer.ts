/**
 * Removes what identifies a person from a text before it leaves the server for a model: a bank or wallet message
 * (`api/lib/sms-ai-parser.ts`) and the expense lines a report prompt quotes (`api/ai-router.ts`). Egypt's data
 * protection law (151/2020) treats financial data as sensitive, so these never reach a model abroad: card and account
 * digits, IBANs, Egyptian phone numbers, reference numbers, e-mail addresses, one-time codes, and the names of the
 * people money went to or came from. Amounts, balances, fees, dates and merchants stay, because the model reads them.
 *
 * Each removal leaves a marker the model can still reason about (`[REDACTED_CARD]` says a card was named). The last
 * four digits of a card or account stay on the server (`redactWithFindings`), so the caller can fill them in after
 * the model answers without the model ever seeing them.
 *
 * Arabic letters are not word characters to JavaScript, so `\b` is useless here; boundaries are lookarounds on letters
 * and digits, and digits are matched in ASCII, Arabic-Indic and Persian forms.
 */

const D = "[0-9\\u0660-\\u0669\\u06F0-\\u06F9]";
const NO_DIGIT_BEFORE = `(?<!${D})`;
const NO_DIGIT_AFTER = `(?!${D})`;
/** Not inside another word or number. */
const START = "(?<![\\p{L}\\p{N}])";
/** A currency right after a number makes it an amount, which stays. */
const CURRENCY = "(?:EGP|LE|L\\.E\\.?|USD|EUR|GBP|SAR|AED|KWD|جنيه|جنية|جنيها|ج\\.م|جم|دولار|يورو|ريال|درهم|\\$)";
/** A number written with a decimal or thousands separator is an amount, not an identifier. */
const NOT_AN_AMOUNT = `(?![.,\\u066B\\u066C]${D})(?!\\s*${CURRENCY})`;

export interface RedactionFindings {
  /** Last four digits (ASCII) of each card or account the text named, in order of appearance, without repeats. */
  cardLast4: string[];
}

export interface RedactedText {
  text: string;
  findings: RedactionFindings;
}

export function asciiDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

/** Replaces the captured group, which every pattern here ends with, and keeps the words before it. */
function maskTail(match: string, group: string, marker: string): string {
  const at = match.lastIndexOf(group);
  return at < 0 ? match : match.slice(0, at) + marker + match.slice(at + group.length);
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** An IBAN: country, check digits, a bank code, then digits in groups of four (Egypt's is EG and 27 digits). */
const IBAN = new RegExp(
  `(?<![A-Za-z0-9])[A-Z]{2}${D}{2} ?[A-Z0-9]{4}(?: ?${D}{4}){1,6}(?: ?${D}{1,4})?(?![A-Za-z0-9])`,
  "gu",
);

/** An Egyptian mobile number, with or without the country code, with spaces or dashes between digits. */
const PHONE = new RegExp(
  `${NO_DIGIT_BEFORE}(?:(?:\\+|00)\\s?20[\\s-]?|0)1[0125](?:[\\s-]?${D}){8}${NO_DIGIT_AFTER}`,
  "gu",
);
/** The same number partly masked by the sender, e.g. 010****5678. */
const MASKED_PHONE = new RegExp(
  `${NO_DIGIT_BEFORE}(?:(?:\\+|00)\\s?20[\\s-]?|0)1[0125]${D}?[*xX•]{3,}${D}{2,4}${NO_DIGIT_AFTER}`,
  "gu",
);

/** Twelve or more digits in groups of four (a card or an account), read before phones so a group is not one. */
const GROUPED_NUMBER = new RegExp(`${NO_DIGIT_BEFORE}${D}{4}(?:[ -]${D}{4}){2,3}(?:[ -]${D}{1,4})?${NO_DIGIT_AFTER}`, "gu");
/** Twelve or more digits together: a card, an account or a national id. */
const LONG_NUMBER = new RegExp(`${NO_DIGIT_BEFORE}${D}{12,}${NO_DIGIT_AFTER}`, "gu");

/** A card or account masked by the bank except its last four digits: **1234, ****1234, XXXX-1234. */
const MASKED_CARD = new RegExp(`(?:[*•]{2,}|[xX]{4,})[\\s-]?(${D}{4})${NO_DIGIT_AFTER}`, "gu");

/** "ending with 1234", "ends in 1234", "last 4 digits 1234". */
const ENDING_EN = new RegExp(
  `${START}(?:(?:ending|ends|ended)(?:\\s+(?:with|in|by))?|last\\s+(?:4|four)\\s+digits?(?:\\s+(?:of|are|is))?)\\s*(?:no\\.?|number|#)?\\s*[:#-]?\\s*(${D}{4})${NO_DIGIT_AFTER}`,
  "giu",
);
/** "المنتهية ب 1234", "المنتهي برقم ١٢٣٤", "آخر 4 أرقام 1234". */
const ENDING_AR = new RegExp(
  `(?:(?:ال)?(?:منتهي[ةه]?|تنتهي|ينتهي)\\s*(?:بـ?|برقم|بالرقم|بالأرقام|بالارقام|بأرقام|بارقام)?|[آا]خر\\s+(?:${D}|أربع[ةه]?|اربع[ةه]?)\\s+(?:أرقام|ارقام))\\s*[:#-]?\\s*(${D}{4})${NO_DIGIT_AFTER}`,
  "gu",
);
/** The letters Arabic writes attached to a word: و، ف، ب، ل، لل ("بالبطاقة" is ب + البطاقة). */
const AR_PREFIX = "(?:[وفبل]|لل)?";
/** "card 1234", "بطاقة رقم 1234", "كارت ١٢٣٤", unless the four digits are an amount. */
const CARD_WORD = new RegExp(
  `${START}(?:(?:credit\\s+|debit\\s+|prepaid\\s+)?card|visa|mastercard|meeza|${AR_PREFIX}(?:بطاق[ةه]|بطاقتك|البطاق[ةه]|كارت|الكارت|كارتك|فيزا|ميزة))\\s*(?:no\\.?|number|رقم|برقم|#)?\\s*[:#-]?\\s*(${D}{4})${NO_DIGIT_AFTER}${NOT_AN_AMOUNT}`,
  "giu",
);
/** "account no. 123456", "حساب رقم 1234", "محفظة رقم 5678". */
const ACCOUNT_WORD = new RegExp(
  `${START}(?:account|acct|a\\/c|wallet|${AR_PREFIX}(?:حساب|حسابك|الحساب|محفظ[ةه]|محفظتك|المحفظ[ةه]))\\s*(?:no\\.?|number|رقم|برقم|#)\\s*[:#-]?\\s*(${D}{4,11})${NO_DIGIT_AFTER}${NOT_AN_AMOUNT}`,
  "giu",
);

/** A reference token holds at least one digit, and is taken whole (never the first digits of an amount). */
const TOKEN_CHAR = "[A-Za-z0-9\\u0660-\\u0669\\u06F0-\\u06F9-]";
const TOKEN = `((?=${TOKEN_CHAR}*${D})${TOKEN_CHAR}{4,})(?!${TOKEN_CHAR})${NOT_AN_AMOUNT}`;
const REFERENCE_EN = new RegExp(
  `${START}(?:(?:ref(?:erence)?|rrn|txn|trx|utr|stan)\\.?\\s*(?:id|no\\.?|number|code|#)?|(?:transaction|trans|auth(?:ori[sz]ation)?|approval|receipt|confirmation|trace|order|operation)\\s*(?:id|no\\.?|number|code|ref(?:erence)?|#))\\s*[:#.]?\\s*${TOKEN}`,
  "giu",
);
const REFERENCE_AR = new RegExp(
  `${START}(?:(?:ال)?رقم\\s*(?:ال)?مرجع(?:ي|ى)?|(?:ال)?مرجع(?:ي|ى)?|رقم\\s*(?:ال)?(?:عملي[ةه]|معامل[ةه]|حرك[ةه]|إيصال|ايصال|تحويل[ةه]?|طلب)|كود\\s*(?:ال)?(?:عملي[ةه]|تحويل))\\s*[:#.]?\\s*${TOKEN}`,
  "gu",
);

/** A one-time code: four to six digits soon after a code keyword. */
const OTP = new RegExp(
  `${START}(?:رمز|كود|التحقق|برقم|otp|code|verification|passcode|pin)[^0-9\\u0660-\\u0669\\u06F0-\\u06F9]{0,30}?${NO_DIGIT_BEFORE}(${D}{4,6})${NO_DIGIT_AFTER}`,
  "giu",
);

// ── Names ──
// A name is up to five words after a word that introduces a person: to, from, إلى, من, المستفيد, Dear… A Latin name
// word starts with a capital letter (banks write names "MOHAMED AHMED" or "Mohamed Ahmed"; a lowercase word after
// "to" is a verb). The first word that is not a name ends it: a preposition, an amount word, a bank or a wallet.

const NAME_LEAD =
  "(?:to|from|beneficiary|sender|recipient|receiver|dear|إلى|الى|إلي|الي|من|للسيد[ةه]?|السيد[ةه]?|الأستاذ[ةه]?|الاستاذ[ةه]?|عزيزي|عزيزتي|المستفيد|المرسل|المحول\\s+(?:إليه|اليه)|اسم\\s+(?:المستفيد|المرسل))";
// Diacritics first: a combining mark right after a letter inside a class reads as one character.
const ARABIC_WORD = "[\\u064B-\\u0652\\u0621-\\u063A\\u0641-\\u064A\\u0640]+";
const LATIN_WORD = "[A-Za-z][A-Za-z.'-]*";
const NAME_WORD = `(?:${ARABIC_WORD}|${LATIN_WORD})`;
const NAME = new RegExp(
  `${START}(?:${NAME_LEAD}\\s*[:،,]?\\s+|لـ\\s*)(${NAME_WORD}(?:\\s+${NAME_WORD}){0,5})`,
  "giu",
);

/** Words that may sit between the lead and the name: "إلى حساب Mohamed", "to Mr Ahmed". */
const NAME_CONNECTORS = new Set(["حساب", "محفظه", "account", "wallet", "mr", "mrs", "ms", "السيد", "السيده", "الاستاذ", "الاستاذه"]);

const LATIN_NOT_NAME = new Set(
  (
    "mr mrs ms via through thru on at for with by in of and or the a an your you my our their his her its this that " +
    "account acct card wallet number no successfully success amount egp le usd eur gbp sar aed ref reference " +
    "has have was were is are will been be date time balance available avl customer client valued sir madam " +
    "atm pos mobile phone transfer transferred payment purchase merchant cash back cashback fees fee charges " +
    "today yesterday please kindly dear team service services app online international local " +
    "bank instapay vodafone orange etisalat we cib nbe qnb hsbc aaib banque misr alex alexbank fawry meeza valu " +
    "paymob apple google visa mastercard nbk adib saib emirates faisal credit agricole ahly cairo"
  ).split(" "),
);

/** Folded the way the matcher compares (أإآ→ا, ة→ه, ى→ي, no tatweel or diacritics). */
function foldArabic(word: string): string {
  return word
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

const ARABIC_NOT_NAME = new Set(
  (
    "حساب محفظه السيد السيده الاستاذ الاستاذه " +
    "عبر بنجاح بمبلغ مبلغ المبلغ بقيمه قيمه رصيد الرصيد رصيدك في يوم اليوم بتاريخ تاريخ الساعه رقم برقم حسابك " +
    "حسابكم الحساب حسابي بطاقه بطاقتك البطاقه كارت الكارت كارتك محفظتك المحفظه ماكينه ماكينات الصراف صراف لدي " +
    "عن الي من و جنيه جنيها ج جم دولار يورو خلال بواسطه طريق انستاباي انستا فودافون اورنج اورانج اتصالات وي " +
    "البنك بنك بنكك فوري ميزه التحويل تحويل الخصم خصم ايداع الايداع سحب السحب شراء الشراء عمليه العمليه الرسوم " +
    "رسوم المتاح متاح شهر الشهر فضلك فضلكم قبل بعد الان تطبيق التطبيق خدمه خدمات العملاء عملاء العميل عميل " +
    "عميلنا نقاط النقاط كاش الكاش باك اجمالي حد الحد قسط القسط فاتوره الفاتوره شحن الشحن " +
    "باقه الباقه المرتب مرتب راتب الراتب هذا هذه ذلك تم برجاء يرجي نشكرك شكرا استخدام باستخدام مصر القاهره " +
    "الاهلي الاهلى مصرف المصرف التجاري الدولي فيزا ماستركارد الكتروني الالكتروني اونلاين داخل خارج"
  ).split(" "),
);

function isNameWord(word: string): boolean {
  if (/^[A-Za-z]/.test(word)) {
    return /^[A-Z]/.test(word) && !LATIN_NOT_NAME.has(word.toLowerCase().replace(/[.']/g, ""));
  }
  // The preposition على is compared as written: folded it is علي, which is also a name.
  return word !== "على" && !ARABIC_NOT_NAME.has(foldArabic(word));
}

function maskNames(text: string): string {
  return text.replace(NAME, (match, words: string) => {
    const list = words.split(/\s+/);
    let start = 0;
    const firstKey = /^[A-Za-z]/.test(list[0]) ? list[0].toLowerCase().replace(/\.$/, "") : foldArabic(list[0]);
    if (list.length > 1 && NAME_CONNECTORS.has(firstKey)) start = 1;
    let end = start;
    while (end < list.length && end - start < 5 && isNameWord(list[end])) end++;
    if (end === start) return match;
    const before = match.slice(0, match.length - words.length);
    const kept = list.slice(0, start);
    const rest = list.slice(end);
    return before + [...kept, "[REDACTED_NAME]", ...rest].join(" ");
  });
}

/** The redacted text, and the card endings it removed (kept on the server, never sent). */
export function redactWithFindings(text: string): RedactedText {
  const cardLast4: string[] = [];
  const keepLast4 = (digits: string) => {
    const last4 = asciiDigits(digits).slice(-4);
    if (last4.length === 4 && !cardLast4.includes(last4)) cardLast4.push(last4);
  };
  if (!text) return { text: "", findings: { cardLast4 } };

  let r = text;
  r = r.replace(EMAIL, "[REDACTED_EMAIL]");
  r = r.replace(IBAN, (match) => (match.replace(/ /g, "").length >= 15 ? "[REDACTED_IBAN]" : match));
  r = r.replace(GROUPED_NUMBER, (match) => {
    keepLast4(match.replace(/[ -]/g, ""));
    return "[REDACTED_ACCOUNT]";
  });
  r = r.replace(MASKED_PHONE, "[REDACTED_PHONE]");
  r = r.replace(PHONE, "[REDACTED_PHONE]");
  r = r.replace(LONG_NUMBER, "[REDACTED_ACCOUNT]");
  r = r.replace(MASKED_CARD, (match, digits: string) => {
    keepLast4(digits);
    return "[REDACTED_CARD]";
  });
  for (const pattern of [ENDING_EN, ENDING_AR, CARD_WORD]) {
    r = r.replace(pattern, (match, digits: string) => {
      keepLast4(digits);
      return maskTail(match, digits, "[REDACTED_CARD]");
    });
  }
  r = r.replace(ACCOUNT_WORD, (match, digits: string) => {
    keepLast4(digits);
    return maskTail(match, digits, "[REDACTED_ACCOUNT]");
  });
  for (const pattern of [REFERENCE_EN, REFERENCE_AR]) {
    r = r.replace(pattern, (match, token: string) => maskTail(match, token, "[REDACTED_REF]"));
  }
  r = r.replace(OTP, (match, code: string) => maskTail(match, code, "[REDACTED_OTP]"));
  // A name pass stops at the first word that is not a name, so "from AHMED to MOHAMED" needs a second one.
  for (let pass = 0; pass < 4; pass++) {
    const next = maskNames(r);
    if (next === r) break;
    r = next;
  }

  return { text: r, findings: { cardLast4 } };
}

export function redactSensitiveData(text: string): string {
  return redactWithFindings(text).text;
}
