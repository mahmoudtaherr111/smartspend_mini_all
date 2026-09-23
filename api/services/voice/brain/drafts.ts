/**
 * Drafts and the gate in front of every write a call makes.
 *
 * Nothing is written from a call unless the latest draft is still pending and fresh, and either the user tapped
 * its card or their last words after it was presented say yes — without a new number and without a "no" or a
 * correction. "تمام" said before the draft existed, silence, or a yes to something else is not consent.
 */
import { randomBytes } from "crypto";
import type { VoiceCard, VoiceDraftCard } from "../../../../contracts/voice-protocol";
import { extractSpokenNumbers } from "./validator";

export const DRAFT_TTL_MS = 2 * 60_000;

export type DraftStatus = VoiceDraftCard["status"];

export interface Draft<Payload = unknown> {
  id: string;
  kind: "expenses" | "action" | "undo";
  title: string;
  lines: Array<{ label: string; amount?: number; detail?: string }>;
  total?: number;
  payload: Payload;
  createdAt: number;
  expiresAt: number;
  status: DraftStatus;
  /** Written ids once executed, for "undo the last thing". */
  resultIds?: number[];
  message?: string;
}

export type GateRefusal = "unknown_draft" | "not_latest" | "expired" | "not_pending" | "no_yes" | "changed";

const YES = [
  "اه", "آه", "أه", "ايوه", "أيوه", "ايوة", "أيوة", "ايوا", "أيوا", "تمام", "ماشي", "اوكي", "أوكي", "اوك", "ok", "okay", "yes",
  "سجل", "سجّل", "سجلها", "سجلهم", "سجله", "اكد", "أكد", "أكّد", "موافق", "موافقة", "يلا", "خلاص", "اعمل", "اعملها", "اعمله",
  "نفذ", "نفّذ", "نفذها", "صح", "مظبوط", "بالظبط", "اكيد", "أكيد", "طبعا", "طبعاً", "ياريت", "يا ريت", "امسح", "امسحها", "الغي", "الغيها",
];
const NO_OR_CHANGE = [
  "لا", "لأ", "لاء", "مش", "استنى", "استني", "بلاش", "غير", "غيّر", "بدل", "قصدي", "لحظة", "ثانية", "مش كده", "غلط", "no",
];

function normalize(text: string): string {
  return ` ${text.replace(/[،,.!؟?]/g, " ").replace(/\s+/g, " ").trim().toLowerCase()} `;
}

function hasWord(text: string, words: string[]): boolean {
  const normalized = normalize(text);
  return words.some((word) => normalized.includes(` ${word.toLowerCase()} `));
}

/**
 * The user's reply to a draft, as the gate reads it. Repeating the draft's own amounts is still a yes
 * ("آه، الخمسين دي"); a new number is a change.
 */
export function readReply(text: string, draftNumbers: number[] = []): "yes" | "no_or_change" | "unclear" {
  const reply = text.replace(/(مش|مفيش|ما فيش|مافيش)\s+مشكل[ةه]/g, " ");
  if (!reply.trim()) return "unclear";
  if (hasWord(reply, NO_OR_CHANGE)) return "no_or_change";
  const known = new Set(draftNumbers.map((n) => Math.round(n * 100)));
  // "الستين" is sixty too: drop the article before reading numbers.
  const numbers = extractSpokenNumbers(reply.replace(/(^|\s)ال(?=\S)/g, "$1"));
  if (numbers.some((number) => number.value >= 1 && !known.has(Math.round(number.value * 100)))) {
    return "no_or_change";
  }
  return hasWord(reply, YES) ? "yes" : "unclear";
}

export class DraftBook {
  private drafts: Draft[] = [];
  /** The user's words, with when they were heard, so a yes can be tied to what it answered. */
  private userWords: Array<{ at: number; text: string }> = [];

  constructor(private readonly now: () => number = Date.now) {}

  heardUser(text: string): void {
    const at = this.now();
    const last = this.userWords[this.userWords.length - 1];
    // Transcription arrives in pieces; pieces within a second belong to the same utterance.
    if (last && at - last.at < 1_500) {
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

  /**
   * May the draft be executed now? `byTap` is a tap on its card, an explicit act; a voice confirmation needs the
   * user's own yes after the draft was presented.
   */
  gate(id: string, byTap: boolean): { ok: true; draft: Draft } | { ok: false; reason: GateRefusal } {
    this.expire();
    const draft = this.get(id);
    if (!draft) return { ok: false, reason: "unknown_draft" };
    if (draft.status === "expired") return { ok: false, reason: "expired" };
    if (draft.status !== "pending") return { ok: false, reason: "not_pending" };
    if (this.latestPending()?.id !== id) return { ok: false, reason: "not_latest" };
    if (byTap) return { ok: true, draft };
    const amounts = [...draft.lines.map((line) => line.amount ?? 0), draft.total ?? 0].filter((n) => n > 0);
    const reply = readReply(this.wordsSince(draft.createdAt), amounts);
    if (reply === "no_or_change") return { ok: false, reason: "changed" };
    if (reply !== "yes") return { ok: false, reason: "no_yes" };
    return { ok: true, draft };
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
