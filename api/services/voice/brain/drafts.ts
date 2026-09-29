/**
 * Drafts and the gate in front of every write a call makes.
 *
 * Nothing is written from a call unless the latest draft is still pending and fresh, and either the user tapped
 * its card or their words after the assistant presented it say yes — without a new number and without a "no", a
 * correction, a condition or a reservation. "تمام" said before the draft existed or before it was read out, silence,
 * or a yes to something else is not consent.
 *
 * Passing the gate claims the draft: it becomes `executing` at once, so a tap and a spoken yes arriving together
 * (or a retry) run it once. From that moment the write has started; a later "no" cannot unsay it, only undo it.
 */
import { randomBytes } from "crypto";
import type { VoiceCard, VoiceDraftCard } from "../../../../contracts/voice-protocol";
import { extractSpokenNumbers } from "./validator";

export const DRAFT_TTL_MS = 2 * 60_000;

export type DraftStatus = VoiceDraftCard["status"];

export interface Draft<Payload = unknown> {
  id: string;
  kind: "expenses" | "action" | "undo" | "coach";
  title: string;
  lines: Array<{ label: string; amount?: number; detail?: string }>;
  total?: number;
  payload: Payload;
  createdAt: number;
  expiresAt: number;
  status: DraftStatus;
  /** When the assistant first spoke after the draft was made: a spoken yes counts only after it. */
  presentedAt?: number;
  /** Written ids once executed, for "undo the last thing". */
  resultIds?: number[];
  message?: string;
}

export type GateRefusal = "unknown_draft" | "not_latest" | "expired" | "not_pending" | "no_yes" | "changed" | "not_presented";

/**
 * Words are compared after this folding: diacritics and tatweel dropped, every alef as ا, ى as ي, ة as ه, so "أيوة",
 * "ايوه" and "آيوه" are one word.
 */
function fold(word: string): string {
  return word
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
}

const set = (words: string[]) => new Set(words.map(fold));

/** A plain yes to "أسجلها؟" / "أعملها؟". */
const YES = set([
  "اه", "ايوه", "ايوا", "اوه", "تمام", "ماشي", "ماشيه", "اوكي", "اوكيه", "اوك", "ok", "okay", "yes", "yeah", "اشطا", "حلو",
  "سجل", "سجلها", "سجلهم", "سجله", "احفظ", "احفظها", "احفظهم", "اكد", "اكدها", "موافق", "موافقه", "يلا", "خلاص", "اتفقنا",
  "اعمل", "اعملها", "اعمله", "اعملهم", "نفذ", "نفذها", "صح", "مظبوط", "بالظبط", "اكيد", "طبعا", "ياريت", "تسلم",
]);
/** A yes only when the draft itself removes something (undo, delete): to a new record, "الغيها" means drop it. */
const YES_TO_REMOVE = set(["امسح", "امسحها", "امسحهم", "الغي", "الغيها", "الغيهم", "شيل", "شيلها", "شيلهم"]);
/** No, wait, stop: never consent, whatever else the reply holds. */
const NO = set([
  "لا", "لاء", "لاا", "no", "nope", "مش", "مو", "ما", "مفيش", "بلاش", "استني", "استنا", "لحظه", "ثانيه", "غلط", "لسه",
  "معلش", "سيبك", "سيبها", "سيبهم", "انسي", "كنسل", "cancel", "بطل", "وقف",
]);
/** The reply changes the draft: a new draft is needed, not this one executed. */
const CHANGE = set([
  "غير", "غيرها", "بدل", "قصدي", "اقصد", "خلي", "خليها", "خليه", "خليهم", "عدل", "عدلها", "صحح", "ضيف", "زود", "نقص",
]);
/**
 * Words that make a yes something less: a condition ("لو وافقت"), a reservation ("تمام بس…"), only understanding
 * ("بفهم بس"), someone else's words ("قال آه"), later ("بعدين"), a question. Such a reply is asked again.
 */
const HEDGE = set([
  "بس", "لو", "ولا", "هفكر", "افكر", "بفكر", "بفهم", "افهم", "فاهم", "فاهمه", "بسال", "اسال", "يمكن", "بعدين", "بكره", "بكرا",
  "شويه", "قال", "قالي", "قالتلي", "قالها", "بيقول", "بتقول", "ايه", "وايه", "ليه", "ازاي", "امتي", "كام", "فين", "مين", "هل", "طب",
  "مستني", "هشوف", "نشوف",
]);
/** Words that carry nothing either way. */
const FILLER = set([
  "يا", "سمارت", "حبيبي", "حبيبتي", "كده", "كدا", "بقي", "والله", "ده", "دي", "دول", "دا", "هو", "هي", "انا", "اللي", "و", "طيب",
  "يعني", "بجد", "خالص", "اوي", "كلهم", "كلها", "الاتنين", "على", "عليها", "عليه", "من", "فضلك", "سمحت", "سمحتي", "لو_سمحت",
]);
/** At most this many other words beside a yes ("آه سجل الأكل والمواصلات"); a longer reply is something else. */
const MAX_OTHER_WORDS = 3;

/**
 * The user's reply to a draft, as the gate reads it. A "no", a change, a new number, a condition, a reservation,
 * a question or quoted words win over any yes they come with ("تمام بس ماتسجلش", "تمام أنا بفهم بس", "لو وافقت");
 * only a plain yes executes. Repeating the draft's own amounts is still a yes ("آه، الخمسين دي").
 */
export function readReply(
  text: string,
  draftNumbers: number[] = [],
  kind: Draft["kind"] = "expenses",
): "yes" | "no_or_change" | "unclear" {
  const reply = text
    .replace(/(مش|مفيش|ما فيش|مافيش)\s+مشكل[ةه]/g, " موافق ")
    .replace(/لو\s+سمحت(ي)?|من\s+فضلك/g, " ");
  if (!reply.trim()) return "unclear";
  const words = reply.replace(/[،,.!؛;:"«»()[\]-]/g, " ").split(/\s+/).filter(Boolean).map(fold);
  const question = /[؟?]/.test(reply);
  const yesWords = kind === "undo" ? new Set([...YES, ...YES_TO_REMOVE]) : YES;
  // Egyptian negation wraps the verb: "ماتسجلش", "متعملهاش", "مابقاش".
  const negated = (word: string) => NO.has(word) || (/^ما?.{2,}ش$/.test(word) && !yesWords.has(word));
  if (words.some((word) => negated(word) || CHANGE.has(word) || (kind !== "undo" && YES_TO_REMOVE.has(word)))) {
    return "no_or_change";
  }
  const known = new Set(draftNumbers.map((n) => Math.round(n * 100)));
  // "الستين" is sixty too: drop the article before reading numbers.
  const numbers = extractSpokenNumbers(reply.replace(/(^|\s)ال(?=\S)/g, "$1"));
  if (numbers.some((number) => number.value >= 1 && !known.has(Math.round(number.value * 100)))) {
    return "no_or_change";
  }
  if (question || words.some((word) => HEDGE.has(word))) return "unclear";
  if (!words.some((word) => yesWords.has(word))) return "unclear";
  const numberWords = new Set(draftNumbers.length ? words.filter((word) => extractSpokenNumbers(word.replace(/^ال/, "")).length > 0) : []);
  const others = words.filter((word) => !yesWords.has(word) && !FILLER.has(word) && !numberWords.has(word));
  return others.length <= MAX_OTHER_WORDS ? "yes" : "unclear";
}

export class DraftBook {
  private drafts: Draft[] = [];
  /** The user's words, with when they were heard, so a yes can be tied to what it answered. */
  private userWords: Array<{ at: number; text: string }> = [];
  /** When the assistant last spoke: user words after it are a new utterance, never the tail of an earlier one. */
  private lastAssistantAt = 0;

  constructor(private readonly now: () => number = Date.now) {}

  heardUser(text: string): void {
    const at = this.now();
    const last = this.userWords[this.userWords.length - 1];
    // Transcription arrives in pieces; pieces close together belong to the same utterance, unless the assistant
    // spoke in between ("…تلتمية" / "أسجلها؟" / "آه" is two utterances however fast the answer came).
    if (last && at - last.at < 1_500 && last.at > this.lastAssistantAt) {
      last.text += text;
      last.at = at;
    } else {
      this.userWords.push({ at, text });
    }
    if (this.userWords.length > 50) this.userWords.shift();
  }

  /** What the user said after `since`. */
  wordsSince(since: number): string {
    return this.userWords.filter((entry) => entry.at > since).map((entry) => entry.text).join(" ").trim();
  }

  add<P>(draft: Omit<Draft<P>, "id" | "createdAt" | "expiresAt" | "status">): Draft<P> {
    const createdAt = this.now();
    for (const pending of this.drafts) {
      if (pending.status === "pending") pending.status = "cancelled";
    }
    const entry: Draft<P> = {
      ...draft,
      id: `dr_${randomBytes(6).toString("base64url")}`,
      createdAt,
      expiresAt: createdAt + DRAFT_TTL_MS,
      status: "pending",
    };
    this.drafts.push(entry as Draft);
    if (this.drafts.length > 30) this.drafts.shift();
    return entry;
  }

  get(id: string): Draft | undefined {
    return this.drafts.find((draft) => draft.id === id);
  }

  latestPending(): Draft | undefined {
    this.expire();
    return [...this.drafts].reverse().find((draft) => draft.status === "pending");
  }

  latestExecuted(kind: Draft["kind"]): Draft | undefined {
    return [...this.drafts].reverse().find((draft) => draft.kind === kind && draft.status === "executed");
  }

  /** The assistant is speaking: the latest pending draft is now being read out to the user. */
  heardAssistant(): void {
    const at = this.now();
    this.lastAssistantAt = at;
    for (const draft of this.drafts) {
      if (draft.status === "pending" && draft.presentedAt === undefined && at >= draft.createdAt) draft.presentedAt = at;
    }
  }

  /**
   * May the draft be executed now? `byTap` is a tap on its card, an explicit act; a voice confirmation needs the
   * user's own yes after the assistant presented the draft. A draft that passes is claimed (`executing`) before this
   * returns, so a second tap or yes is refused as `not_pending`.
   */
  gate(id: string, byTap: boolean): { ok: true; draft: Draft } | { ok: false; reason: GateRefusal } {
    this.expire();
    const draft = this.get(id);
    if (!draft) return { ok: false, reason: "unknown_draft" };
    if (draft.status === "expired") return { ok: false, reason: "expired" };
    if (draft.status !== "pending") return { ok: false, reason: "not_pending" };
    if (this.latestPending()?.id !== id) return { ok: false, reason: "not_latest" };
    if (!byTap) {
      if (draft.presentedAt === undefined) return { ok: false, reason: "not_presented" };
      const amounts = [...draft.lines.map((line) => line.amount ?? 0), draft.total ?? 0].filter((n) => n > 0);
      const reply = readReply(this.wordsSince(draft.presentedAt), amounts, draft.kind);
      if (reply === "no_or_change") return { ok: false, reason: "changed" };
      if (reply !== "yes") return { ok: false, reason: "no_yes" };
    }
    draft.status = "executing";
    return { ok: true, draft };
  }

  /** A claimed draft whose write never started (the call was stopped first) waits for an answer again. */
  release(id: string): void {
    const draft = this.get(id);
    if (draft?.status === "executing") draft.status = "pending";
  }

  settle(id: string, status: DraftStatus, patch: Partial<Pick<Draft, "resultIds" | "message">> = {}): Draft | undefined {
    const draft = this.get(id);
    if (!draft) return undefined;
    draft.status = status;
    Object.assign(draft, patch);
    return draft;
  }

  awaiting(): boolean {
    return Boolean(this.latestPending());
  }

  card(draft: Draft, requiresTap = false): VoiceCard {
    return {
      kind: "draft",
      draftId: draft.id,
      title: draft.title,
      items: draft.lines,
      total: draft.total,
      status: draft.status,
      requiresTap,
      expiresAt: new Date(draft.expiresAt).toISOString(),
      message: draft.message,
    };
  }

  summary(): { done: string[]; notDone: string[] } {
    const done = this.drafts.filter((draft) => draft.status === "executed").map((draft) => draft.message ?? draft.title);
    const notDone = this.drafts
      .filter((draft) => draft.status === "pending" || draft.status === "expired" || draft.status === "failed")
      .map((draft) => draft.title);
    // A write that started and has no answer yet is neither: the end card says it is still being checked.
    for (const draft of this.drafts) if (draft.status === "executing") notDone.push(`${draft.title} (لسه بنتأكد إنه اتنفذ)`);
    return { done, notDone };
  }

  snapshot(): { drafts: Draft[]; userWords: Array<{ at: number; text: string }> } {
    return { drafts: this.drafts, userWords: this.userWords.slice(-10) };
  }

  restore(state: { drafts?: Draft[]; userWords?: Array<{ at: number; text: string }> } | null | undefined): void {
    if (!state) return;
    this.drafts = state.drafts ?? [];
    this.userWords = state.userWords ?? [];
  }

  private expire(): void {
    const now = this.now();
    for (const draft of this.drafts) {
      if (draft.status === "pending" && draft.expiresAt <= now) draft.status = "expired";
    }
  }
}
