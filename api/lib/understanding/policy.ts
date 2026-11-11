/**
 * Save, show or ask.
 *
 * There is no confidence number here. An event is clean when every check of the guard
 * passed and the model raised no doubt; a clean event of a familiar kind and an ordinary
 * size is saved, with what was saved said out loud and an undo. Anything else is shown
 * first. A question is asked only when nothing can be recorded without the answer.
 *
 * The rules are settings (`understanding_*`), so what counts as "ordinary" is tuned from
 * measurements, not from a deploy.
 *
 * Why: docs/decisions/0052-understanding-engine.md.
 */
import type { AskAbout, IgnoredReason } from "./contract";
import { eventNeedsEyes, type GuardedEvent, type GuardedReading } from "./guard";

export type Outcome = "save" | "show" | "ask";

export interface PolicySettings {
  /** False sends every reading to the person first (a launch safety switch). */
  autoSave: boolean;
  /** At or above this amount, a category the user has never saved before is shown first. */
  reviewAmount: number;
  /** More events than this in one sentence are shown first. */
  autoMaxEvents: number;
  /** True shows an event dated on another day before saving it. */
  reviewDated: boolean;
}

export const DEFAULT_POLICY: PolicySettings = {
  autoSave: true,
  reviewAmount: 5000,
  autoMaxEvents: 6,
  reviewDated: true,
};

export interface PolicyFacts {
  /** Has this user saved this category and subcategory before? */
  isFamiliar: (category: string, sub: string) => boolean;
  /** Is this name one of the user's own people? */
  isKnownPerson: (name: string) => boolean;
}

export interface EventVerdict {
  /** Why this event is shown instead of saved; empty when it may be saved on its own. */
  reasons: string[];
}

export interface Verdict {
  outcome: Outcome;
  /** The question, when the outcome is `ask`. */
  question?: string;
  askAbout?: AskAbout;
  /** Parallel to the reading's events. */
  events: EventVerdict[];
  /** Reasons that belong to the whole reading. */
  reasons: string[];
}

/** What to say when a sentence held no finished event, by why its clauses were set aside. */
const NOTHING_TO_RECORD: Record<IgnoredReason | "empty", string> = {
  negated: "اللي قلته ماحصلش فعلاً، فما سجلناش حاجة. لو فيه عملية تمت اكتبها بمبلغها.",
  planned: "دي حاجة لسه هتحصل، فما سجلناهاش. سجّلها لما تدفع فعلاً.",
  question: "ده سؤال مش عملية. اسأل في الشات وهنجاوبك.",
  chatter: "مش لاقيين عملية في الكلام ده. اكتب دفعت إيه وبكام.",
  instruction: "مش لاقيين عملية نسجّلها. اكتب دفعت إيه وبكام.",
  already_counted: "مش لاقيين عملية جديدة في الكلام ده.",
  empty: "مش لاقيين عملية في الكلام ده. اكتب دفعت إيه وبكام.",
};

function eventReasons(event: GuardedEvent, facts: PolicyFacts, settings: PolicySettings): string[] {
  const reasons: string[] = event.flags.filter((flag) => flag !== "sub_repaired");
  if (event.amount >= settings.reviewAmount && !event.commitment && !facts.isFamiliar(event.category, event.sub)) {
    reasons.push("large_first_time");
  }
  if (event.date && settings.reviewDated) reasons.push("dated");
  if ((event.kind === "loan" || event.kind === "personal_transfer") && !(event.person && facts.isKnownPerson(event.person))) {
    reasons.push("person_needed");
  }
  return reasons;
}

export function decide(reading: GuardedReading, facts: PolicyFacts, settings: PolicySettings = DEFAULT_POLICY): Verdict {
  const saveable = reading.events.filter((event) => event.amount > 0);

  // Nothing to record: say why, or pass on the model's one question.
  if (saveable.length === 0) {
    const missingAmount = reading.events.find((event) => !(event.amount > 0));
    if (reading.ask) {
      return { outcome: "ask", question: reading.ask, askAbout: reading.askAbout, events: [], reasons: ["model_asked"] };
    }
    if (missingAmount) {
      const what = missingAmount.what || missingAmount.quote;
      return {
        outcome: "ask",
        question: what ? `«${what}» كان بكام؟` : "المبلغ كان كام؟",
        askAbout: "amount",
        events: [],
        reasons: ["amount_missing"],
      };
    }
    const why = reading.ignored[0]?.why ?? "empty";
    return { outcome: "ask", question: NOTHING_TO_RECORD[why], askAbout: "none", events: [], reasons: [`nothing:${why}`] };
  }

  const events = reading.events.map((event) => ({ reasons: eventReasons(event, facts, settings) }));
  const reasons: string[] = [...reading.flags];
  if (reading.events.some((event) => !(event.amount > 0))) reasons.push("amount_missing");
  if (reading.ask) reasons.push("model_asked");
  if (reading.events.length > settings.autoMaxEvents) reasons.push("many_events");
  if (!settings.autoSave) reasons.push("auto_save_off");

  const clean = reasons.length === 0 && events.every((event) => event.reasons.length === 0) && !reading.events.some(eventNeedsEyes);
  return { outcome: clean ? "save" : "show", events, reasons };
}
