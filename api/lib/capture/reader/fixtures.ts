/**
 * The reader's benchmark corpus: messages built from the shapes Egyptian banks, wallets and payment apps send (CIB's
 * English card alerts, NBE's Arabic alerts and InstaPay credits, Arab Bank's "A Trx using Card", wallet transfers,
 * ATM, salary, bills, refunds, and the messages that are not transactions), each with what the reader must find.
 *
 * Everything here is written for this repository, which is public: no real message, card, phone or name. Real
 * messages, once their numbers are changed, are added as hand-written cases at the end.
 */
import type { CaptureSourceKind } from "../../../../contracts/capture";
import type { Direction, ReaderKind } from "./types";

export interface ReaderCase {
  id: string;
  group: string;
  text: string;
  sourceKind?: CaptureSourceKind;
  sourceSlug?: string;
  expect: {
    status: "transaction" | "not_transaction" | "unsure";
    kind: ReaderKind;
    direction?: Direction;
    amount?: number;
    currency?: string;
    amountEgp?: number;
    card?: string;
    account?: string;
    merchantKey?: string;
    counterpartyType?: "merchant" | "person" | "own_account";
    phoneTail?: string;
    ipa?: string;
    balance?: number;
    limit?: number;
    reference?: string;
  };
}

const MERCHANTS: { raw: string; key: string; online: boolean }[] = [
  { raw: "SAOOD MARKET", key: "saood market", online: false },
  { raw: "CARREFOUR MAADI 012", key: "carrefour", online: false },
  { raw: "SPINNEYS CITY STARS", key: "spinneys stars", online: false },
  { raw: "TALABAT EGYPT", key: "talabat", online: false },
  { raw: "UBER *TRIP HELP.UBER.COM", key: "uber trip uber", online: true },
  { raw: "NETFLIX.COM", key: "netflix", online: true },
  { raw: "OPENAI *CHATGPT SUBSCR", key: "openai chatgpt subscr", online: true },
  { raw: "CLAUDE.AI SUBSCRIPTION", key: "claude subscription", online: true },
  { raw: "GOOGLE *YouTube", key: "google youtube", online: true },
  { raw: "KASHIERFast", key: "kashierfast", online: false },
  { raw: "ZARA CITY STARS", key: "zara stars", online: false },
  { raw: "VODAFONE EGYPT", key: "vodafone", online: false },
];
const AMOUNTS = [118, 250.5, 1250, 49.99, 3200, 75.25, 15, 899, 12500, 6.5];
const CARDS = ["8016", "1111", "4421", "0973", "5521", "2020", "7788", "3321"];
const NAMES_AR = ["محمد محمد", "أحمد علي", "سارة حسن", "منى إبراهيم", "خالد سعيد"];
const NAMES_EN = ["MOHAMED ALI", "SARA HASSAN", "AHMED SAEED", "MONA IBRAHIM"];
const PHONES = ["01012345678", "01198765432", "01234567890", "01555123456"];

const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pick = <T>(list: T[], index: number) => list[index % list.length];

function build(): ReaderCase[] {
  const cases: ReaderCase[] = [];
  const add = (group: string, item: Omit<ReaderCase, "id" | "group">) =>
    cases.push({ id: `${group}-${String(cases.filter((c) => c.group === group).length + 1).padStart(3, "0")}`, group, ...item });

  // CIB, English, credit card, in pounds and in dollars; twice, with other amounts, cards and days.
  for (const round of [0, 1]) MERCHANTS.forEach((merchant, base) => {
    const index = base + round * 5;
    for (const currency of ["EGP", "USD"]) {
      const amount = pick(AMOUNTS, index + (currency === "USD" ? 3 : 0));
      const card = pick(CARDS, index);
      const kind: ReaderKind = currency !== "EGP" ? "international_purchase" : merchant.online ? "online_purchase" : "card_purchase";
      add("cib-en", {
        text: `Your credit card ending with#${card} was charged for ${currency} ${money(amount)} at ${merchant.raw} on ${10 + (index % 18)}/11/25 at 1${index % 10}:2${index % 6}. Card available limit is EGP ${money(20000 - amount)}`,
        expect: { status: "transaction", kind, direction: "out", amount, currency, card, merchantKey: merchant.key, counterpartyType: "merchant", limit: Number((20000 - amount).toFixed(2)) },
      });
    }
  });

  // NBE, Arabic, credit card and debit card at a merchant; twice.
  for (const round of [0, 1]) MERCHANTS.forEach((merchant, base) => {
    const index = base + round * 3;
    const amount = pick(AMOUNTS, index + 1);
    const card = pick(CARDS, index + 2);
    const kind: ReaderKind = merchant.online ? "online_purchase" : "card_purchase";
    add("nbe-ar-credit", {
      text: `تم خصم ${money(amount)} جم من بطاقة الائتمان رقم ${card} عند ${merchant.raw} يوم ${String(1 + (index % 28)).padStart(2, "0")}-10 الساعة 1${index % 10}:0${index % 6} المتاح ${money(9000)} جم`,
      expect: { status: "transaction", kind, direction: "out", amount, currency: "EGP", card, merchantKey: merchant.key, limit: 9000 },
    });
    add("nbe-ar-debit", {
      text: `تم خصم EGP ${money(amount)} من بطاقتك رقم ${card} عند ${merchant.raw} المتاح EGP ${money(4500.75)}`,
      expect: { status: "transaction", kind, direction: "out", amount, currency: "EGP", card, merchantKey: merchant.key, balance: 4500.75 },
    });
  });

  // Arab Bank, English "A Trx using Card".
  MERCHANTS.slice(0, 8).forEach((merchant, index) => {
    const amount = pick(AMOUNTS, index + 4);
    const card = pick(CARDS, index + 1);
    add("arab-bank-en", {
      text: `A Trx using Card XXXX${card} from ${merchant.raw} for EGP ${money(amount)} on ${String(5 + index).padStart(2, "0")}/10/2025. Avl Bal EGP ${money(7000)}`,
      expect: { status: "transaction", kind: merchant.online ? "online_purchase" : "card_purchase", direction: "out", amount, card, merchantKey: merchant.key, balance: 7000 },
    });
  });

  // A foreign charge with its pound equivalent, in Arabic.
  MERCHANTS.filter((merchant) => merchant.online).forEach((merchant, index) => {
    const amount = pick([20, 9.99, 15, 99.99, 5], index);
    const egp = Number((amount * 50.5).toFixed(2));
    add("fx-ar", {
      text: `تم خصم USD ${money(amount)} بما يعادل EGP ${money(egp)} من بطاقتك المنتهية ب ${pick(CARDS, index)} لدى ${merchant.raw}`,
      expect: { status: "transaction", kind: "international_purchase", direction: "out", amount, currency: "USD", amountEgp: egp, card: pick(CARDS, index), merchantKey: merchant.key },
    });
  });

  // InstaPay credits (NBE style) and transfers out.
  NAMES_AR.forEach((name, index) => {
    const amount = pick(AMOUNTS, index + 2);
    const reference = String(123456789012 + index * 7);
    add("instapay-in-ar", {
      text: `تم إضافة تحويل لحظي لحسابكم رقم ${pick(["4444", "1290", "7310"], index)} بمبلغ ${money(amount)} جم من ${name} رقم مرجعي ${reference} يوم 09-10 الساعة 20:1${index}`,
      expect: { status: "transaction", kind: "transfer_in", direction: "in", amount, counterpartyType: "person", reference },
    });
    add("instapay-out-ar", {
      text: `تم تحويل ${money(amount)} جنيه إلى ${name} عبر انستاباي رقم مرجعي ${reference}`,
      sourceKind: "payment_network",
      sourceSlug: "instapay",
      expect: { status: "transaction", kind: "transfer_out", direction: "out", amount, counterpartyType: "person", reference },
    });
  });
  NAMES_EN.forEach((name, index) => {
    const amount = pick(AMOUNTS, index + 5);
    add("instapay-en", {
      text: `You received EGP ${money(amount)} from ${name} via InstaPay. Ref: 88${index}412300`,
      sourceKind: "payment_network",
      sourceSlug: "instapay",
      expect: { status: "transaction", kind: "transfer_in", direction: "in", amount, counterpartyType: "person" },
    });
    add("instapay-ipa", {
      text: `تم تحويل ${money(amount)} جنيه إلى user${index}.pay@instapay بنجاح`,
      sourceKind: "payment_network",
      sourceSlug: "instapay",
      expect: { status: "transaction", kind: "transfer_out", direction: "out", amount, ipa: `user${index}.pay@instapay` },
    });
  });

  // Wallets: send to and receive from a number, full and masked.
  PHONES.forEach((phone, index) => {
    const amount = pick(AMOUNTS, index + 6);
    add("wallet-send", {
      text: `تم تحويل ${amount} جنيه لرقم ${phone} بنجاح. رصيدك الحالي ${money(1500 - (index * 100))} جنيه`,
      sourceKind: "wallet",
      sourceSlug: "vodafone_cash",
      expect: { status: "transaction", kind: "wallet_send", direction: "out", amount, phoneTail: phone.slice(-4), balance: 1500 - index * 100 },
    });
    const masked = `${phone.slice(0, 3)}****${phone.slice(-4)}`;
    add("wallet-receive", {
      text: `تم استلام ${amount} جنيه من رقم ${masked}. رصيدك ${money(2000)} جنيه`,
      sourceKind: "wallet",
      sourceSlug: "vodafone_cash",
      expect: { status: "transaction", kind: "wallet_receive", direction: "in", amount, phoneTail: phone.slice(-4), balance: 2000 },
    });
  });

  // ATM, in Arabic and English.
  [1000, 2500, 500, 4000].forEach((amount, index) => {
    add("atm-ar", {
      text: `تم سحب نقدي ${money(amount)} جنيه من ماكينة الصراف ببطاقتك رقم ${pick(CARDS, index)}. الرصيد المتاح ${money(8000 - amount)} جنيه`,
      expect: { status: "transaction", kind: "atm_withdrawal", direction: "out", amount, card: pick(CARDS, index), balance: 8000 - amount },
    });
    add("atm-en", {
      text: `EGP ${money(amount)} withdrawn from ATM using card **${pick(CARDS, index + 1)} on 12/10/2025 14:3${index}. Avl Bal EGP ${money(9000 - amount)}`,
      expect: { status: "transaction", kind: "atm_withdrawal", direction: "out", amount, card: pick(CARDS, index + 1), balance: 9000 - amount },
    });
  });

  // Salary, Arabic and English.
  [12500, 18000, 9750.5].forEach((amount, index) => {
    add("salary", {
      text: `تم إيداع مرتب بمبلغ ${money(amount)} جنيه في حسابك رقم ***${pick(CARDS, index)}`,
      expect: { status: "transaction", kind: "salary", direction: "in", amount },
    });
    add("salary-en", {
      text: `Your account XX${pick(CARDS, index + 2)} has been credited with EGP ${money(amount)} salary for October`,
      expect: { status: "transaction", kind: "salary", direction: "in", amount, account: pick(CARDS, index + 2) },
    });
  });

  // Refunds.
  MERCHANTS.slice(0, 6).forEach((merchant, index) => {
    const amount = pick([0.93, 45, 120.5, 12, 300, 18.75], index);
    const currency = pick(["EUR", "EGP", "USD"], index);
    const text = `The transaction on your credit card#${pick(CARDS, index)} from ${merchant.raw} with ${currency} ${amount < 1 ? String(amount).slice(1) : money(amount)} on 02/11/25 has been refunded`;
    add("refund-en", { text, expect: { status: "transaction", kind: "refund", direction: "in", amount, currency, merchantKey: merchant.key } });
  });

  // Bills, recharges, fees.
  [["كهرباء", 450], ["مياه", 120], ["غاز", 85.5], ["إنترنت", 610]].forEach(([what, amount], index) => {
    add("bill", {
      text: `تم سداد فاتورة ${what} بمبلغ ${money(amount as number)} جنيه عبر فوري. رقم العملية 55${index}9012`,
      expect: { status: "transaction", kind: "bill_payment", direction: "out", amount: amount as number },
    });
  });
  [50, 100, 25].forEach((amount) => {
    add("recharge", {
      text: `تم شحن رصيد بمبلغ ${amount} جنيه بنجاح`,
      expect: { status: "transaction", kind: "mobile_recharge", direction: "out", amount },
    });
  });
  [5, 20, 3.5].forEach((amount) => {
    add("fee", {
      text: `تم خصم رسوم ${money(amount)} جم من حسابك رقم ***4421`,
      expect: { status: "transaction", kind: "fee", direction: "out", amount },
    });
  });

  // A general Arabic bank debit and credit, with the account masked; twice.
  for (const round of [0, 1]) MERCHANTS.forEach((merchant, base) => {
    const index = base + round * 7;
    const amount = pick(AMOUNTS, index + 7);
    const account = pick(CARDS, index + 3);
    add("bank-ar-debit", {
      text: `عميلنا العزيز، تم خصم مبلغ ${money(amount)} جنيه من حسابك رقم ***${account} لدى ${merchant.raw} بتاريخ ${String(1 + (index % 27)).padStart(2, "0")}/10/2025. الرصيد المتاح ${money(6100.4)} جنيه`,
      expect: { status: "transaction", kind: merchant.online ? "online_purchase" : "card_purchase", direction: "out", amount, account, merchantKey: merchant.key, balance: 6100.4 },
    });
    add("bank-en-debit", {
      text: `Dear Customer, your account **${account} has been debited by EGP ${money(amount)} at ${merchant.raw} on ${String(1 + (index % 27)).padStart(2, "0")}-Oct-2025. Avl Bal EGP ${money(3050)}`,
      expect: { status: "transaction", kind: merchant.online ? "online_purchase" : "card_purchase", direction: "out", amount, merchantKey: merchant.key, balance: 3050 },
    });
  });
  NAMES_AR.forEach((name, index) => {
    const amount = pick(AMOUNTS, index + 1);
    add("bank-ar-credit", {
      text: `تم إيداع مبلغ ${money(amount)} جنيه في حسابك رقم ***${pick(CARDS, index)} تحويل وارد من ${name}`,
      expect: { status: "transaction", kind: "transfer_in", direction: "in", amount, counterpartyType: "person" },
    });
    add("bank-ar-out", {
      text: `تم تحويل مبلغ ${money(amount)} جنيه من حسابك رقم ***${pick(CARDS, index + 1)} إلى ${name}. الرصيد المتاح ${money(4200)} جنيه`,
      expect: { status: "transaction", kind: "transfer_out", direction: "out", amount, counterpartyType: "person", balance: 4200 },
    });
  });

  // Wallet wordings beyond "تحويل".
  PHONES.forEach((phone, index) => {
    const amount = pick(AMOUNTS, index + 2);
    add("wallet-sent-ar", {
      text: `تم إرسال ${amount} جنيه إلى رقم ${phone}. رسوم الخدمة 1 جنيه. رصيدك ${money(990)} جنيه`,
      sourceKind: "wallet",
      sourceSlug: "etisalat_cash",
      expect: { status: "transaction", kind: "wallet_send", direction: "out", amount, phoneTail: phone.slice(-4), balance: 990 },
    });
    add("wallet-got-ar", {
      text: `استلمت ${amount} جنيه من ${phone}. رصيدك الحالي ${money(1250)} جنيه`,
      sourceKind: "wallet",
      sourceSlug: "orange_cash",
      expect: { status: "transaction", kind: "wallet_receive", direction: "in", amount, phoneTail: phone.slice(-4), balance: 1250 },
    });
    add("wallet-sent-en", {
      text: `You have sent EGP ${money(amount)} to ${phone}. Your balance is EGP ${money(400)}`,
      sourceKind: "wallet",
      sourceSlug: "we_pay",
      expect: { status: "transaction", kind: "wallet_send", direction: "out", amount, phoneTail: phone.slice(-4), balance: 400 },
    });
  });

  // Arabic-Indic digits, as some phones and banks write them.
  MERCHANTS.slice(0, 6).forEach((merchant, index) => {
    const amount = pick(AMOUNTS, index + 2);
    const indic = (value: string) => value.replace(/\d/g, (digit) => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]).replace(/,/g, "٬").replace(/\./g, "٫");
    add("indic", {
      text: `تم خصم ${indic(money(amount))} جنيه من بطاقتك رقم ${indic(pick(CARDS, index))} عند ${merchant.raw}`,
      expect: { status: "transaction", kind: merchant.online ? "online_purchase" : "card_purchase", amount, card: pick(CARDS, index), merchantKey: merchant.key },
    });
  });

  // More wordings of a purchase, refunds in Arabic, bills and recharges in English.
  MERCHANTS.forEach((merchant, index) => {
    const amount = pick(AMOUNTS, index + 5);
    const card = pick(CARDS, index + 4);
    const kind: ReaderKind = merchant.online ? "online_purchase" : "card_purchase";
    add("pos-en", {
      text: `POS purchase of EGP ${money(amount)} at ${merchant.raw} with card ending in ${card} on ${String(3 + (index % 25)).padStart(2, "0")}/09/2025 21:0${index % 10}`,
      expect: { status: "transaction", kind, direction: "out", amount, card, merchantKey: merchant.key },
    });
    add("paid-ar", {
      text: `تم الدفع بمبلغ ${money(amount)} ج.م لدى ${merchant.raw} باستخدام بطاقة رقم ${card}`,
      expect: { status: "transaction", kind, direction: "out", amount, card, merchantKey: merchant.key },
    });
    add("cib-en-debit", {
      text: `Your debit card ending with#${card} was charged for EGP ${money(amount * 2)} at ${merchant.raw} on 0${1 + (index % 9)}/12/25 at 08:1${index % 10}. Available balance is EGP ${money(5000)}`,
      expect: { status: "transaction", kind, direction: "out", amount: Number((amount * 2).toFixed(2)), card, merchantKey: merchant.key, balance: 5000 },
    });
  });
  MERCHANTS.slice(0, 6).forEach((merchant, index) => {
    const amount = pick(AMOUNTS, index + 3);
    add("refund-ar", {
      text: `تم استرداد مبلغ ${money(amount)} جنيه من ${merchant.raw} إلى بطاقتك رقم ${pick(CARDS, index)}`,
      expect: { status: "transaction", kind: "refund", direction: "in", amount, merchantKey: merchant.key, card: pick(CARDS, index) },
    });
  });
  [["Electricity", 450], ["Internet", 610], ["Water", 95]].forEach(([what, amount]) =>
    add("bill-en", {
      text: `Bill payment of EGP ${money(amount as number)} for ${what} via Fawry was successful. Ref: 77${amount}0019`,
      expect: { status: "transaction", kind: "bill_payment", direction: "out", amount: amount as number },
    }),
  );
  [50, 100].forEach((amount) =>
    add("recharge-en", {
      text: `Recharge of EGP ${amount} for 01012345678 was successful`,
      expect: { status: "transaction", kind: "mobile_recharge", direction: "out", amount },
    }),
  );
  NAMES_EN.forEach((name, index) => {
    const amount = pick(AMOUNTS, index + 8);
    add("transfer-en", {
      text: `EGP ${money(amount)} has been transferred to ${name} from your account **${pick(CARDS, index)}. Ref: 4410${index}93`,
      expect: { status: "transaction", kind: "transfer_out", direction: "out", amount, counterpartyType: "person" },
    });
    add("received-en", {
      text: `Your account **${pick(CARDS, index + 1)} has been credited with EGP ${money(amount)} transfer from ${name}`,
      expect: { status: "transaction", kind: "transfer_in", direction: "in", amount, counterpartyType: "person" },
    });
  });

  // Not transactions.
  ["482915", "773910", "120044"].forEach((code) => {
    add("otp", { text: `رمز التحقق ${code} لا تشاركه مع أي حد`, expect: { status: "not_transaction", kind: "otp" } });
    add("otp-en", { text: `Your OTP for EGP 500.00 purchase at NOON is ${code}. Do not share it`, expect: { status: "not_transaction", kind: "otp" } });
  });
  MERCHANTS.slice(0, 5).forEach((merchant, index) => {
    add("declined", {
      text: `تم رفض عملية شراء بمبلغ ${money(pick(AMOUNTS, index))} جنيه لدى ${merchant.raw} لعدم كفاية الرصيد`,
      expect: { status: "not_transaction", kind: "declined" },
    });
    add("declined-en", {
      text: `Your card ending with ${pick(CARDS, index)} transaction of EGP ${money(pick(AMOUNTS, index))} at ${merchant.raw} was declined due to insufficient funds`,
      expect: { status: "not_transaction", kind: "declined" },
    });
  });
  ["خصم 50% على كل المشتريات بالكارت لحد آخر الشهر! اعرف أكتر www.bank.example", "اكسب كاش باك 10% مع كارتك. اشترك الآن", "Enjoy 20% off at partner stores, limited time offer: https://bit.ly/xyz"].forEach((text) =>
    add("promo", { text, expect: { status: "not_transaction", kind: "promo" } }),
  );
  ["رصيدك الحالي 1,250.00 جم", "Your balance is EGP 3,400.10"].forEach((text) =>
    add("balance", { text, expect: { status: "not_transaction", kind: "balance_only" } }),
  );
  add("statement", { text: "كشف حساب بطاقتك: الحد الأدنى للسداد 1,500 جم تاريخ الاستحقاق 25/10", expect: { status: "not_transaction", kind: "statement_due" } });
  add("statement", { text: "Your statement is ready. Minimum due EGP 850.00, due date 28/10/2025", expect: { status: "not_transaction", kind: "statement_due" } });
  add("notice", { text: "تم تفعيل خدمة الإنترنت البنكي لحسابك بنجاح", expect: { status: "not_transaction", kind: "account_notice" } });
  add("notice", { text: "Login to your mobile banking app was successful", expect: { status: "not_transaction", kind: "account_notice" } });

  return cases;
}

export const READER_CASES: ReaderCase[] = build();
