/**
 * The typed pieces of a message: money, card and account suffixes, phone numbers, InstaPay addresses, dates, times,
 * references, one-time codes, links, percentages and bare numbers. Each finder is a small pattern with its own tests;
 * they run in a fixed order and a character belongs to the first piece that claims it, so a card suffix inside a
 * masked phone, the digits of a date or a reference never become an amount.
 *
 * Everything runs on the normalized `text` view (ASCII digits, original letters); positions are in that view.
 */
import { parseNumericLiteral } from "../../arabic-number-parser";
import type { NormalizedMessage } from "./normalize";

export type PieceKind =
  | "url"
  | "date"
  | "time"
  | "reference"
  | "ipa"
  | "phone"
  | "otp"
  | "card"
  | "account"
  | "money"
  | "percent"
  | "number";

interface BasePiece {
  start: number;
  end: number;
}
export type Piece = BasePiece &
  (
    | { kind: "url" }
    | { kind: "date"; day: number; month: number; year: number | null }
    | { kind: "time"; hour: number; minute: number }
    | { kind: "reference"; value: string }
    | { kind: "ipa"; address: string }
    | { kind: "phone"; phone: string | null; tail: string }
    | { kind: "otp"; code: string }
    | { kind: "card"; suffix: string }
    | { kind: "account"; suffix: string }
    | { kind: "money"; value: number; currency: string }
    | { kind: "percent" }
    | { kind: "number"; value: number }
  );

// ─── Currencies: the longest spelling is tried first ("جنيه استرليني" before "جنيه", "ج.م" before "ج") ───

const CURRENCY_SPELLINGS: [string, string[]][] = [
  ["GBP", ["جنيه استرليني", "GBP", "£"]],
  ["EGP", ["جنيه مصري", "EGP", "L.E.", "L.E", "LE", "جنيهاً", "جنيها", "جنيهات", "جنيه", "جنية", "ج.م.", "ج.م", "جم", "ج"]],
  ["USD", ["دولار أمريكي", "US$", "USD", "$", "دولارات", "دولار"]],
  ["EUR", ["EUR", "€", "يورو"]],
  ["SAR", ["ريال سعودي", "SAR", "ر.س", "ريال"]],
  ["AED", ["درهم إماراتي", "AED", "درهم"]],
  ["KWD", ["دينار كويتي", "KWD", "دينار"]],
];
const SPELLING_TO_ISO = new Map<string, string>();
for (const [iso, spellings] of CURRENCY_SPELLINGS) for (const spelling of spellings) SPELLING_TO_ISO.set(spelling.toLowerCase(), iso);
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const CURRENCY = `(${[...SPELLING_TO_ISO.keys()]
  .sort((a, b) => b.length - a.length)
  .map(escape)
  .join("|")})`;
/** 1,250.50 · 1250 · 118.00 · .93 */
const NUMBER = "(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?|\\.\\d+)";

function numberValue(raw: string): number {
  return raw.startsWith(".") ? Number(`0${raw}`) : parseNumericLiteral(raw);
}

const NOT_LETTER_BEFORE = "(?<![\\p{L}])";
const NOT_LETTER_AFTER = "(?![\\p{L}])";
const MONEY_BEFORE = new RegExp(`${NOT_LETTER_BEFORE}${CURRENCY}\\s?${NUMBER}(?![\\d])`, "giu");
const MONEY_AFTER = new RegExp(`(?<![\\d.,])${NUMBER}\\s?${CURRENCY}${NOT_LETTER_AFTER}`, "giu");

// ─── The other pieces ───

const URL = /(?:https?:\/\/|www\.)\S+|(?<![\p{L}])(?:bit\.ly|tinyurl\.com|t\.co)\/\S+/giu;
const DATE_NUMERIC = /(?<![\d/.-])(\d{4})-(\d{1,2})-(\d{1,2})(?![\d])|(?<![\d/.,-])(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?![\d/-])|(?<![\d/.,-])(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?![\d.])/g;
const MONTHS_EN = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTHS_AR: [number, string[]][] = [
  [1, ["يناير"]],
  [2, ["فبراير"]],
  [3, ["مارس"]],
  [4, ["أبريل", "ابريل", "إبريل"]],
  [5, ["مايو"]],
  [6, ["يونيو"]],
  [7, ["يوليو"]],
  [8, ["أغسطس", "اغسطس"]],
  [9, ["سبتمبر"]],
  [10, ["أكتوبر", "اكتوبر"]],
  [11, ["نوفمبر"]],
  [12, ["ديسمبر"]],
];
const DATE_MONTH_EN = /(?<![\d])(\d{1,2})[\s-]?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?(?:[\s-]?(\d{2,4}))?(?![a-z])/giu;
const DATE_MONTH_AR = new RegExp(
  `(?<![\\d])(\\d{1,2})\\s*(${MONTHS_AR.flatMap(([, names]) => names).join("|")})(?:\\s*(\\d{4}))?${NOT_LETTER_AFTER}`,
  "gu",
);
const TIME = /(?<![\d:])(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(am|pm|ص|م)(?![\p{L}]))?(?![\d])/giu;
const REFERENCE =
  /(?:رقم\s*(?:ال)?مرجع(?:ي|ى)?|(?:ال)?مرجع(?:ي|ى)?|رقم\s*(?:ال)?(?:عملي[ةه]|معامل[ةه]|حرك[ةه])|ref(?:erence)?(?:\s*(?:no\.?|number|#))?|trx\s*id|txn\s*(?:id|no\.?)?|transaction\s*(?:id|no\.?|number)|rrn)\s*[:#.]?\s*([a-z0-9-]*\d[a-z0-9-]{3,})/giu;
const IPA = /[a-z0-9._-]+@instapay(?![a-z0-9.])/giu;
const PHONE_FULL = /(?<![\d])(?:(?:\+|00)\s?20[\s-]?|0)1[0125](?:[\s-]?\d){8}(?![\d])/g;
const PHONE_MASKED = /(?<![\d])(?:(?:\+|00)\s?20[\s-]?|0)?1[0125]\d{0,2}[*xX•]{2,}\d{2,4}(?![\d])/g;
const OTP = /(?<![\p{L}])(?:رمز|كود|الرمز|الكود|otp|code|passcode|pin)(?![\p{L}])[^\d\n]{0,25}?(?<![\d])(\d{4,8})(?![\d])/giu;
const ACCOUNT_WORD =
  /(?<![\p{L}])(?:[وف])?(?:لحساب(?:ك|كم)?|بحساب(?:ك|كم)?|حساب(?:ك|كم)?|الحساب|account|a\/c|acct|محفظ[ةه]|محفظتك|المحفظ[ةه])\s*(?:رقم|no\.?|number|#|ending\s+(?:with|in))?\s*[:#]?\s*[*xX•]*\s*(\d{3,6}(?:-\d{2,6})?)(?!\d|[.,]\d)(?!\s*(?:egp|le|جم|ج\.م|جنيه|usd|\$))/giu;
const CARD_WORD =
  /(?:(?<![\p{L}])(?:[وفبل]|لل)?(?:ending\s+(?:with|in)|ends\s+(?:with|in)|card\s*(?:no\.?|number)?|المنتهي[ةه]?\s*(?:برقم|ب)?|بطاق[ةه](?:\s+(?:الائتمان|الخصم|الدفع المسبق|ميزة|المدفوعة مقدما))?\s*(?:رقم)?|بطاقتك\s*(?:رقم)?|كارت\s*(?:رقم)?))\s*[:#]?\s*[*xX•]*\s*(\d{3,4})(?!\d|[.,]\d)(?!\s*(?:egp|le|جم|ج\.م|جنيه|usd|\$))/giu;
const CARD_MASK = /(?:[*•]+|(?<![\p{L}])[xX]{2,}|#)[\s-]?(\d{3,4})(?!\d|[.,]\d)/gu;
const PERCENT = /\d+(?:\.\d+)?\s*%|%\s*\d+(?:\.\d+)?/g;
const BARE_NUMBER = /(?<![\d.,\p{L}])(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?![\d])/gu;

function validDate(day: number, month: number): boolean {
  return day >= 1 && day <= 31 && month >= 1 && month <= 12;
}

function fullYear(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw);
  return raw.length === 2 ? 2000 + value : value;
}

export function findPieces(message: NormalizedMessage): Piece[] {
  const { text } = message;
  const claimed = new Array<boolean>(text.length).fill(false);
  const pieces: Piece[] = [];
  const free = (start: number, end: number) => {
    for (let index = start; index < end; index++) if (claimed[index]) return false;
    return true;
  };
  const claim = (piece: Piece) => {
    for (let index = piece.start; index < piece.end; index++) claimed[index] = true;
    pieces.push(piece);
  };
  const each = (pattern: RegExp, onMatch: (match: RegExpExecArray) => Piece | null) => {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      if (!free(match.index, match.index + match[0].length)) continue;
      const piece = onMatch(match);
      if (piece) claim(piece);
    }
  };
  const at = (match: RegExpExecArray) => ({ start: match.index, end: match.index + match[0].length });

  each(URL, (match) => ({ kind: "url", ...at(match) }));
  each(REFERENCE, (match) => ({ kind: "reference", value: match[1], ...at(match) }));
  each(IPA, (match) => ({ kind: "ipa", address: match[0].toLowerCase(), ...at(match) }));
  each(DATE_NUMERIC, (match) => {
    if (match[1]) {
      const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
      return validDate(day, month) ? { kind: "date", day, month, year, ...at(match) } : null;
    }
    const day = Number(match[4] ?? match[7]);
    const month = Number(match[5] ?? match[8]);
    const year = fullYear(match[6] ?? match[9]);
    return validDate(day, month) ? { kind: "date", day, month, year, ...at(match) } : null;
  });
  each(DATE_MONTH_EN, (match) => {
    const day = Number(match[1]);
    const month = MONTHS_EN.indexOf(match[2].slice(0, 3).toLowerCase()) + 1;
    return validDate(day, month) ? { kind: "date", day, month, year: fullYear(match[3]), ...at(match) } : null;
  });
  each(DATE_MONTH_AR, (match) => {
    const day = Number(match[1]);
    const month = MONTHS_AR.find(([, names]) => names.includes(match[2]))?.[0] ?? 0;
    return validDate(day, month) ? { kind: "date", day, month, year: fullYear(match[3]), ...at(match) } : null;
  });
  each(TIME, (match) => {
    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const half = match[3]?.toLowerCase();
    if ((half === "pm" || half === "م") && hour < 12) hour += 12;
    if ((half === "am" || half === "ص") && hour === 12) hour = 0;
    return hour <= 23 && minute <= 59 ? { kind: "time", hour, minute, ...at(match) } : null;
  });
  each(PHONE_FULL, (match) => {
    const digits = match[0].replace(/\D/g, "").replace(/^(?:00)?20/, "0");
    return { kind: "phone", phone: digits, tail: digits.slice(-4), ...at(match) };
  });
  each(PHONE_MASKED, (match) => ({ kind: "phone", phone: null, tail: match[0].replace(/^.*[*xX•]/, ""), ...at(match) }));
  each(OTP, (match) => {
    const codeStart = match.index + match[0].lastIndexOf(match[1]);
    return free(codeStart, codeStart + match[1].length)
      ? { kind: "otp", code: match[1], start: codeStart, end: codeStart + match[1].length }
      : null;
  });
  each(ACCOUNT_WORD, (match) => ({ kind: "account", suffix: match[1].replace(/\D/g, "").slice(-4), ...at(match) }));
  each(CARD_WORD, (match) => ({ kind: "card", suffix: match[1], ...at(match) }));
  each(MONEY_BEFORE, (match) => ({
    kind: "money",
    currency: SPELLING_TO_ISO.get(match[1].toLowerCase()) ?? "EGP",
    value: numberValue(match[2]),
    ...at(match),
  }));
  each(MONEY_AFTER, (match) => ({
    kind: "money",
    currency: SPELLING_TO_ISO.get(match[2].toLowerCase()) ?? "EGP",
    value: numberValue(match[1]),
    ...at(match),
  }));
  each(CARD_MASK, (match) => ({ kind: "card", suffix: match[1], ...at(match) }));
  each(PERCENT, (match) => ({ kind: "percent", ...at(match) }));
  each(BARE_NUMBER, (match) => ({ kind: "number", value: numberValue(match[1]), ...at(match) }));

  return pieces.filter((piece) => piece.kind !== "money" || (Number.isFinite(piece.value) && piece.value > 0)).sort((a, b) => a.start - b.start);
}
