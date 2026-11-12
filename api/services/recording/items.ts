/**
 * A reading as the items the apps already know how to show and save.
 *
 * The understanding engine answers in taxonomy v2 with the nature of the money apart from its
 * purpose; the apps and the save procedures take `ParsedTransaction`s with today's category
 * names, row type and direction. Each item keeps what the engine read in `reading`, so a save
 * can be enriched from the server's own copy of it later (`saved-reading.ts`). Pure.
 */
import type { Understanding, UnderstoodEvent } from "../../lib/understanding/engine";
import { personMatcher } from "../../lib/understanding/reading-context";
import type { PromptPerson } from "../../lib/understanding/prompt";
import type { ParseDecision, ReadingSummary, RecordedItem } from "./types";

/** The save procedures' limits on a named person (`expense.create`, `expense.batchCreate`). */
const PERSON_NAME_MAX = 60;
const PERSON_RELATION_MAX = 40;

export const CLEAN_CONFIDENCE = 100;
export const SHOWN_CONFIDENCE = 60;

export interface ItemContext {
  /** The user's people as the reading context offered them: a named one is saved under their own name. */
  people: readonly PromptPerson[];
  /** Set in business mode when the user has an active business. */
  businessId?: number | null;
}

function knownPersonOf(name: string, people: readonly PromptPerson[]): PromptPerson | undefined {
  if (!name.trim()) return undefined;
  return people.find((person) => personMatcher([{ name: person.name }])(name));
}

export function readingSummaryOf(event: UnderstoodEvent): ReadingSummary {
  return {
    category: event.category,
    sub: event.sub,
    kind: event.kind,
    flow: event.flow,
    commitmentId: event.commitmentId,
    commitmentDueDay: event.commitmentDueDay,
    installments: event.installments,
    walletId: event.walletId,
    flags: [...event.flags],
  };
}

/** One event as one item. Events without an amount have no item: the question or the review covers them. */
export function toParsedItem(event: UnderstoodEvent, ctx: ItemContext): RecordedItem {
  const clean = event.reasons.length === 0;
  const item: RecordedItem = {
    amount: event.amount,
    category: event.stored.category,
    subCategory: event.stored.subCategory,
    description: event.what || event.quote,
    type: event.stored.type,
    confidence: clean ? CLEAN_CONFIDENCE : SHOWN_CONFIDENCE,
    currency: "EGP",
    needsReview: !clean,
    parsedBy: "ai",
    clause: event.quote,
    reading: readingSummaryOf(event),
  };
  if (event.stored.direction) item.direction = event.stored.direction;
  if (!clean) item.reviewReasons = [...event.reasons];
  // The day the sentence named, at noon UTC of that Cairo day, as the manual sheet sends a date.
  if (event.date) item.date = `${event.date}T12:00:00.000Z`;

  const known = knownPersonOf(event.person, ctx.people);
  const name = (known?.name ?? event.person).trim().slice(0, PERSON_NAME_MAX);
  const relation = (known?.relation ?? event.personRelation ?? "").trim().slice(0, PERSON_RELATION_MAX);
  if (name) item.person_mentioned = name;
  if (name && relation) item.person_relationship = relation;

  if (ctx.businessId && (event.category === "work" || event.category === "business_income")) {
    item.businessId = ctx.businessId;
    if (event.businessCategory) item.subCategory = event.businessCategory;
  }
  return item;
}

export function toParsedItems(understanding: Pick<Understanding, "events">, ctx: ItemContext): RecordedItem[] {
  return understanding.events.filter((event) => event.amount > 0).map((event) => toParsedItem(event, ctx));
}

/**
 * The decision the apps act on. `skipClarification` (the admin's sandbox) never opens a
 * question: what could be read is shown, and nothing readable is an empty review.
 */
export function decisionOf(outcome: Understanding["outcome"], skipClarification = false): ParseDecision {
  if (outcome === "save") return "auto_save";
  if (outcome === "show") return "review";
  return skipClarification ? "review" : "clarify";
}

/** 0 for a question, else the weakest item's confidence, as the pipeline reports it. */
export function overallConfidenceOf(decision: ParseDecision, items: readonly RecordedItem[]): number {
  if (decision === "clarify" || items.length === 0) return 0;
  return Math.min(...items.map((item) => item.confidence));
}
