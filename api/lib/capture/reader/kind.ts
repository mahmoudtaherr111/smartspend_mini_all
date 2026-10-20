/**
 * What kind of message it is and which way the money went, from the words it uses (lexicon.ts), the pieces it holds
 * (spans.ts) and, when known, the kind of source that sent it (a wallet's "تم تحويل" is a wallet send).
 *
 * Messages that are not a transaction are recognised first, because they often carry money words too: a one-time
 * code, a declined payment, a hold, a promotion, a statement, a balance, an account notice. Then the strongest money
 * verb decides; when an outgoing and an incoming verb are equally strong in the amount's sentence, the reading is
 * unsure and the model reads it.
 */
import type { CaptureSourceKind } from "../../../../contracts/capture";
import type { Clause } from "./clauses";
import { clauseAt } from "./clauses";
import type { CueFamily, CueMatch } from "./lexicon";
import type { NormalizedMessage } from "./normalize";
import type { Piece } from "./spans";
import type { Direction, ReaderKind } from "./types";

export interface EventDecision {
  status: "transaction" | "not_transaction" | "unsure";
  kind: ReaderKind;
  direction: Direction | null;
  /** The verb that decided, when one did. */
  main: CueMatch | null;
  reasons: string[];
  rules: string[];
}

const OUTGOING: CueFamily[] = ["purchase", "debit", "atm", "transfer_out", "bill", "recharge", "card_payment", "installment", "fee"];
const INCOMING: CueFamily[] = ["credit", "transfer_in", "salary", "refund", "cashback", "cash_deposit"];
const SIDE_NEUTRAL: CueFamily[] = ["interest"];

/** "لحسابك" and "to your account" put money into the user's account; "من حسابك" and "from your account" take it out. */
export function ownAccountSide(message: NormalizedMessage, cues: CueMatch[]): "into" | "out_of" | null {
  for (const cue of cues.filter((item) => item.family === "cp_own_account")) {
    const before = message.fold.slice(Math.max(0, cue.start - 6), cue.start);
    const phrase = message.fold.slice(cue.start, cue.end);
    if (/(?:^|\s)(?:من|from)\s*$/.test(before)) return "out_of";
    if (phrase.includes("your account") && !phrase.includes("to your") && !phrase.includes("into your")) continue;
    return "into";
  }
  return null;
}

interface DecideInput {
  message: NormalizedMessage;
  cues: CueMatch[];
  pieces: Piece[];
  clauses: Clause[];
  sourceKind: CaptureSourceKind | null;
  sourceSlug: string | null;
}

const has = (cues: CueMatch[], family: CueFamily) => cues.some((cue) => cue.family === family);
const strongest = (cues: CueMatch[], family: CueFamily) =>
  cues.filter((cue) => cue.family === family).sort((a, b) => b.strength - a.strength || a.start - b.start)[0] ?? null;

export function decideEvent({ message, cues, pieces, clauses, sourceKind, sourceSlug }: DecideInput): EventDecision {
  const events = cues.filter((cue) => !cue.family.startsWith("role_") && !cue.family.startsWith("cp_") && cue.family !== "stop");
  const money = pieces.filter((piece) => piece.kind === "money");
  const hasMoney = money.length > 0;
  const moneyClauses = new Set<number | undefined>(money.map((piece) => clauseAt(clauses, piece.start)?.index).filter((index) => index !== undefined));
  const rules: string[] = [];
  const not = (kind: ReaderKind, main: CueMatch | null, reason: string): EventDecision => ({
    status: "not_transaction",
    kind,
    direction: null,
    main,
    reasons: [reason],
    rules,
  });

  // ─── Not a transaction ───
  if (pieces.some((piece) => piece.kind === "otp") && (has(events, "otp") || !hasMoney)) return not("otp", strongest(events, "otp"), "otp_code");
  if (has(events, "otp") && !hasMoney) return not("otp", strongest(events, "otp"), "otp_words");
  // "Your OTP for EGP 500.00 purchase … is 773910": a code word and a whole number of four to eight digits.
  const codeNumber = pieces.some((piece) => piece.kind === "number" && Number.isInteger(piece.value) && piece.value >= 1000 && piece.value < 1e8);
  if (has(events, "otp") && codeNumber) return not("otp", strongest(events, "otp"), "otp_code");
  if (has(events, "declined")) return not("declined", strongest(events, "declined"), "declined");
  if (has(events, "hold") && !has(events, "refund")) return not("pre_auth", strongest(events, "hold"), "hold");
  const transactionVerbs = events.filter((cue) => [...OUTGOING, ...INCOMING, ...SIDE_NEUTRAL].includes(cue.family));
  const moneyVerb = transactionVerbs.some((cue) => moneyClauses.has(clauseAt(clauses, cue.start)?.index));
  const promoSigns = pieces.some((piece) => piece.kind === "url" || piece.kind === "percent");
  if ((has(events, "promo") && (promoSigns || !moneyVerb)) || (promoSigns && !moneyVerb)) {
    return not("promo", strongest(events, "promo"), "promotion");
  }
  if (has(events, "statement") && !has(events, "card_payment")) return not("statement_due", strongest(events, "statement"), "statement");
  if (!moneyVerb && has(events, "balance_inquiry") && hasMoney) return not("balance_only", strongest(events, "balance_inquiry"), "balance_only");
  if (!moneyVerb && !hasMoney && has(events, "notice")) return not("account_notice", strongest(events, "notice"), "notice");
  if (!moneyVerb && hasMoney && !transactionVerbs.length && cues.some((cue) => cue.family === "role_balance")) {
    return not("balance_only", null, "balance_only");
  }

  // ─── Which verb decides ───
  const score = (cue: CueMatch) => cue.strength * 10 + (moneyClauses.has(clauseAt(clauses, cue.start)?.index) ? 5 : 0);
  const best = (families: CueFamily[]) =>
    transactionVerbs.filter((cue) => families.includes(cue.family)).sort((a, b) => score(b) - score(a) || a.start - b.start)[0] ?? null;
  const out = best(OUTGOING);
  const inc = best(INCOMING);
  const side = ownAccountSide(message, cues);

  let main: CueMatch | null = null;
  if (has(events, "refund")) {
    main = strongest(events, "refund");
    rules.push("refund_over_purchase");
  } else if (has(events, "card_payment")) {
    main = strongest(events, "card_payment");
  } else if (out && inc) {
    if (out.family === "transfer_out" && side === "into") {
      main = out;
      rules.push("transfer_into_own_account");
    } else if (score(out) === score(inc)) {
      return { status: "unsure", kind: "other", direction: null, main: null, reasons: ["conflicting_verbs"], rules };
    } else {
      main = score(out) > score(inc) ? out : inc;
    }
  } else {
    main = out ?? inc ?? best(SIDE_NEUTRAL);
  }
  if (!main) {
    return hasMoney
      ? { status: "unsure", kind: "other", direction: null, main: null, reasons: ["no_verb"], rules }
      : not("other", null, "no_money");
  }

  // ─── Kind and direction ───
  const wallet = sourceKind === "wallet";
  const instapay = sourceSlug === "instapay";
  const atm = has(events, "atm");
  switch (main.family) {
    case "refund":
      return tx("refund", "in", main, rules);
    case "card_payment":
      return tx("card_payment", "out", main, rules);
    case "atm":
      return tx(has(events, "cash_deposit") ? "cash_deposit" : "atm_withdrawal", has(events, "cash_deposit") ? "in" : "out", main, rules);
    case "cash_deposit":
      return tx("cash_deposit", "in", main, rules);
    case "salary":
      return tx("salary", "in", main, rules);
    case "cashback":
      return tx("cashback", "in", main, rules);
    case "interest":
      return tx("interest", inc || has(events, "credit") ? "in" : "out", main, rules);
    case "transfer_out":
      if (side === "into") return tx(wallet ? "wallet_receive" : "transfer_in", "in", main, rules);
      if (wallet && !instapay) rules.push("wallet_transfer");
      return tx(wallet && !instapay ? "wallet_send" : "transfer_out", "out", main, rules);
    case "transfer_in":
      if (wallet && !instapay) rules.push("wallet_transfer");
      return tx(wallet && !instapay ? "wallet_receive" : "transfer_in", "in", main, rules);
    case "credit":
      if (has(events, "salary")) return tx("salary", "in", main, [...rules, "credit_salary"]);
      if (has(events, "interest")) return tx("interest", "in", main, rules);
      return tx(wallet ? "wallet_receive" : "other", "in", main, rules);
    case "bill":
      return tx("bill_payment", "out", main, rules);
    case "recharge":
      return tx("mobile_recharge", "out", main, rules);
    case "installment":
      return tx("installment", "out", main, rules);
    case "fee":
      return tx("fee", "out", main, rules);
    case "purchase":
      return tx("card_purchase", "out", main, rules);
    case "debit":
      if (atm) return tx("atm_withdrawal", "out", main, [...rules, "debit_atm"]);
      if (has(events, "bill")) return tx("bill_payment", "out", main, rules);
      if (has(events, "recharge")) return tx("mobile_recharge", "out", main, rules);
      if (has(events, "installment")) return tx("installment", "out", main, rules);
      if (has(events, "transfer_out")) return tx("transfer_out", "out", main, rules);
      // A debit at a merchant becomes a purchase once the merchant is found (read.ts); a fee on its own is a fee.
      if (has(events, "fee") && !cues.some((cue) => cue.family === "cp_merchant")) return tx("fee", "out", main, rules);
      return tx("other", "out", main, rules);
    default:
      return { status: "unsure", kind: "other", direction: null, main, reasons: ["unknown_verb"], rules };
  }
}

function tx(kind: ReaderKind, direction: Direction, main: CueMatch, rules: string[]): EventDecision {
  return { status: "transaction", kind, direction, main, reasons: [], rules };
}

const ONLINE_MERCHANT = /\.(?:com|net|org|io|ai|co|eg)\b|www\.|\*|online|e-?com/i;

/** A purchase is international when it is in another currency, online when the merchant is a website or a payment
 * descriptor ("NETFLIX.COM", "OPENAI *CHATGPT SUBSCR"). */
export function refinePurchase(kind: ReaderKind, currency: string | null, merchant: string | null): ReaderKind {
  if (kind !== "card_purchase" && kind !== "other") return kind;
  if (currency && currency !== "EGP") return "international_purchase";
  if (merchant && ONLINE_MERCHANT.test(merchant)) return "online_purchase";
  return "card_purchase";
}
