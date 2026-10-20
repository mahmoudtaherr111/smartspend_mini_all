/**
 * Who is on the other side of the money: a merchant ("at SAOOD MARKET", "عند KASHIERFast", "from AMAZON"), a person
 * ("من محمد محمد", "to MOHAMED ALI"), a phone number ("لرقم 01012345678"), an InstaPay address, or the user's own
 * account ("لحسابكم"). A name runs from its lead word to the first thing that is not part of it: a date, a time, an
 * amount, a card, a reference, a role word, a stop word ("on", "يوم", "الساعة") or the end of the sentence.
 *
 * A merchant also gets a key that stays the same across branches and terminals: "CARREFOUR MAADI 012" and
 * "Carrefour City Stars" both read "carrefour…", "HELP.UBER.COM" reads "uber", "OPENAI *CHATGPT SUBSCR" reads
 * "openai chatgpt subscr".
 */
import type { Clause } from "./clauses";
import { clauseAt } from "./clauses";
import type { CueFamily, CueMatch } from "./lexicon";
import type { NormalizedMessage } from "./normalize";
import { spanOf } from "./normalize";
import type { Piece } from "./spans";
import type { Counterparty, ReaderKind } from "./types";

const PURCHASE_KINDS: ReadonlySet<ReaderKind> = new Set(["card_purchase", "online_purchase", "international_purchase", "other", "refund", "bill_payment", "installment"]);
const OUT_TRANSFERS: ReadonlySet<ReaderKind> = new Set(["transfer_out", "wallet_send", "cash_out"]);
const IN_TRANSFERS: ReadonlySet<ReaderKind> = new Set(["transfer_in", "wallet_receive", "cash_in", "salary"]);

const MAX_NAME = 60;

/** Where a name that starts at `from` ends: the first piece, role or stop word, or sentence end after it. */
function nameEnd(message: NormalizedMessage, from: number, clause: Clause, pieces: Piece[], cues: CueMatch[]): number {
  let end = Math.min(clause.end, from + MAX_NAME);
  for (const piece of pieces) if (piece.start >= from && piece.start < end) end = piece.start;
  for (const cue of cues) {
    const ends = cue.family === "stop" || cue.family.startsWith("role_") || cue.family.startsWith("cp_");
    if (ends && cue.start > from && cue.start < end) end = cue.start;
  }
  const comma = message.text.slice(from, end).search(/[,،]/);
  if (comma >= 0) end = from + comma;
  return end;
}

/** The user's own card, account or wallet is not a merchant or a person ("من حسابك", "from your card"). */
const OWN_THING = /^(?:ال)?(?:حساب|بطاق|كارت|محفظ)|^(?:your\s+)?(?:account|card|wallet)\b/i;

function cleanName(raw: string): string | null {
  const name = raw.replace(/^[\s:#\-–]+|[\s:#\-–.]+$/g, "").replace(/\s+/g, " ");
  return /\p{L}/u.test(name) && !OWN_THING.test(name) ? name : null;
}

const DROP_TOKENS = new Set([
  "pos", "ecom", "e-com", "ecommerce", "e-commerce", "purchase", "payment", "at", "the",
  "eg", "egy", "egypt", "cairo", "giza", "alexandria", "alex", "maadi", "nasr", "city", "heliopolis", "zamalek", "dokki",
  "mohandessin", "october", "6th", "sheikh", "zayed", "new",
  "us", "usa", "gb", "uk", "ie", "nl", "lu", "sg", "ae", "uae", "ireland", "irl", "luxembourg", "netherlands",
  "llc", "inc", "ltd", "co", "sae", "s.a.e", "plc", "pbc", "bv", "b.v", "gmbh", "sarl", "corp", "company",
]);

/** A merchant's name reduced to what stays the same across branches, terminals and cities. */
export function merchantKey(name: string): string | null {
  let value = name.toLowerCase();
  // A web address names its owner: help.uber.com → uber, netflix.com → netflix.
  value = value.replace(/\b(?:https?:\/\/)?(?:www\.|help\.|pay\.|billing\.|checkout\.)?([a-z0-9-]+)\.(?:com|net|org|io|ai|co|eg|com\.eg)\b(?:\/\S*)?/g, "$1");
  value = value.replace(/[*_/\\|]+/g, " ").replace(/[^\p{L}\p{N}\s&.-]/gu, " ");
  const tokens = value
    .split(/\s+/)
    .map((token) => token.replace(/^[.-]+|[.-]+$/g, ""))
    .filter((token) => token && !DROP_TOKENS.has(token) && !/^\d+$/.test(token) && !/^#?\d+$/.test(token));
  const key = tokens.join(" ").trim();
  return key || null;
}

interface FindInput {
  message: NormalizedMessage;
  cues: CueMatch[];
  pieces: Piece[];
  clauses: Clause[];
  kind: ReaderKind;
  /** Where the amount sits: the other side is looked for in its sentence first. */
  anchor: number | null;
  ownAccount: "into" | "out_of" | null;
}

function leadCues(cues: CueMatch[], families: CueFamily[], clause: Clause | null): CueMatch[] {
  return cues
    .filter((cue) => families.includes(cue.family) && (!clause || (cue.start >= clause.start && cue.start < clause.end)))
    .sort((a, b) => a.start - b.start);
}

export function findCounterparty({ message, cues, pieces, clauses, kind, anchor, ownAccount }: FindInput): Counterparty | null {
  const anchorClause = anchor === null ? null : clauseAt(clauses, anchor);
  const searchClauses = anchorClause ? [anchorClause, ...clauses.filter((clause) => clause !== anchorClause)] : clauses;
  const empty: Counterparty = { type: "unknown", name: null, merchantKey: null, phone: null, phoneTail: null, ipa: null, span: null };

  const readAfter = (cue: CueMatch): Counterparty | null => {
    const clause = clauseAt(clauses, cue.start);
    if (!clause) return null;
    // A phone number or an InstaPay address right after the lead word is the other side.
    const next = pieces.find((piece) => piece.start >= cue.end && piece.start - cue.end <= 3);
    if (next?.kind === "phone") {
      return { ...empty, type: "person", phone: next.phone, phoneTail: next.tail, span: spanOf(message, next.start, next.end) };
    }
    if (next?.kind === "ipa") return { ...empty, type: "person", ipa: next.address, span: spanOf(message, next.start, next.end) };
    const end = nameEnd(message, cue.end, clause, pieces, cues);
    const name = cleanName(message.text.slice(cue.end, end));
    if (!name) return null;
    const start = cue.end + message.text.slice(cue.end, end).search(/\S/);
    return { ...empty, name, span: spanOf(message, start, start + name.length) };
  };

  const firstFrom = (families: CueFamily[]): Counterparty | null => {
    for (const clause of searchClauses) {
      for (const cue of leadCues(cues, families, clause)) {
        const found = readAfter(cue);
        if (found) return found;
      }
    }
    return null;
  };

  if ((OUT_TRANSFERS.has(kind) || IN_TRANSFERS.has(kind)) && ownAccount && !pieces.some((piece) => piece.kind === "phone" || piece.kind === "ipa")) {
    // "تم تحويل 500 جنيه إلى حسابك" with nobody else named: the user's own account.
    const own = cues.find((cue) => cue.family === "cp_own_account");
    if (own && !firstFrom(OUT_TRANSFERS.has(kind) ? ["cp_to"] : ["cp_from"])) {
      return { ...empty, type: "own_account", span: spanOf(message, own.start, own.end) };
    }
  }

  if (OUT_TRANSFERS.has(kind)) {
    const found = firstFrom(["cp_to"]);
    if (found) return { ...found, type: found.type === "unknown" ? "person" : found.type };
  }
  if (IN_TRANSFERS.has(kind)) {
    const found = firstFrom(["cp_from"]);
    if (found) return { ...found, type: found.type === "unknown" ? "person" : found.type };
  }
  if (PURCHASE_KINDS.has(kind)) {
    const found = firstFrom(["cp_merchant"]) ?? firstFrom(["cp_from"]) ?? (kind === "bill_payment" ? firstFrom(["cp_to"]) : null);
    if (found && found.name) return { ...found, type: "merchant", merchantKey: merchantKey(found.name) };
    if (found) return found;
  }
  // Any phone or InstaPay address in a transfer, even without a lead word.
  if (OUT_TRANSFERS.has(kind) || IN_TRANSFERS.has(kind)) {
    const piece = pieces.find((item) => item.kind === "phone" || item.kind === "ipa");
    if (piece?.kind === "phone") return { ...empty, type: "person", phone: piece.phone, phoneTail: piece.tail, span: spanOf(message, piece.start, piece.end) };
    if (piece?.kind === "ipa") return { ...empty, type: "person", ipa: piece.address, span: spanOf(message, piece.start, piece.end) };
  }
  return null;
}
