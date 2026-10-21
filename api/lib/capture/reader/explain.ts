/**
 * "ليه اتسجلت كده؟": one Egyptian Arabic sentence, from a reading's own evidence, telling the user what the reader
 * saw. It names only what the message itself wrote, so the user can check it against the message on screen.
 */
import type { Money, Reading, ReaderKind } from "./types";

const KIND_LABELS: Partial<Record<ReaderKind, string>> = {
  card_purchase: "شراء بالكارت",
  online_purchase: "شراء أونلاين",
  international_purchase: "شراء بعملة أجنبية",
  atm_withdrawal: "سحب من ماكينة",
  cash_deposit: "إيداع كاش",
  transfer_out: "تحويل خارج",
  transfer_in: "تحويل داخل",
  wallet_send: "تحويل من المحفظة",
  wallet_receive: "فلوس وصلت المحفظة",
  bill_payment: "دفع فاتورة",
  mobile_recharge: "شحن رصيد",
  salary: "مرتب",
  refund: "فلوس رجعت",
  fee: "رسوم",
  interest: "فوايد",
  cashback: "كاش باك",
  card_payment: "سداد الكارت",
  installment: "قسط",
  declined: "عملية مرفوضة",
  pre_auth: "حجز مبلغ",
  statement_due: "ميعاد سداد",
  balance_only: "رصيد بس",
  otp: "كود تحقق",
  promo: "إعلان",
  account_notice: "تنبيه من البنك",
  other: "حركة فلوس",
};

const CURRENCY_LABELS: Record<string, string> = { EGP: "ج.م", USD: "دولار", EUR: "يورو", GBP: "جنيه استرليني", SAR: "ريال", AED: "درهم", KWD: "دينار" };

function amountText(value: Money): string {
  const number = value.value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `${number} ${CURRENCY_LABELS[value.currency] ?? value.currency}`;
}

export function explainReading(reading: Reading): string {
  const parts: string[] = [];
  const verb = reading.evidence.find((item) => item.kind === "verb");
  parts.push(verb?.span ? `لقينا «${verb.span.text.trim()}» يعني ${KIND_LABELS[reading.kind] ?? "حركة فلوس"}` : `دي ${KIND_LABELS[reading.kind] ?? "رسالة"}`);
  if (reading.amount) {
    parts.push(`المبلغ ${amountText(reading.amount)}${reading.amount.currencyInferred ? " (العملة مش مكتوبة فاعتبرناها جنيه)" : ""}`);
  }
  if (reading.amountEgp) parts.push(`يعني ${amountText(reading.amountEgp)}`);
  if (reading.counterparty?.type === "merchant" && reading.counterparty.name) parts.push(`التاجر ${reading.counterparty.name}`);
  if (reading.counterparty?.type === "person") {
    const who = reading.counterparty.name ?? (reading.counterparty.phoneTail ? `رقم آخره ${reading.counterparty.phoneTail}` : reading.counterparty.ipa);
    if (who) parts.push(reading.direction === "in" ? `من ${who}` : `لـ ${who}`);
  }
  if (reading.counterparty?.type === "own_account") parts.push("لحسابك إنت");
  if (reading.card) parts.push(`الكارت آخره ${reading.card.suffix}`);
  if (reading.balanceAfter) parts.push(`والرصيد بعدها ${amountText(reading.balanceAfter)}`);
  if (reading.availableLimit) parts.push(`والمتاح في الكارت ${amountText(reading.availableLimit)}`);
  return `${parts.join("، ")}.`;
}
