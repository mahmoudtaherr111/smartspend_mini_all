/**
 * The guard: every fact of a reading that code can check exactly, checked.
 *
 * It reads no words for meaning. It asks questions with one answer: is this amount a number
 * the person said; is this quote their words; does this category exist and allow this kind of
 * money; is this commitment one of theirs; is every number in the sentence accounted for. A
 * failed check does not correct the reading: it puts a named flag on it, and a flagged event
 * is shown to the person instead of being saved behind their back (`policy.ts`).
 *
 * Why: docs/decisions/0052-understanding-engine.md.
 */
import { categoryAllowsKind, taxonomyCategory, taxonomySub } from "../../../contracts/taxonomy";
import type { MovementKind } from "../../../contracts/ledger-movement";
import { detectNegation } from "../negation-detector";
import type { ReadEvent, Reading } from "./contract";
import { numberMentions, quoteIsFromText, sourceOfAmount, foldForMatch } from "./numbers";

export type EventFlag =
  | "amount_missing"
  | "amount_not_in_text"
  | "amount_derived"
  | "amount_out_of_range"
  | "quote_not_in_text"
  | "taxonomy_invalid"
  | "sub_repaired"
  | "kind_category_mismatch"
  | "flow_impossible"
  | "commitment_unknown"
  | "wallet_unknown"
  | "date_invalid"
  | "local_negation_disagrees"
  | "duplicate_event"
  | `model_doubt:${string}`;

export type ReplyFlag = "number_unaccounted";

/** Flags that never stop a save on their own: the reading was repaired to something certain. */
export const HARMLESS_FLAGS: ReadonlySet<string> = new Set(["sub_repaired"]);

export interface GuardedEvent extends ReadEvent {
  flags: EventFlag[];
}

export interface GuardContext {
  /** Commitment and wallet references that were offered to the model (`c1`, `w2`). */
  commitmentRefs: ReadonlySet<string>;
  walletRefs: ReadonlySet<string>;
  /** Today as a Cairo business day, `YYYY-MM-DD`. */
  today: string;
  /** Largest amount one event may carry. */
  maxAmount: number;
  /** How far back a stated date may be, in days. */
  maxDaysBack: number;
}

export interface GuardedReading {
  events: GuardedEvent[];
  ignored: Reading["ignored"];
  numbers: Reading["numbers"];
  ask: string;
  askAbout: Reading["askAbout"];
  flags: ReplyFlag[];
  /** Numbers of the sentence no event, role or ignored clause explains. */
  unaccounted: number[];
}

/** The flow a kind forces, when it forces one. */
const FORCED_FLOW: Partial<Record<MovementKind, "in" | "out">> = {
  spending: "out",
  income: "in",
  refund: "in",
  card_payment: "out",
};

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function guardReading(reading: Reading, sentence: string, ctx: GuardContext): GuardedReading {
  const mentions = numberMentions(sentence);
  const taken = new Set<number>();
  const explained = new Set<number>();
  const seen = new Set<string>();

  const events = reading.events.map((event): GuardedEvent => {
    const flags: EventFlag[] = [];
    const next: GuardedEvent = { ...event, flags };

    // ── Money ──
    if (!(event.amount > 0)) {
      flags.push("amount_missing");
    } else {
      const source = sourceOfAmount(event.amount, mentions, taken);
      if (source.kind === "stated") {
        taken.add(source.index);
        explained.add(source.index);
      } else if (source.kind === "derived") {
        flags.push("amount_derived");
        source.indexes.forEach((index) => explained.add(index));
      } else {
        flags.push("amount_not_in_text");
      }
      if (event.amount > ctx.maxAmount) flags.push("amount_out_of_range");
    }

    // ── The user's own words ──
    if (!quoteIsFromText(event.quote, sentence)) flags.push("quote_not_in_text");

    // ── Purpose and nature ──
    const category = taxonomyCategory(event.category);
    if (!category) {
      flags.push("taxonomy_invalid");
    } else {
      if (!taxonomySub(event.category, event.sub)) {
        next.sub = "other";
        flags.push("sub_repaired");
      }
      if (!categoryAllowsKind(event.category, event.kind)) flags.push("kind_category_mismatch");
    }
    const forced = FORCED_FLOW[event.kind];
    if (forced && forced !== event.flow) flags.push("flow_impossible");

    // ── References ──
    if (event.commitment && !ctx.commitmentRefs.has(event.commitment)) {
      next.commitment = "";
      next.installments = 0;
      flags.push("commitment_unknown");
    }
    if (event.wallet && !ctx.walletRefs.has(event.wallet)) {
      next.wallet = "";
      flags.push("wallet_unknown");
    }

    // ── Time ──
    if (event.date) {
      const back = daysBetween(event.date, ctx.today);
      if (!Number.isFinite(back) || back < 0 || back > ctx.maxDaysBack) {
        next.date = "";
        flags.push("date_invalid");
      }
    }

    // ── Second opinions ──
    if (event.doubt !== "none") flags.push(`model_doubt:${event.doubt}`);
    if (event.quote && detectNegation(event.quote).negated) flags.push("local_negation_disagrees");

    const identity = `${foldForMatch(event.quote)}|${Math.round(event.amount * 100)}|${event.kind}|${event.flow}`;
    if (seen.has(identity)) flags.push("duplicate_event");
    seen.add(identity);

    return next;
  });

  // ── Every number the person said is accounted for ──
  // By an event (above), by a role the model named, or by lying inside a clause it set aside.
  const roleValues = reading.numbers.flatMap((entry) => numberMentions(entry.text));
  const ignoredValues = reading.ignored.flatMap((entry) => numberMentions(entry.quote));
  const spare = [...roleValues, ...ignoredValues];
  const unaccounted: number[] = [];
  mentions.forEach((value, index) => {
    if (explained.has(index)) return;
    const at = spare.findIndex((other) => Math.round(other * 100) === Math.round(value * 100));
    if (at >= 0) spare.splice(at, 1);
    else unaccounted.push(value);
  });

  return {
    events,
    ignored: reading.ignored,
    numbers: reading.numbers,
    ask: reading.ask,
    askAbout: reading.askAbout,
    flags: unaccounted.length > 0 ? ["number_unaccounted"] : [],
    unaccounted,
  };
}

/** True when the event carries a flag that must be seen by the person. */
export function eventNeedsEyes(event: GuardedEvent): boolean {
  return event.flags.some((flag) => !HARMLESS_FLAGS.has(flag));
}
