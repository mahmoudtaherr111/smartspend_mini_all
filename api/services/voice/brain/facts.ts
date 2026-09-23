/**
 * Every number the call is allowed to say: what tools returned, what the call opened with, and what the user said.
 * The spoken-number check compares the assistant's words against this ledger.
 */
import { roundForSpeech, spellAmount } from "./spoken";

export type FactSource = "ledger" | "snapshot" | "user" | "computed" | "price" | "draft";

export interface CallFact {
  id: string;
  label: string;
  value: number;
  /** How to say it; tools hand this to the model. */
  say: string;
  source: FactSource;
  /** Tool call or turn that produced it, so a correction can point at the latest answer. */
  batch: number;
}

export class FactLedger {
  private readonly facts: CallFact[] = [];
  private readonly userValues = new Set<number>();
  private batch = 0;

  /** Starts a new batch (one tool answer); facts added until the next call belong to it. */
  nextBatch(): number {
    this.batch += 1;
    return this.batch;
  }

  add(fact: Omit<CallFact, "batch" | "say"> & { say?: string; exact?: boolean }): CallFact {
    const entry: CallFact = {
      id: fact.id,
      label: fact.label,
      value: fact.value,
      source: fact.source,
      say: fact.say ?? spellAmount(fact.value, { exact: fact.exact }).text,
      batch: this.batch,
    };
    this.facts.push(entry);
    if (this.facts.length > 400) this.facts.shift();
    return entry;
  }

  noteUserValue(value: number): void {
    if (Number.isFinite(value)) this.userValues.add(Math.abs(value));
  }

  all(): readonly CallFact[] {
    return this.facts;
  }

  latestBatch(): CallFact[] {
    const last = this.facts[this.facts.length - 1]?.batch;
    return last === undefined ? [] : this.facts.filter((fact) => fact.batch === last);
  }

  /** True when `value` is one of the call's numbers, as is or as speech rounds it. */
  allows(value: number, approximate: boolean): boolean {
    const v = Math.abs(value);
    if (this.userValues.has(v)) return true;
    for (const fact of this.facts) {
      const f = Math.abs(fact.value);
      if (Math.abs(v - f) < 0.5) return true;
      if (Math.abs(v - roundForSpeech(f).value) < 0.5) return true;
      // "حوالي تلات آلاف" for 3,456 is an honest approximation, not a wrong number.
      if (approximate && f > 0 && Math.abs(v - f) / f <= 0.15) return true;
    }
    return false;
  }

  snapshot(): { facts: CallFact[]; userValues: number[]; batch: number } {
    return { facts: this.facts.slice(-200), userValues: [...this.userValues].slice(-200), batch: this.batch };
  }

  restore(state: { facts?: CallFact[]; userValues?: number[]; batch?: number } | null | undefined): void {
    if (!state) return;
    this.facts.splice(0, this.facts.length, ...(state.facts ?? []));
    this.userValues.clear();
    for (const value of state.userValues ?? []) this.userValues.add(value);
    this.batch = state.batch ?? 0;
  }
}
