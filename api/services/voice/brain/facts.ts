/**
 * Every number the call is allowed to say: what tools returned, what the call opened with, and what the user said.
 * The spoken-number check compares the assistant's words against this ledger.
 */
import { roundForSpeech, spellAmount } from "./spoken";

export type FactSource =
  | "ledger"
  | "snapshot"
  | "user"
  | "computed"
  | "price"
  | "draft";

/** What a number counts: pounds, pounds a day or a month, days, months, a count, a percent, a ratio. */
export type FactUnit =
  | "EGP"
  | "EGP/day"
  | "EGP/month"
  | "days"
  | "months"
  | "count"
  | "percent"
  | "ratio";
export type FactMetric =
  | "spending"
  | "income"
  | "balance"
  | "debt"
  | "budget"
  | "goal";

/** Explicit financial nouns only; silence about the subject is not evidence of a different subject. */
export function factMetric(text: string): FactMetric | undefined {
  const normalized = text.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه");
  const nouns: Array<[FactMetric, RegExp]> = [
    ["spending", /مصروف|مصاريف|صرفت|اجمالي الصرف/],
    ["income", /مرتب|راتب|دخل|قبضت/],
    ["balance", /رصيد|ارصده|ارصدة|معاك|معايا/],
    ["debt", /ديون|دين|سلف|مديون/],
    ["budget", /ميزاني/],
    ["goal", /هدف|اهداف/],
  ];
  let metric: FactMetric | undefined;
  let last = -1;
  for (const [candidate, pattern] of nouns) {
    for (const match of normalized.matchAll(new RegExp(pattern.source, "g"))) {
      if (match.index! > last) {
        last = match.index!;
        metric = candidate;
      }
    }
  }
  return metric;
}

/** Facts read from the records, which a write or new data during the call can make out of date. */
const RECORD_SOURCES: ReadonlySet<FactSource> = new Set([
  "ledger",
  "snapshot",
  "computed",
]);

export interface CallFact {
  id: string;
  /**
   * The short handle a tool answer gives the model for this fact ("f12"), unique in the call, so a calculation can
   * name its inputs instead of retyping them.
   */
  ref: string;
  label: string;
  value: number;
  unit: FactUnit;
  /** How to say it; tools hand this to the model. */
  say: string;
  source: FactSource;
  /** Tool call or turn that produced it, so a correction can point at the latest answer. */
  batch: number;
  /**
   * Read before the records changed during the call (the call recorded something, or a bank message arrived): the
   * number was true when read and may not be now.
   */
  stale?: boolean;
  metric?: FactMetric;
  /** Scope and period stay attached to the fact and survive hand-off and resumption. */
  scope?: string;
  period?: string;
}

export class FactLedger {
  private readonly facts: CallFact[] = [];
  private readonly userValues = new Set<number>();
  private batch = 0;
  private refs = 0;

  /** Starts a new batch (one tool answer); facts added until the next call belong to it. */
  nextBatch(): number {
    this.batch += 1;
    return this.batch;
  }

  add(
    fact: Omit<CallFact, "batch" | "say" | "ref" | "unit"> & {
      say?: string;
      exact?: boolean;
      unit?: FactUnit;
    },
  ): CallFact {
    this.refs += 1;
    const entry: CallFact = {
      id: fact.id,
      ref: `f${this.refs}`,
      label: fact.label,
      value: fact.value,
      unit: fact.unit ?? "EGP",
      source: fact.source,
      metric: fact.metric ?? factMetric(fact.label),
      ...(fact.scope ? { scope: fact.scope } : {}),
      ...(fact.period ? { period: fact.period } : {}),
      say: fact.say ?? spellAmount(fact.value, { exact: fact.exact }).text,
      batch: this.batch,
      ...(fact.stale ? { stale: true } : {}),
    };
    this.facts.push(entry);
    if (this.facts.length > 400) this.facts.shift();
    return entry;
  }

  noteUserValue(value: number): void {
    if (Number.isFinite(value)) this.userValues.add(Math.abs(value));
  }

  /** Whether the user said this number in the call (or it is in what they told the app before). */
  heardFromUser(value: number): boolean {
    return this.userValues.has(Math.abs(value));
  }

  all(): readonly CallFact[] {
    return this.facts;
  }

  /** The fact a tool answer named "f12", if the call still holds it. */
  byRef(ref: string): CallFact | undefined {
    return this.facts.find((fact) => fact.ref === ref);
  }

  /**
   * The records changed during the call: every figure read from them so far is out of date. Returns how many were
   * marked. What the user said, drafts and prices stay as they were.
   */
  markRecordsChanged(): number {
    let marked = 0;
    for (const fact of this.facts) {
      if (RECORD_SOURCES.has(fact.source) && !fact.stale) {
        fact.stale = true;
        marked += 1;
      }
    }
    return marked;
  }

  /** Whether `value` is one of the call's numbers only through facts that went out of date. */
  onlyStale(value: number, approximate: boolean): boolean {
    const v = Math.abs(value);
    if (this.userValues.has(v)) return false;
    let matched = false;
    for (const fact of this.facts) {
      if (!this.matches(v, fact, approximate)) continue;
      if (!fact.stale) return false;
      matched = true;
    }
    return matched;
  }

  private matches(v: number, fact: CallFact, approximate: boolean): boolean {
    const f = Math.abs(fact.value);
    if (Math.abs(v - f) < 0.5) return true;
    if (Math.abs(v - roundForSpeech(f).value) < 0.5) return true;
    return approximate && f > 0 && Math.abs(v - f) / f <= 0.15;
  }

  latestBatch(): CallFact[] {
    const last = this.facts[this.facts.length - 1]?.batch;
    return last === undefined
      ? []
      : this.facts.filter((fact) => fact.batch === last);
  }

  /** True when `value` is one of the call's numbers, as is or as speech rounds it. */
  allows(value: number, approximate: boolean): boolean {
    const v = Math.abs(value);
    if (this.userValues.has(v)) return true;
    // "حوالي تلات آلاف" for 3,456 is an honest approximation, not a wrong number.
    return this.facts.some((fact) => this.matches(v, fact, approximate));
  }

  /**
   * A known salary is not evidence for a claim about spending: a fact of another metric never backs the claim. A fact
   * whose label names no metric ("أكل وشرب", "بقالة") is not of another subject, so it still can.
   */
  allowsClaim(
    value: number,
    approximate: boolean,
    metric: FactMetric | undefined,
  ): boolean {
    if (!metric) return this.allows(value, approximate);
    const subject = this.facts.filter(
      (fact) => (fact.metric === metric || fact.metric === undefined) && !fact.stale,
    );
    if (!subject.length) return this.userValues.has(Math.abs(value));
    return subject.some((fact) =>
      this.matches(Math.abs(value), fact, approximate),
    );
  }

  snapshot(): {
    facts: CallFact[];
    userValues: number[];
    batch: number;
    refs: number;
  } {
    return {
      facts: this.facts.slice(-200),
      userValues: [...this.userValues].slice(-200),
      batch: this.batch,
      refs: this.refs,
    };
  }

  restore(
    state:
      | {
          facts?: CallFact[];
          userValues?: number[];
          batch?: number;
          refs?: number;
        }
      | null
      | undefined,
  ): void {
    if (!state) return;
    // Facts stored before refs and units existed get them now, after the ones already numbered.
    let refs = state.refs ?? 0;
    const facts = (state.facts ?? []).map((fact) => ({
      ...fact,
      unit: fact.unit ?? "EGP",
      ref: fact.ref ?? `f${++refs}`,
    }));
    this.facts.splice(0, this.facts.length, ...facts);
    this.userValues.clear();
    for (const value of state.userValues ?? []) this.userValues.add(value);
    this.batch = state.batch ?? 0;
    this.refs = Math.max(
      refs,
      ...facts.map((fact) => Number(fact.ref.slice(1)) || 0),
    );
  }
}
