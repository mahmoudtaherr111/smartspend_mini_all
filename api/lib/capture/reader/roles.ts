/**
 * What each amount in a message is: the money that moved, the balance after it, an available limit, a fee, a
 * minimum or total due, or the Egyptian-pound equivalent of a foreign amount. A number takes the role of the nearest
 * role word before it in its own sentence ("المتاح 9000.00 جم", "Avl Bal EGP 1,250", "رسوم 5 جم"); a number with no
 * role word in the sentence of the deciding verb is a candidate for the amount.
 *
 * When one sentence holds two amounts in different currencies and one is in pounds ("USD 20.00 … EGP 1,010.00"), the
 * foreign one is the amount and the pounds its equivalent. When a message writes no currency at all, a bare number
 * right after the verb ("تم خصم 250") is taken as pounds and marked as assumed.
 */
import type { Clause } from "./clauses";
import { clauseAt } from "./clauses";
import type { CueMatch } from "./lexicon";
import type { NormalizedMessage } from "./normalize";
import type { Piece } from "./spans";

type MoneyPiece = Extract<Piece, { kind: "money" }>;
type NumberPiece = Extract<Piece, { kind: "number" }>;

export type MoneyRole = "amount" | "balance" | "limit" | "fee" | "min_due" | "total_due" | "equivalent";

export interface AssignedMoney {
  piece: MoneyPiece | NumberPiece;
  value: number;
  currency: string;
  currencyInferred: boolean;
  role: MoneyRole;
  /** The role word that decided, when one did. */
  cue: CueMatch | null;
}

export interface RoleResult {
  amount: AssignedMoney | null;
  equivalent: AssignedMoney | null;
  fee: AssignedMoney | null;
  balance: AssignedMoney | null;
  limit: AssignedMoney | null;
  minDue: AssignedMoney | null;
  totalDue: AssignedMoney | null;
  reasons: string[];
  rules: string[];
}

/** How far before a number a role word may sit and still name it (characters). */
const ROLE_REACH = 28;

function roleOf(cue: CueMatch, creditCard: boolean): MoneyRole | null {
  switch (cue.family) {
    case "role_balance":
      return "balance";
    case "role_limit":
      return "limit";
    case "role_available":
      return creditCard ? "limit" : "balance";
    case "role_fee":
      return "fee";
    case "role_min_due":
      return "min_due";
    case "role_total_due":
      return "total_due";
    case "role_equivalent":
      return "equivalent";
    case "role_amount":
      return "amount";
    default:
      return null;
  }
}

interface AssignInput {
  message: NormalizedMessage;
  cues: CueMatch[];
  pieces: Piece[];
  clauses: Clause[];
  /** The verb that decided the kind, if any: its sentence holds the amount. */
  main: CueMatch | null;
  /** The kind is itself a fee, so a fee-worded amount is the amount. */
  kindIsFee: boolean;
  /** The message is about a statement: its due amounts are the point. */
  statement: boolean;
}

export function assignRoles({ message, cues, pieces, clauses, main, kindIsFee, statement }: AssignInput): RoleResult {
  const result: RoleResult = {
    amount: null,
    equivalent: null,
    fee: null,
    balance: null,
    limit: null,
    minDue: null,
    totalDue: null,
    reasons: [],
    rules: [],
  };
  // Matched on the folded view, where ئ is ي: "الائتمان" reads "الايتمان".
  const creditCard = /ايتمان|credit card/.test(message.fold);
  const roleCues = cues.filter((cue) => cue.family.startsWith("role_"));
  const between = (from: number, to: number) => pieces.some((piece) => piece.kind === "money" && piece.start >= from && piece.end <= to);

  const assigned: AssignedMoney[] = pieces
    .filter((piece): piece is MoneyPiece => piece.kind === "money")
    .map((piece) => {
      const clause = clauseAt(clauses, piece.start);
      const cue =
        roleCues
          .filter(
            (candidate) =>
              candidate.end <= piece.start &&
              piece.start - candidate.end <= ROLE_REACH &&
              clauseAt(clauses, candidate.start)?.index === clause?.index &&
              !between(candidate.end, piece.start),
          )
          .sort((a, b) => b.end - a.end || b.strength - a.strength)[0] ?? null;
      let role: MoneyRole = cue ? roleOf(cue, creditCard) ?? "amount" : "amount";
      if (role === "fee" && kindIsFee) role = "amount";
      return { piece, value: piece.value, currency: piece.currency, currencyInferred: false, role, cue };
    });

  const take = (role: MoneyRole) => assigned.find((item) => item.role === role) ?? null;
  result.balance = take("balance");
  result.limit = take("limit");
  result.fee = take("fee");
  result.minDue = take("min_due");
  result.totalDue = take("total_due");
  result.equivalent = take("equivalent");

  const candidates = assigned.filter((item) => item.role === "amount");
  const mainClause = main ? clauseAt(clauses, main.start)?.index : undefined;
  const inMain = candidates.filter((item) => clauseAt(clauses, item.piece.start)?.index === mainClause);
  const pool = inMain.length ? inMain : candidates;

  if (pool.length === 1) {
    result.amount = pool[0];
  } else if (pool.length > 1) {
    const foreign = pool.filter((item) => item.currency !== "EGP");
    const pounds = pool.filter((item) => item.currency === "EGP");
    if (foreign.length === 1 && pounds.length === 1) {
      result.amount = foreign[0];
      result.equivalent ??= { ...pounds[0], role: "equivalent" };
      result.rules.push("foreign_with_egp_equivalent");
    } else {
      // The amount is the one the deciding verb points at: the first after it, else the last before it.
      const after = main ? pool.filter((item) => item.piece.start >= main.end) : [];
      const pick = after[0] ?? pool[pool.length - 1];
      const others = pool.filter((item) => item !== pick && item.value !== pick.value);
      result.amount = pick;
      if (others.length) result.reasons.push("several_amounts");
    }
  }

  if (!result.amount && main && !statement) {
    // No currency anywhere near: a bare number right after the verb is pounds, marked as assumed.
    const bare = pieces
      .filter((piece): piece is NumberPiece => piece.kind === "number")
      .find((piece) => piece.start >= main.end && piece.start - main.end <= 20 && clauseAt(clauses, piece.start)?.index === mainClause);
    if (bare && bare.value > 0) {
      result.amount = { piece: bare, value: bare.value, currency: "EGP", currencyInferred: true, role: "amount", cue: null };
      result.rules.push("bare_number_after_verb");
    }
  }
  return result;
}
