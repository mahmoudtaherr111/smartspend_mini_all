/**
 * The message reader: layer one of capture, before any model. One pure function, `readMessage`, turns a bank,
 * wallet or payment notification into a reading — what happened, which way, how much, in what currency, with which
 * card, with whom, when — with the evidence for each part and how sure it is. No database, no network, no clock: the
 * same message and the same receive time always give the same reading, in tests, in the admin's "try a message" and
 * on the ingest path.
 *
 * Steps: normalize (normalize.ts) → find pieces (spans.ts) and words (lexicon.ts) → cut sentences (clauses.ts) →
 * decide the kind and direction (kind.ts) → give every amount its role (roles.ts) → find the other side
 * (counterparty.ts) → date it (when.ts) → judge confidence. A reading the reader is unsure of goes to the model
 * (layer two), which answers in the same shape.
 */
import type { CueMatch } from "./lexicon";
import { findCues } from "./lexicon";
import { normalizeMessage, spanOf, type NormalizedMessage } from "./normalize";
import { splitClauses } from "./clauses";
import { decideEvent, ownAccountSide, refinePurchase } from "./kind";
import { assignRoles, type AssignedMoney } from "./roles";
import { findCounterparty } from "./counterparty";
import { findPieces, type Piece } from "./spans";
import { readWhen } from "./when";
import {
  READER_VERSION,
  type Confidence,
  type Evidence,
  type Money,
  type Reading,
  type ReaderInput,
  type ReaderKind,
} from "./types";

const DEFAULT_TIME_ZONE = "Africa/Cairo";

const PURCHASE_KINDS: ReadonlySet<ReaderKind> = new Set(["card_purchase", "online_purchase", "international_purchase"]);
const TRANSFER_KINDS: ReadonlySet<ReaderKind> = new Set(["transfer_out", "transfer_in", "wallet_send", "wallet_receive"]);

function money(message: NormalizedMessage, item: AssignedMoney | null): Money | null {
  if (!item) return null;
  return {
    value: Math.round(item.value * 100) / 100,
    currency: item.currency,
    currencyInferred: item.currencyInferred,
    span: spanOf(message, item.piece.start, item.piece.end),
  };
}

function cueEvidence(message: NormalizedMessage, kind: Evidence["kind"], cue: CueMatch | null): Evidence[] {
  return cue ? [{ kind, id: cue.id, span: spanOf(message, cue.start, cue.end) }] : [];
}

function pieceEvidence(message: NormalizedMessage, piece: Piece | undefined, kind: Evidence["kind"]): Evidence[] {
  return piece ? [{ kind, id: piece.kind, span: spanOf(message, piece.start, piece.end) }] : [];
}

export function readMessage(input: ReaderInput): Reading {
  const timeZone = input.timeZone ?? DEFAULT_TIME_ZONE;
  // The title sometimes carries what the body leaves out ("Purchase", "تحويل وارد"); it is read as a first line.
  const body = [input.title?.trim(), input.text?.trim()].filter(Boolean).join("\n");
  const message = normalizeMessage(body);
  const pieces = findPieces(message);
  const cues = findCues(message);
  const clauses = splitClauses(message, pieces);

  const decision = decideEvent({
    message,
    cues,
    pieces,
    clauses,
    sourceKind: input.sourceKind ?? null,
    sourceSlug: input.sourceSlug ?? null,
  });
  const roles = assignRoles({
    message,
    cues,
    pieces,
    clauses,
    main: decision.main,
    kindIsFee: decision.kind === "fee",
    statement: decision.kind === "statement_due",
  });
  const ownAccount = ownAccountSide(message, cues);

  let kind = decision.kind;
  const amountPiece = roles.amount?.piece ?? null;
  const counterparty =
    decision.status === "transaction"
      ? findCounterparty({ message, cues, pieces, clauses, kind, anchor: amountPiece?.start ?? decision.main?.start ?? null, ownAccount })
      : null;
  // A debit at a merchant is a purchase; a purchase in another currency is international, at a website online.
  if (kind === "other" && decision.direction === "out" && counterparty?.type === "merchant") kind = "card_purchase";
  if (PURCHASE_KINDS.has(kind)) kind = refinePurchase(kind, roles.amount?.currency ?? null, counterparty?.name ?? null);
  const direction =
    decision.status !== "transaction"
      ? null
      : TRANSFER_KINDS.has(kind) && counterparty?.type === "own_account"
        ? "internal"
        : decision.direction;

  const card = pieces.find((piece) => piece.kind === "card") as Extract<Piece, { kind: "card" }> | undefined;
  const account = pieces.find((piece) => piece.kind === "account") as Extract<Piece, { kind: "account" }> | undefined;
  const reference = pieces.find((piece) => piece.kind === "reference") as Extract<Piece, { kind: "reference" }> | undefined;
  const when = readWhen(pieces, input.receivedAt, timeZone);
  const subscriptionHint = cues.some((cue) => cue.family === "subscription");

  // ─── Confidence ───
  const reasons = [...decision.reasons, ...roles.reasons];
  const missing: string[] = [];
  let status = decision.status;
  let confidence: Confidence = "certain";

  if (status === "transaction") {
    if (!roles.amount) {
      status = "unsure";
      reasons.push("no_amount");
      missing.push("amount");
    }
    if (PURCHASE_KINDS.has(kind) && !counterparty?.name && !card) missing.push("merchant");
    if (TRANSFER_KINDS.has(kind) && !counterparty) missing.push("counterparty");
    if (kind === "international_purchase" && !roles.equivalent) missing.push("amount_egp");
    if (roles.reasons.includes("several_amounts")) status = "unsure";
  }
  if (status === "unsure") confidence = "unsure";
  else if (status === "not_transaction") confidence = decision.main && decision.main.strength < 3 ? "likely" : "certain";
  else if (
    roles.amount?.currencyInferred ||
    kind === "other" ||
    (decision.main?.strength ?? 0) < 2 ||
    missing.includes("merchant") ||
    missing.includes("amount_egp")
  ) {
    confidence = "likely";
  }

  // ─── Evidence ───
  const evidence: Evidence[] = [
    ...cueEvidence(message, "verb", decision.main),
    ...(roles.amount ? [{ kind: "money" as const, id: `amount${roles.amount.currencyInferred ? ":assumed_currency" : ""}`, span: spanOf(message, roles.amount.piece.start, roles.amount.piece.end) }] : []),
    ...[roles.balance, roles.limit, roles.fee, roles.equivalent, roles.minDue, roles.totalDue]
      .filter((item): item is AssignedMoney => Boolean(item))
      .flatMap((item) => [
        ...cueEvidence(message, "role", item.cue),
        { kind: "money" as const, id: item.role, span: spanOf(message, item.piece.start, item.piece.end) },
      ]),
    ...pieceEvidence(message, card, "card"),
    ...pieceEvidence(message, account, "account"),
    ...pieceEvidence(message, reference, "reference"),
    ...pieceEvidence(message, when.date ?? undefined, "date"),
    ...pieceEvidence(message, when.time ?? undefined, "time"),
    ...(counterparty?.span
      ? [{ kind: (counterparty.type === "merchant" ? "merchant" : counterparty.phone || counterparty.phoneTail ? "phone" : counterparty.ipa ? "ipa" : "person") as Evidence["kind"], id: counterparty.type, span: counterparty.span }]
      : []),
    ...(input.sourceSlug ? [{ kind: "source" as const, id: input.sourceSlug }] : []),
    ...[...decision.rules, ...roles.rules].map((rule) => ({ kind: "rule" as const, id: rule })),
  ];

  return {
    readerVersion: READER_VERSION,
    status,
    kind,
    direction: status === "transaction" ? direction : null,
    amount: money(message, roles.amount),
    amountEgp: money(message, roles.equivalent),
    fee: money(message, roles.fee),
    balanceAfter: money(message, roles.balance),
    availableLimit: money(message, roles.limit),
    minimumDue: money(message, roles.minDue ?? roles.totalDue),
    card: card ? { suffix: card.suffix, span: spanOf(message, card.start, card.end) } : null,
    account: account ? { suffix: account.suffix, span: spanOf(message, account.start, account.end) } : null,
    counterparty,
    subscriptionHint,
    occurredAt: when.occurredAt,
    occurredAtFrom: when.from,
    reference: reference?.value ?? null,
    confidence,
    missing,
    reasons,
    evidence,
  };
}
