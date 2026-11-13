/**
 * Scores what the engine answered against what a labelled case says is right. Pure: no clock,
 * no files, no model.
 *
 * The number this exists for is G1 (SPEC section 2): of the readings the engine would have
 * saved on its own, how many saved something wrong. A save is wrong when an event is missing
 * or extra, or a matched event has the wrong amount, kind, flow or category, and any save of a
 * sentence that should have been shown, asked about or left alone is wrong whatever its labels.
 */
import { categoryAllowsKind } from "../../../contracts/taxonomy";
import type { MovementKind } from "../../../contracts/ledger-movement";
import { foldForMatch } from "../../lib/understanding/numbers";
import { resolveGoldDate, type EvalCase, type EvalSet, type Expectation, type GoldEvent } from "./set";

export type Outcome = "save" | "show" | "ask";

/** One event as the harness records it from the engine's answer. */
export interface PredictedEvent {
  quote: string;
  amount: number;
  kind: MovementKind;
  flow: "out" | "in";
  category: string;
  sub: string;
  what: string;
  person: string;
  personRole: string;
  personRelation?: string;
  commitment: string;
  installments: number;
  wallet: string;
  date: string;
  doubt: string;
  flags: string[];
  reasons: string[];
}

export interface CaseUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  totalTokens: number;
  servedBy: string | null;
  model: string | null;
  degradedSchema: boolean;
  attempts: Array<{ slug: string; model: string; ok: boolean; latencyMs: number; failure?: string; status?: number; retryAfterMs?: number; message?: string }>;
}

/** One finished case, as one line of `results.jsonl`. */
export interface CaseResult {
  id: string;
  /** The Cairo business day the case ran on: relative gold dates resolve against it. */
  today: string;
  outcome: Outcome;
  question?: string;
  askAbout?: string;
  source: string;
  events: PredictedEvent[];
  /** Every event flag of the reading, de-duplicated. */
  flags: string[];
  /** Reading-level reasons of the verdict. */
  reasons: string[];
  usage: CaseUsage;
  /** Wall-clock time of the `understand` call, measured by the harness. */
  latencyMs: number;
  /** The engine's own latency figure. */
  engineLatencyMs: number;
  problems: string[];
  versions: Record<string, string>;
  /** Rate-limit retries this case needed before it finished. */
  retries: number;
}

export interface FieldMarks {
  kind: boolean;
  flow: boolean;
  category: boolean;
  sub: boolean;
  /** null when the gold event names no person: nothing to score. */
  person: boolean | null;
  date: boolean;
}

export interface MatchedPair {
  gold: GoldEvent;
  predicted: PredictedEvent;
  fields: FieldMarks;
}

export interface CaseScore {
  id: string;
  expect: Expectation;
  outcome: Outcome;
  eventsMatched: number;
  missing: GoldEvent[];
  extra: PredictedEvent[];
  matched: MatchedPair[];
  /** Saved on its own and something G1 counts is wrong, or saved when it must not be. */
  unsafeSave: boolean;
  /** Saved on its own, `clear`, and every field right except perhaps the sub. */
  correctSave: boolean;
  /** Saved on its own, nothing G1 counts is wrong, but a person or a date is: neither unsafe nor correct. */
  slipSave: boolean;
  needlessQuestion: boolean;
  missedQuestion: boolean;
  /** Asked, and the case is `ask` or `none`. */
  rightQuestion: boolean;
  showRight: boolean;
  showWrong: boolean;
}

const cents = (amount: number) => Math.round(amount * 100);

function goldPairs(gold: GoldEvent): Array<[string, string]> {
  return [[gold.category, gold.sub], ...(gold.alt ?? [])];
}

export function categoryRight(gold: GoldEvent, predicted: Pick<PredictedEvent, "category">): boolean {
  return goldPairs(gold).some(([category]) => category === predicted.category);
}

/** Right when the predicted (category, sub) is the gold pair or one of its alternatives. */
export function subRight(gold: GoldEvent, predicted: Pick<PredictedEvent, "category" | "sub">): boolean {
  return goldPairs(gold).some(([category, sub]) => category === predicted.category && sub === predicted.sub);
}

/**
 * The kind is the gold kind; an alternative from another group (D-085's `people_transfer` for a
 * `spending` label) carries its own bound kind, so a reading that took that alternative is right
 * on kind when the alternative's category allows it.
 */
export function kindRight(gold: GoldEvent, predicted: Pick<PredictedEvent, "kind" | "category">): boolean {
  if (predicted.kind === gold.kind) return true;
  return (gold.alt ?? []).some(
    ([category]) => category === predicted.category && !categoryAllowsKind(category, gold.kind) && categoryAllowsKind(category, predicted.kind),
  );
}

/** Folded containment either way: «لمستر احمد» names «احمد». */
export function personRight(goldPerson: string | undefined, predicted: string): boolean | null {
  if (!goldPerson) return null;
  const gold = foldForMatch(goldPerson);
  const got = foldForMatch(predicted);
  if (!gold || !got) return false;
  return got.includes(gold) || gold.includes(got);
}

/** The engine writes "" for today; a gold event without a date means today. */
export function dateRight(gold: GoldEvent, predicted: string, today: string): boolean {
  const want = resolveGoldDate(gold.date, today);
  const got = predicted && predicted !== today ? predicted : "";
  return want === today ? got === "" : got === want;
}

export function markFields(gold: GoldEvent, predicted: PredictedEvent, today: string): FieldMarks {
  return {
    kind: kindRight(gold, predicted),
    flow: predicted.flow === gold.flow,
    category: categoryRight(gold, predicted),
    sub: subRight(gold, predicted),
    person: personRight(gold.person, predicted.person),
    date: dateRight(gold, predicted.date, today),
  };
}

/**
 * Pairs predicted events with gold events by exact amount in cents, each used once. Among
 * events of the same amount, pairs whose category is right are made first, then the rest in
 * order, so «400 دكتور و 400 صيدلية» pairs each with its own label whatever order it came in.
 */
export function matchEvents(gold: readonly GoldEvent[], predicted: readonly PredictedEvent[]): { pairs: Array<[number, number]>; missing: number[]; extra: number[] } {
  const usedGold = new Set<number>();
  const usedPredicted = new Set<number>();
  const pairs: Array<[number, number]> = [];
  for (const preferCategory of [true, false]) {
    predicted.forEach((event, p) => {
      if (usedPredicted.has(p)) return;
      const g = gold.findIndex(
        (candidate, index) => !usedGold.has(index) && cents(candidate.amount) === cents(event.amount) && (!preferCategory || categoryRight(candidate, event)),
      );
      if (g < 0) return;
      usedGold.add(g);
      usedPredicted.add(p);
      pairs.push([g, p]);
    });
  }
  pairs.sort((a, b) => a[0] - b[0]);
  return {
    pairs,
    missing: gold.map((_, index) => index).filter((index) => !usedGold.has(index)),
    extra: predicted.map((_, index) => index).filter((index) => !usedPredicted.has(index)),
  };
}

export function scoreCase(item: EvalCase, result: Pick<CaseResult, "outcome" | "events" | "today">): CaseScore {
  const { pairs, missing, extra } = matchEvents(item.events, result.events);
  const matched = pairs.map(([g, p]): MatchedPair => ({
    gold: item.events[g],
    predicted: result.events[p],
    fields: markFields(item.events[g], result.events[p], result.today),
  }));
  const shapeRight = missing.length === 0 && extra.length === 0;
  // Amounts are right by construction of the match: a wrong amount is a missing plus an extra.
  const g1Right = shapeRight && matched.every(({ fields }) => fields.kind && fields.flow && fields.category);
  const allRight = g1Right && matched.every(({ fields }) => fields.sub && fields.person !== false && fields.date);
  const restRight = g1Right && matched.every(({ fields }) => fields.person !== false && fields.date);

  const saved = result.outcome === "save";
  const unsafeSave = saved && (item.expect !== "clear" || !g1Right);
  const correctSave = saved && item.expect === "clear" && restRight;
  return {
    id: item.id,
    expect: item.expect,
    outcome: result.outcome,
    eventsMatched: matched.length,
    missing: missing.map((index) => item.events[index]),
    extra: extra.map((index) => result.events[index]),
    matched,
    unsafeSave,
    correctSave,
    slipSave: saved && !unsafeSave && !correctSave,
    needlessQuestion: result.outcome === "ask" && (item.expect === "clear" || item.expect === "doubt"),
    missedQuestion: saved && (item.expect === "ask" || item.expect === "none") && result.events.length > 0,
    rightQuestion: result.outcome === "ask" && (item.expect === "ask" || item.expect === "none"),
    showRight: result.outcome === "show" && allRight,
    showWrong: result.outcome === "show" && !allRight,
  };
}

// ─── Aggregate ──────────────────────────────────────────────────────────────────

export interface Rate {
  count: number;
  of: number;
  /** count / of, or null when nothing was counted. */
  rate: number | null;
}

const rate = (count: number, of: number): Rate => ({ count, of, rate: of > 0 ? count / of : null });

/** Nearest-rank percentile; null for no values. */
export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export interface Aggregate {
  cases: number;
  /** Ids in the results that the set does not have; ignored. */
  unknownIds: string[];
  outcomes: Record<Outcome, number>;
  /** expect → outcome → count. */
  byExpect: Record<Expectation, Record<Outcome, number>>;
  /** G1: unsafe saves over every case the engine saved on its own. */
  wrongAutoSave: Rate;
  correctSave: Rate;
  slipSave: Rate;
  /** correctSave over all cases (G2). */
  noExtraTap: Rate;
  /** Cases that ended in a question, over all cases (G2). */
  question: Rate;
  needlessQuestion: Rate;
  missedQuestion: Rate;
  rightQuestion: Rate;
  showRight: Rate;
  showWrong: Rate;
  goldEvents: number;
  eventsMatched: number;
  missing: number;
  extra: number;
  fields: Record<keyof FieldMarks, Rate>;
  latencyMs: { p50: number | null; p95: number | null; max: number | null };
  tokens: {
    total: { prompt: number; completion: number; cached: number; total: number };
    perCase: { prompt: number; completion: number; cached: number; total: number };
  };
  retries: number;
  degradedSchema: number;
  /** In how many cases each event flag fired. */
  flags: Record<string, number>;
  /** In how many cases each reason (reading-level or event-level) fired. */
  reasons: Record<string, number>;
  /** Wrong categories of matched events: "gold → predicted" → case ids. */
  confusion: Array<{ gold: string; predicted: string; ids: string[] }>;
}

const OUTCOMES: readonly Outcome[] = ["save", "show", "ask"];
const zeroOutcomes = (): Record<Outcome, number> => ({ save: 0, show: 0, ask: 0 });
const bump = (map: Record<string, number>, key: string) => {
  map[key] = (map[key] ?? 0) + 1;
};

export function aggregate(set: EvalSet, results: readonly CaseResult[]): { scores: CaseScore[]; aggregate: Aggregate } {
  const byId = new Map(set.cases.map((item) => [item.id, item]));
  const scored: Array<{ score: CaseScore; result: CaseResult }> = [];
  const unknownIds: string[] = [];
  for (const result of results) {
    const item = byId.get(result.id);
    if (item) scored.push({ score: scoreCase(item, result), result });
    else unknownIds.push(result.id);
  }
  const scores = scored.map(({ score }) => score);
  const n = scores.length;
  const count = (test: (score: CaseScore) => boolean) => scores.filter(test).length;

  const outcomes = zeroOutcomes();
  const byExpect = { clear: zeroOutcomes(), doubt: zeroOutcomes(), ask: zeroOutcomes(), none: zeroOutcomes() } as Record<Expectation, Record<Outcome, number>>;
  for (const score of scores) {
    outcomes[score.outcome] += 1;
    byExpect[score.expect][score.outcome] += 1;
  }

  const pairs = scores.flatMap((score) => score.matched);
  const field = (key: keyof FieldMarks) => {
    const marks = pairs.map((pair) => pair.fields[key]).filter((mark): mark is boolean => mark !== null);
    return rate(marks.filter(Boolean).length, marks.length);
  };

  const latencies = scored.map(({ result }) => result.latencyMs);
  const total = { prompt: 0, completion: 0, cached: 0, total: 0 };
  const flags: Record<string, number> = {};
  const reasons: Record<string, number> = {};
  let retries = 0;
  let degradedSchema = 0;
  for (const { result } of scored) {
    total.prompt += result.usage.promptTokens;
    total.completion += result.usage.completionTokens;
    total.cached += result.usage.cachedTokens;
    total.total += result.usage.totalTokens;
    retries += result.retries;
    if (result.usage.degradedSchema) degradedSchema += 1;
    new Set(result.flags).forEach((flag) => bump(flags, flag));
    new Set([...result.reasons, ...result.events.flatMap((event) => event.reasons)]).forEach((reason) => bump(reasons, reason));
  }
  const per = (value: number) => (n > 0 ? value / n : 0);

  const confusionMap = new Map<string, { gold: string; predicted: string; ids: string[] }>();
  for (const score of scores) {
    for (const pair of score.matched) {
      if (pair.fields.category) continue;
      const key = `${pair.gold.category}→${pair.predicted.category}`;
      const entry = confusionMap.get(key) ?? { gold: pair.gold.category, predicted: pair.predicted.category, ids: [] };
      entry.ids.push(score.id);
      confusionMap.set(key, entry);
    }
  }

  const saves = outcomes.save;
  return {
    scores,
    aggregate: {
      cases: n,
      unknownIds,
      outcomes,
      byExpect,
      wrongAutoSave: rate(count((s) => s.unsafeSave), saves),
      correctSave: rate(count((s) => s.correctSave), saves),
      slipSave: rate(count((s) => s.slipSave), saves),
      noExtraTap: rate(count((s) => s.correctSave), n),
      question: rate(outcomes.ask, n),
      needlessQuestion: rate(count((s) => s.needlessQuestion), n),
      missedQuestion: rate(count((s) => s.missedQuestion), n),
      rightQuestion: rate(count((s) => s.rightQuestion), n),
      showRight: rate(count((s) => s.showRight), outcomes.show),
      showWrong: rate(count((s) => s.showWrong), outcomes.show),
      goldEvents: scored.reduce((sum, { score }) => sum + byId.get(score.id)!.events.length, 0),
      eventsMatched: pairs.length,
      missing: scores.reduce((sum, score) => sum + score.missing.length, 0),
      extra: scores.reduce((sum, score) => sum + score.extra.length, 0),
      fields: { kind: field("kind"), flow: field("flow"), category: field("category"), sub: field("sub"), person: field("person"), date: field("date") },
      latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95), max: latencies.length ? Math.max(...latencies) : null },
      tokens: { total, perCase: { prompt: per(total.prompt), completion: per(total.completion), cached: per(total.cached), total: per(total.total) } },
      retries,
      degradedSchema,
      flags,
      reasons,
      confusion: [...confusionMap.values()].sort((a, b) => b.ids.length - a.ids.length || a.gold.localeCompare(b.gold)),
    },
  };
}

export { OUTCOMES };
