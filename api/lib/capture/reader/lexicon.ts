/**
 * The words Egyptian bank, wallet and payment messages use, in Arabic and English, each with an id that shows up in
 * a reading's evidence. Phrases are written as people write them; they are folded the same way as the message
 * (normalize.ts) before matching, and matched as whole words: an Arabic phrase may carry an attached و ف ب ل لل or ال
 * in front ("وتم خصم", "بالرصيد"), a Latin one never sits inside a longer word ("pos" is not in "deposit").
 *
 * strength: 3 decides on its own, 2 is the usual verb, 1 only counts with other evidence.
 */
import { normalizeMessage, type NormalizedMessage } from "./normalize";

export type CueFamily =
  // what happened
  | "purchase"
  | "debit"
  | "atm"
  | "transfer_out"
  | "transfer_in"
  | "credit"
  | "salary"
  | "refund"
  | "declined"
  | "hold"
  | "fee"
  | "interest"
  | "cashback"
  | "bill"
  | "recharge"
  | "card_payment"
  | "installment"
  | "cash_deposit"
  | "statement"
  | "balance_inquiry"
  | "otp"
  | "promo"
  | "notice"
  | "subscription"
  // what a number is
  | "role_balance"
  | "role_limit"
  | "role_available"
  | "role_fee"
  | "role_min_due"
  | "role_total_due"
  | "role_equivalent"
  | "role_amount"
  // who the other side is
  | "cp_merchant"
  | "cp_to"
  | "cp_from"
  | "cp_own_account"
  // where a name or merchant ends
  | "stop";

export interface LexiconEntry {
  id: string;
  family: CueFamily;
  strength: 1 | 2 | 3;
  phrases: string[];
}

export const LEXICON: LexiconEntry[] = [
  // ─── What happened ───
  {
    id: "purchase.ar",
    family: "purchase",
    strength: 3,
    phrases: ["عملية شراء", "عمليه شراء", "تم الشراء", "شراء", "مشتريات", "نقاط البيع", "عملية دفع", "تم الدفع"],
  },
  { id: "purchase.en", family: "purchase", strength: 3, phrases: ["purchase", "pos purchase", "pos", "spent", "was charged for", "charged for", "a trx using card", "trx using card"] },
  { id: "purchase.en.paid", family: "purchase", strength: 2, phrases: ["paid", "payment of", "payment at"] },
  { id: "debit.ar", family: "debit", strength: 2, phrases: ["تم خصم", "خصم مبلغ", "خصم", "تم سحب مبلغ", "مدين"] },
  { id: "debit.en", family: "debit", strength: 2, phrases: ["debited", "has been debited", "was debited", "deducted", "charged"] },
  { id: "atm.ar", family: "atm", strength: 3, phrases: ["سحب نقدي", "سحب نقدى", "ماكينة الصراف", "ماكينة صراف", "الصراف الآلي", "صراف آلي", "ماكينة"] },
  { id: "atm.en", family: "atm", strength: 3, phrases: ["atm", "cash withdrawal", "withdrawn", "withdrawal"] },
  {
    id: "transfer_out.ar",
    family: "transfer_out",
    strength: 3,
    phrases: ["تحويل صادر", "حوالة صادرة", "تم تحويل", "قمت بتحويل", "حولت", "تم إرسال", "ارسلت", "أرسلت", "تم ارسال مبلغ"],
  },
  { id: "transfer_out.en", family: "transfer_out", strength: 3, phrases: ["transferred to", "transfer to", "you sent", "sent", "outgoing transfer", "money sent"] },
  {
    id: "transfer_in.ar",
    family: "transfer_in",
    strength: 3,
    phrases: ["تحويل وارد", "حوالة واردة", "تحويل لحظي", "تحويل لحظى", "استلمت", "تم استلام", "وصلك", "تم استقبال", "تم إضافة تحويل"],
  },
  { id: "transfer_in.en", family: "transfer_in", strength: 3, phrases: ["you received", "received", "incoming transfer", "transfer from", "money received"] },
  { id: "credit.ar", family: "credit", strength: 2, phrases: ["تم إيداع", "إيداع", "تمت إضافة", "تم إضافة", "إضافة مبلغ", "دائن", "تم قيد"] },
  { id: "credit.en", family: "credit", strength: 2, phrases: ["credited", "has been credited", "was credited", "deposited", "deposit"] },
  { id: "cash_deposit", family: "cash_deposit", strength: 3, phrases: ["إيداع نقدي", "ايداع نقدى", "cash deposit"] },
  { id: "salary", family: "salary", strength: 3, phrases: ["مرتب", "راتب", "salary", "payroll"] },
  { id: "refund", family: "refund", strength: 3, phrases: ["استرداد", "مرتجع", "استرجاع", "إلغاء عملية", "تم إلغاء", "refund", "refunded", "has been refunded", "reversal", "reversed", "returned"] },
  {
    id: "declined",
    family: "declined",
    strength: 3,
    phrases: ["مرفوضة", "مرفوضه", "تم رفض", "رفض", "لم تتم", "لم يتم", "غير مكتملة", "رصيد غير كاف", "رصيد غير كافي", "declined", "insufficient", "unsuccessful", "was not completed", "rejected", "failed"],
  },
  { id: "hold", family: "hold", strength: 3, phrases: ["حجز مبلغ", "تجميد مبلغ", "حجز", "pre-auth", "pre auth", "preauthorization", "pre-authorization", "authorization hold", "on hold"] },
  { id: "fee", family: "fee", strength: 2, phrases: ["رسوم", "مصاريف", "عمولة", "fee", "fees", "commission", "charges"] },
  { id: "interest", family: "interest", strength: 2, phrases: ["فوائد", "فوايد", "عائد", "interest"] },
  { id: "cashback", family: "cashback", strength: 3, phrases: ["كاش باك", "كاشباك", "cashback", "cash back"] },
  { id: "bill", family: "bill", strength: 2, phrases: ["سداد فاتورة", "دفع فاتورة", "فاتورة", "فوري", "bill payment", "bill"] },
  { id: "recharge", family: "recharge", strength: 2, phrases: ["شحن رصيد", "كارت شحن", "شحن", "recharge", "top up", "top-up", "topup"] },
  { id: "card_payment", family: "card_payment", strength: 3, phrases: ["سداد البطاقة", "سداد مستحقات", "سداد بطاقة الائتمان", "سداد مديونية", "payment received", "card payment", "payment to your card"] },
  { id: "installment", family: "installment", strength: 2, phrases: ["قسط", "أقساط", "تقسيط", "installment", "instalment"] },
  {
    id: "statement",
    family: "statement",
    strength: 3,
    phrases: ["كشف حساب", "الحد الأدنى للسداد", "الحد الادنى للسداد", "تاريخ الاستحقاق", "المبلغ المستحق", "minimum payment", "minimum due", "min due", "due date", "statement"],
  },
  { id: "balance_inquiry", family: "balance_inquiry", strength: 2, phrases: ["رصيدك الحالي", "رصيدك هو", "الرصيد الحالي", "رصيد حسابك", "your balance is", "balance inquiry", "current balance"] },
  {
    id: "otp",
    family: "otp",
    strength: 3,
    phrases: ["رمز التحقق", "كود التحقق", "رمز التفعيل", "كود التفعيل", "كلمة المرور لمرة واحدة", "رمز الدخول", "otp", "verification code", "one-time password", "one time password", "passcode", "activation code"],
  },
  { id: "promo", family: "promo", strength: 2, phrases: ["عرض", "عروض", "اشترك الآن", "اكسب", "فرصة", "هدية", "مجانا", "offer", "promo", "promotion", "win", "limited time", "subscribe now", "free"] },
  {
    id: "notice",
    family: "notice",
    strength: 2,
    phrases: ["تم تفعيل", "تم إيقاف", "تسجيل دخول", "تغيير كلمة المرور", "تم تحديث", "card blocked", "logged in", "login", "password changed", "activated", "has been blocked"],
  },
  { id: "subscription", family: "subscription", strength: 2, phrases: ["اشتراك", "تجديد", "subscription", "subscr", "renewal", "recurring", "membership"] },

  // ─── What a number is ───
  {
    id: "role.balance",
    family: "role_balance",
    strength: 3,
    phrases: ["الرصيد المتاح", "الرصيد الحالي", "الرصيد المتبقي", "رصيدك", "رصيد حسابك", "الرصيد", "رصيد", "available balance", "avl bal", "avail bal", "avl. bal", "new balance", "balance", "bal"],
  },
  { id: "role.limit", family: "role_limit", strength: 3, phrases: ["الحد المتاح", "الحد الائتماني", "حد البطاقة", "available limit", "credit limit", "avl limit", "limit"] },
  { id: "role.available", family: "role_available", strength: 2, phrases: ["المتاح", "متاح", "available", "avl"] },
  { id: "role.fee", family: "role_fee", strength: 3, phrases: ["رسوم", "مصاريف", "عمولة", "fee", "fees", "commission"] },
  { id: "role.min_due", family: "role_min_due", strength: 3, phrases: ["الحد الأدنى", "الحد الادنى", "minimum payment", "minimum due", "min due", "min. due"] },
  { id: "role.total_due", family: "role_total_due", strength: 3, phrases: ["المبلغ المستحق", "إجمالي المستحق", "total due", "statement balance", "outstanding"] },
  { id: "role.equivalent", family: "role_equivalent", strength: 3, phrases: ["ما يعادل", "بما يعادل", "يعادل", "equivalent to", "equivalent", "equiv"] },
  { id: "role.amount", family: "role_amount", strength: 1, phrases: ["بمبلغ", "مبلغ", "بقيمة", "قيمة", "وقدره", "قدره", "amount", "for", "of", "with"] },

  // ─── Who the other side is ───
  { id: "cp.merchant", family: "cp_merchant", strength: 2, phrases: ["عند", "لدى", "لدي", "في", "at", "from merchant"] },
  { id: "cp.to", family: "cp_to", strength: 2, phrases: ["إلى", "الى", "لرقم", "للرقم", "لـ", "لصالح", "للمستفيد", "to"] },
  { id: "cp.from", family: "cp_from", strength: 2, phrases: ["من", "from", "by"] },
  { id: "cp.own_account", family: "cp_own_account", strength: 3, phrases: ["لحسابكم", "لحسابك", "إلى حسابك", "في حسابك", "بحسابك", "to your account", "into your account", "your account"] },

  // ─── Where a name or a merchant ends ───
  {
    id: "stop",
    family: "stop",
    strength: 1,
    phrases: ["يوم", "بتاريخ", "تاريخ", "الساعة", "الساعه", "في تمام", "on", "date", "time", "via", "عبر", "عن طريق", "using", "with card", "باستخدام", "بإستخدام", "مقابل", "بواسطة", "رقم", "ref", "card", "بطاقة", "حساب", "account", "is", "has", "was", "على"],
  },
];

export interface CueMatch {
  id: string;
  family: CueFamily;
  strength: 1 | 2 | 3;
  /** Positions in the normalized message (not the original). */
  start: number;
  end: number;
}

const ARABIC = /[؀-ۿ]/;
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface CompiledEntry {
  entry: LexiconEntry;
  pattern: RegExp;
}

function compile(phrase: string): RegExp {
  const folded = normalizeMessage(phrase).fold;
  const body = folded
    .split(" ")
    .filter(Boolean)
    .map(escape)
    .join("\\s+");
  if (ARABIC.test(folded)) {
    // An attached و ف ب ل لل or ال may come first; no other letter may touch either end.
    return new RegExp(`(?<![\\p{L}\\p{N}])(?:لل|[وفبل]ال|ال|[وفبلك])?${body}(?![\\p{L}])`, "gu");
  }
  return new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`, "g");
}

const COMPILED: CompiledEntry[] = LEXICON.flatMap((entry) => entry.phrases.map((phrase) => ({ entry, pattern: compile(phrase) })));

/**
 * Words about what happened compete with each other ("payment received" is a card payment, not a transfer in; "تم إضافة
 * تحويل" is a transfer, not a deposit): the longer phrase wins. Words about a number's role, the other side, or where
 * a name ends are read independently ("الحد الأدنى" inside "الحد الأدنى للسداد" still names the minimum due).
 */
function groupOf(family: CueFamily): "event" | "role" | "counterparty" | "stop" {
  if (family.startsWith("role_")) return "role";
  if (family.startsWith("cp_")) return "counterparty";
  if (family === "stop") return "stop";
  return "event";
}

/**
 * Every lexicon phrase found in the message, longest first where two phrases of one family overlap ("تم خصم" over
 * "خصم"), so each word counts once per family.
 */
export function findCues(message: NormalizedMessage): CueMatch[] {
  const found: CueMatch[] = [];
  for (const { entry, pattern } of COMPILED) {
    pattern.lastIndex = 0;
    for (let match = pattern.exec(message.fold); match; match = pattern.exec(message.fold)) {
      found.push({ id: entry.id, family: entry.family, strength: entry.strength, start: match.index, end: match.index + match[0].length });
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const kept: CueMatch[] = [];
  for (const cue of found) {
    const covered = kept.some(
      (other) =>
        groupOf(other.family) === groupOf(cue.family) &&
        other.start <= cue.start &&
        other.end >= cue.end &&
        (other.family === cue.family || other.end - other.start > cue.end - cue.start),
    );
    if (!covered) kept.push(cue);
  }
  return kept;
}
