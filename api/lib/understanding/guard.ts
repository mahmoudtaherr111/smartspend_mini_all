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
import { arabicIndicToAscii } from "../arabic-number-parser";
import { detectNegation } from "../negation-detector";
import type { ReadEvent, Reading } from "./contract";
import { businessDateKey } from "../app-time";
import { foldForMatch, normalizeNumbersForMatching, numberMentionSpans, quoteIsFromText, sourceOfAmount } from "./numbers";

export type EventFlag =
  | "amount_missing"
  | "amount_not_in_text"
  | "amount_outside_quote"
  | "amount_has_non_money_role"
  | "amount_derived"
  | "amount_out_of_range"
  | "quote_not_in_text"
  | "taxonomy_invalid"
  | "sub_repaired"
  | "kind_category_mismatch"
  | "flow_impossible"
  | "person_unverified"
  | "commitment_unknown"
  | "wallet_unknown"
  | "date_invalid"
  | "date_unverified"
  | "local_negation_disagrees"
  | "reported_quote"
  | "duplicate_event"
  | `model_doubt:${string}`;

export type ReplyFlag = "number_unaccounted" | "ignored_quote_unverified" | "number_role_unverified"
  | "total_mismatch" | "events_dropped" | "action_unaccounted";

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

type Span = { start: number; end: number };
type Mention = Span & { value: number };
const DAY_MS = 86_400_000;
const cents = (amount: number): number => Math.round(amount * 100);
const contains = (outer: Span, inner: Span): boolean => outer.start <= inner.start && inner.end <= outer.end;
const evidenceText = (text: string): string => foldForMatch(normalizeNumbersForMatching(text))
  .replace(/(?<=\p{Script=Arabic})(?=\d)|(?<=\d)(?=\p{Script=Arabic})/gu, " ");
const PAYMENT_VERB = /(?:^| )(?:[وف])?(?:دفعت|صرفت|سددت|حولت|قبضت)(?: ب| بمبلغ)? *$/;
const WRITTEN_DAY = /(?<!\d)(\d{4}|\d{1,2})([-/])(\d{1,2})\2(\d{4}|\d{1,2})(?!\d)/g;

/** Exact text evidence, allowing an Arabic conjunction attached to the first word of a clause. */
function spansOf(needle: string, text: string): Span[] {
  if (!needle) return [];
  const spans: Span[] = [];
  for (let start = text.indexOf(needle); start >= 0; start = text.indexOf(needle, start + 1)) {
    const end = start + needle.length;
    const before = text[start - 1];
    const after = text[end];
    const clitic = before && /^[وف]$/.test(before) && (start === 1 || text[start - 2] === " ");
    if ((!before || before === " " || clitic) && (!after || after === " ")) spans.push({ start, end });
  }
  return spans;
}

/** Clear surface cues for a number that must never be treated as a stated amount. */
function localNumberRole(text: string, mention: Mention): "total" | "unit_price" | "quantity" | "date" | "label" | undefined {
  const before = text.slice(0, mention.start);
  const after = text.slice(mention.end);
  if (/(?:^| )و?(?:الاجمالي|اجمالي|المجموع|التوتال|total)(?: كان| ب)? *$/i.test(before)) return "total";
  if (/(?:^| )(?:الواحد|الواحده|القطعه|الكيلو|اللتر) ب? *$/.test(before) ||
      /^ *(?:جنيه )?(?:للواحد|للواحده|للقطعه|للكيلو|للتر|لكل (?:قطعه|كيلو|لتر|واحد|واحده))(?: |$)/.test(after)) return "unit_price";
  if (/^ *(?:كيلو(?:هات)?|جرام|لتر|متر|قطع|قطعتين|اشخاص|افراد|مرات|شهور|اقساط)(?: |$)/.test(after)) return "quantity";
  if (Number.isInteger(mention.value) && mention.value >= 1 && mention.value <= 31 && /(?:^| )و?يوم +$/.test(before)) return "date";
  if (Number.isInteger(mention.value) && /(?:^| )(?:[ولبف])?(?:ال)?(?:اتوبيس|اوتوبيس|ايفون|iphone|موديل|طراز) +$/i.test(before)) return "label";
}

function dateEvidence(text: string, today: string, todayMs: number): string | undefined {
  const normalized = foldForMatch(text);
  const days = new Set<string>();
  for (const match of normalized.matchAll(/(?:^| )و?(?:(اول )?(امبارح|مبارح|امس)|(?:النهارده|اليوم))(?= |$)/g)) {
    const offset = match[2] ? (match[1] ? -2 : -1) : 0;
    days.add(businessDateKey(new Date(todayMs + offset * DAY_MS), "UTC"));
  }
  for (const match of arabicIndicToAscii(text).matchAll(WRITTEN_DAY)) {
    const [, first, , month, last] = match;
    if (first.length === 4 && last.length <= 2) days.add(`${first}-${month.padStart(2, "0")}-${last.padStart(2, "0")}`);
    else if (last.length === 4 && first.length <= 2) days.add(`${last}-${month.padStart(2, "0")}-${first.padStart(2, "0")}`);
    else days.add("ambiguous");
  }
  if (!days.size) {
    for (const match of normalized.matchAll(/(?:^| )و?يوم +(\d{1,2})(?= |$)/g)) {
      const day = Number(match[1]);
      if (day >= 1 && day <= 31) days.add(`${today.slice(0, 8)}${match[1].padStart(2, "0")}`);
    }
  }
  if (days.size > 1 || /(?:^| )و?(?:اول الشهر|نص الشهر|اخر الشهر|(?:الشهر|الاسبوع|السنه|يوم .+?) اللي فات(?:ت)?|من (?:كام|يومين|فتره))(?: |$)/.test(normalized)) return "ambiguous";
  return days.values().next().value;
}

export function guardReading(reading: Reading, sentence: string, ctx: GuardContext, eventsDropped = false): GuardedReading {
  const text = evidenceText(sentence);
  const mentions = numberMentionSpans(text);
  const today = Date.parse(`${ctx.today}T12:00:00Z`);
  // The narrator can repeat another person's words without asserting the payment as their own.
  const reported = [...sentence.matchAll(/(?:^|[\s،؛.])(?:قال(?:ت|وا)?|كتب(?:ت|وا)?|بيقول(?:وا)?|بتقول)\s*[:،]?\s*(?:«([^»]+)»|“([^”]+)”|"([^"]+)")/gu)]
    .flatMap(match => spansOf(evidenceText(match[1] ?? match[2] ?? match[3]), text));
  const quoteSpans = reading.events.map((event) => spansOf(evidenceText(event.quote), text));
  const replyFlags = new Set<ReplyFlag>();
  if (eventsDropped) replyFlags.add("events_dropped");
  const taken = new Set<number>();
  const explained = new Set<number>();
  const seen = new Set<string>();
  const ignoredNumbers = new Set<number>();
  const ignoredSpans: Span[] = [];

  for (const ignored of reading.ignored) {
    const spans = spansOf(evidenceText(ignored.quote), text);
    if (spans.length !== 1 || (ignored.why === "negated" && !detectNegation(ignored.quote).negated)) {
      replyFlags.add("ignored_quote_unverified");
      continue;
    }
    ignoredSpans.push(spans[0]);
    mentions.forEach((mention, index) => {
      if (contains(spans[0], mention)) ignoredNumbers.add(index);
    });
  }

  const roles = mentions.map((mention) => localNumberRole(text, mention));
  for (const [written] of arabicIndicToAscii(sentence).matchAll(WRITTEN_DAY)) {
    const spans = spansOf(evidenceText(written), text);
    mentions.forEach((mention, index) => { if (spans.some((span) => contains(span, mention))) roles[index] = "date"; });
  }
  // A lone number after an item name can still be its price. A separate price disambiguates the label.
  if (mentions.filter((_, index) => !ignoredNumbers.has(index)).length === 1) {
    roles.forEach((role, index) => { if (role === "label") roles[index] = undefined; });
  }
  const explicitTotals = roles.flatMap((role, index) => role === "total" && !ignoredNumbers.has(index) ? [index] : []);
  const independentPrices = roles.filter((role, index) => !role && !ignoredNumbers.has(index)).length;
  const totals = new Set(independentPrices > 1 ? explicitTotals : []);
  const roleNumbers = new Map<number, Reading["numbers"][number]["role"]>();

  for (const entry of reading.numbers) {
    const evidence = evidenceText(entry.text);
    const spans = spansOf(evidence, text);
    const values = numberMentionSpans(evidence);
    for (const value of values) {
      const index = mentions.findIndex((mention, at) => {
        if (roleNumbers.has(at) || ignoredNumbers.has(at) || cents(mention.value) !== cents(value.value) ||
            !spans.some((span) => span.start + value.start === mention.start)) return false;
        const role = roles[at];
        if (role) return role === entry.role || (role === "quantity" && entry.role === "count");
        if (entry.role === "total") return reading.events.length > 1;
        if (PAYMENT_VERB.test(text.slice(0, mention.start))) return false;
        return quoteSpans.some((quotes) => quotes.some((quote) => contains(quote, mention)));
      });
      if (index < 0) {
        replyFlags.add("number_role_unverified");
        continue;
      }
      roleNumbers.set(index, entry.role);
      if (entry.role === "total") totals.add(index);
    }
    if (!values.length) replyFlags.add("number_role_unverified");
  }

  const nonAmounts = new Set([...ignoredNumbers, ...roleNumbers.keys(), ...totals]);
  roles.forEach((role, index) => { if (role && role !== "total") nonAmounts.add(index); });

  const coveredSpans = [...quoteSpans.flat(), ...ignoredSpans];
  if (reading.events.length) {
    for (const match of text.matchAll(/(?:^| )(?:[وف])?(دفعت|صرفت|سددت|حولت|قبضت|اشتريت|جبت)(?= |$)/g)) {
      const end = match.index + match[0].length;
      const namesTotal = [...totals].some((index) => /^(?: ب| بمبلغ)? +$/.test(text.slice(end, mentions[index].start)));
      if (!namesTotal && !coveredSpans.some((span) => contains(span, { start: end - match[1].length, end }))) {
        replyFlags.add("action_unaccounted");
      }
    }
  }

  const events = reading.events.map((event, eventIndex): GuardedEvent => {
    const flags: EventFlag[] = [];
    const next: GuardedEvent = { ...event, flags };
    const spans = quoteSpans[eventIndex];
    if (reported.some(quote => spans.some(span => span.start < quote.end && quote.start < span.end))) {
      flags.push("reported_quote");
    }

    // ── Money ──
    if (!(event.amount > 0)) {
      flags.push("amount_missing");
    } else {
      const scoped = mentions.flatMap((mention, index) => spans.some((span) => contains(span, mention)) ? [index] : []);
      const usable = scoped.filter((index) => !nonAmounts.has(index));
      let source = sourceOfAmount(event.amount, usable.map((index) => mentions[index].value),
        new Set(usable.flatMap((index, position) => taken.has(index) ? [position] : [])));
      const matchesAmount = (mention: Mention): boolean => cents(mention.value) === cents(event.amount);
      const hasRoleValue = scoped.some((index) => matchesAmount(mentions[index]));
      let evidenceIndexes = usable;
      if (source.kind === "absent" && !hasRoleValue && usable.length < scoped.length) {
        evidenceIndexes = scoped.filter((index) => {
          const role = roles[index] ?? roleNumbers.get(index);
          return !ignoredNumbers.has(index) && (!role || role === "quantity" || role === "count" || role === "unit_price" || role === "total");
        });
        source = sourceOfAmount(event.amount, evidenceIndexes.map((index) => mentions[index].value), new Set());
      }
      if (source.kind === "stated") {
        const index = evidenceIndexes[source.index];
        taken.add(index);
        explained.add(index);
      } else if (source.kind === "derived") {
        flags.push("amount_derived");
        source.indexes.forEach((index) => explained.add(evidenceIndexes[index]));
      } else if (hasRoleValue) {
        flags.push("amount_has_non_money_role");
      } else if (mentions.some(matchesAmount)) {
        flags.push("amount_outside_quote");
      } else {
        flags.push("amount_not_in_text");
      }
      if (event.amount > ctx.maxAmount) flags.push("amount_out_of_range");
    }

    // ── The user's own words ──
    if (!spans.length && !quoteIsFromText(event.quote, sentence)) flags.push("quote_not_in_text");

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

    if (event.person && !quoteIsFromText(event.person, sentence)) flags.push("person_unverified");

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
    const dateText = reading.events.length === 1 && !reading.ignored.length ? sentence : event.quote;
    const expectedDate = dateEvidence(dateText, ctx.today, today);
    const date = Date.parse(`${event.date}T12:00:00Z`);
    if (event.date && (!Number.isFinite(date) || date > today || today - date > ctx.maxDaysBack * DAY_MS ||
        businessDateKey(new Date(date), "UTC") !== event.date)) {
      next.date = "";
      flags.push("date_invalid");
    } else if ((expectedDate ?? ctx.today) !== (event.date || ctx.today)) {
      flags.push("date_unverified");
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
  // An announced total is a cross-check, never an extra item alongside its component amounts.
  const sum = events.reduce((acc, event) => acc + cents(event.amount), 0);
  if (totals.size && (totals.size !== 1 || [...totals].some((index) => cents(mentions[index].value) !== sum))) {
    replyFlags.add("total_mismatch");
  }
  const unaccounted = mentions.flatMap((mention, index) => explained.has(index) || nonAmounts.has(index) ? [] : [mention.value]);
  if (unaccounted.length) replyFlags.add("number_unaccounted");

  return {
    events,
    ignored: reading.ignored,
    numbers: reading.numbers,
    ask: reading.ask,
    askAbout: reading.askAbout,
    flags: [...replyFlags],
    unaccounted,
  };
}
