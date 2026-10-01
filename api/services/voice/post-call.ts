/**
 * After a call: one pass of a text model over what was said writes a short summary and up to five things worth
 * remembering into the user's AI memory (`ai_memory_items`), next to what is already there, and then deletes the
 * words. The words wait in Redis for an hour after the call and are never written to MySQL (the owner's decision: no
 * stored transcripts). Age, gender, health, religion and judgments of the person are never kept.
 *
 * It runs as soon as a call ends on the server that ran it (gateway/index.ts), and `sweepCallMemories` (a background
 * job in api/boot.ts) picks up calls a restart or a failed model call left behind while their words are still there.
 */
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { aiMemoryItems, voiceCalls } from "../../../db/schema";
import { businessDateKey } from "../../lib/app-time";
import { createLogger } from "../../lib/log";
import { cacheGet, cacheSet } from "../../lib/redis-client";
import { db } from "../../queries/connection";
import { invalidateMemoryUserCache } from "../ai-memory";
import { readSlot, SLOT_NAMES, slotExpiry, slotMeta } from "../ai-memory/slots";
import { contentHash } from "../ai-memory/text-utils";
import { neverKeptUnasked } from "./brain/never-kept";
import { appendForgotten, deleteTranscript, readTranscript, TRANSCRIPT_TTL_SECONDS, type TranscriptLine } from "./gateway/store";
import { recordAiLedger } from "../../lib/ai-ledger";
import { textModelCostUsd } from "./gateway/pricing";
import { askTextModel } from "./text-model";

const log = createLogger("voice-memory");

const FACT_TYPES = ["plan", "agreement", "preference", "fact", "refusal", "followup"] as const;
type FactType = (typeof FACT_TYPES)[number];

export interface RememberedFact {
  type: FactType;
  content: string;
  importance: number;
  /** An existing memory this one updates. */
  replaces: number | null;
  /** What it is about (api/services/ai-memory/slots.ts); a newer memory in the same slot replaces the older. */
  slot: string | null;
}

export interface CallMemory {
  summary: string;
  facts: RememberedFact[];
  /** Follow-ups from earlier calls that this call settled. */
  closes: number[];
}

export interface ExistingMemory {
  id: number;
  type: string;
  content: string;
  slot?: string | null;
  /** The Cairo day it was said, when known. */
  day?: string | null;
}

export const MEMORY_SYSTEM = `You read the words of one phone call between a user in Egypt and their money assistant, and decide what the
assistant should remember for the next call. Answer with JSON only:
{"summary": "...", "facts": [{"type": "plan|agreement|preference|fact|refusal|followup", "slot": "... or null", "content": "...", "importance": 1-100, "replaces": null}], "closes": []}

- summary: at most two short sentences in Egyptian Arabic about what the call was about and what was decided or done.
  No greetings. Empty when the user said almost nothing.
- facts: at most six, only what will still matter in later calls and what the user said or agreed to: plans
  ("بيحوش لعربية على سنة"), agreements ("اتفقنا يقلل الأكل برّه لحد 1500 في الشهر"), preferences
  ("بيحب الأرقام بالتقريب"), stable facts ("بيقبض يوم 25", "بيدفع إيجار 4000"), offers they declined
  ("مش عايز ميزانية للأكل دلوقتي", type refusal, so it is not pushed again soon) and things to pick up next time
  ("هيشوف قيمة القسط ويقولها", type followup). One short sentence each, in Egyptian Arabic, about the user in the
  third person.
- slot: what the fact is about, only from this list, or null: ${SLOT_NAMES.join(", ")}. <topic> is a short English
  snake_case word, the same every time for the same thing (goal:phone, refusal:food_budget, followup:installment_amount).
  A fact whose slot matches an EXISTING memory is its new value: use the same slot and put the old id in "replaces".
- Never keep: age, gender, health, religion, politics, family matters, or any judgment of the person's character or
  state of mind; a single expense that was recorded, or a budget or goal the app saved (the app has them).
- EXISTING lists what is already remembered, with ids, slots and the day it was said. Do not repeat what did not change.
- closes: ids of EXISTING followup memories this call settled.
- FORGOTTEN lists what the user asked to forget. Keep nothing about it, in the facts or the summary, however it was
  said in the call.
- Nothing worth keeping: an empty facts list.`;

/** The words of the call and what is already remembered, as the model reads them. */
export function memoryPrompt(lines: TranscriptLine[], existing: ExistingMemory[]): string {
  const words = lines
    .filter((line) => line.role !== "forgotten")
    .map((line) => `${line.role === "user" ? "المستخدم" : "المساعد"}: ${line.text.replace(/\s+/g, " ").trim()}`)
    .join("\n");
  const known = existing.length
    ? existing.map((item) => {
      const tags = [item.type, item.slot, item.day].filter(Boolean).join(", ");
      return `- [${item.id}] (${tags}) ${item.content.replace(/\s+/g, " ").slice(0, 160)}`;
    }).join("\n")
    : "- (nothing yet)";
  const forgotten = forgottenOf(lines);
  return `EXISTING:\n${known}\n\n${forgotten.length ? `FORGOTTEN:\n${forgotten.map((item) => `- ${item}`).join("\n")}\n\n` : ""}CALL:\n${words}`;
}

export function forgottenOf(lines: TranscriptLine[]): string[] {
  return lines.filter((line) => line.role === "forgotten").map((line) => line.text.replace(/\s+/g, " ").trim().slice(0, 200));
}

/** The words of a text, folded, for comparing a new fact with something forgotten. */
function wordsOf(text: string): Set<string> {
  return new Set(text
    .replace(/[\u064B-\u0652]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1));
}

/**
 * Whether a fact says again what the user asked to forget: most of the forgotten item's words, or of the fact's, are
 * shared. The prompt already asks for nothing about it; this holds the answer to it whatever the model wrote.
 */
export function repeatsForgotten(text: string, forgotten: string[]): boolean {
  const words = wordsOf(text);
  if (!words.size) return false;
  return forgotten.some((item) => {
    const other = wordsOf(item);
    if (!other.size) return false;
    const shared = [...other].filter((word) => words.has(word)).length;
    return shared / Math.min(other.size, words.size) >= 0.6;
  });
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const value: unknown = JSON.parse(text.slice(start, end + 1));
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const oneLine = (value: unknown, max: number): string =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";

/**
 * What the model answered, held to the rules: at most six facts, nothing never kept, only known ids replaced, only
 * registered slots (a refusal or follow-up slot makes the fact that type), only known follow-ups closed.
 */
export function readCallMemory(text: string, existing: ExistingMemory[], forgotten: string[] = []): CallMemory | null {
  const answer = parseJsonObject(text);
  if (!answer) return null;
  const summary = oneLine(answer.summary, 280);
  const knownIds = new Set(existing.map((item) => item.id));
  const seen = new Set<string>();
  const facts: RememberedFact[] = [];
  for (const raw of Array.isArray(answer.facts) ? answer.facts : []) {
    if (facts.length >= 6) break;
    const item = (raw ?? {}) as Record<string, unknown>;
    const content = oneLine(item.content, 200);
    if (content.length < 6 || neverKeptUnasked(content) || seen.has(content) || repeatsForgotten(content, forgotten)) continue;
    seen.add(content);
    const slot = readSlot(item.slot);
    const stated = FACT_TYPES.includes(item.type as FactType) ? (item.type as FactType) : "fact";
    const type: FactType = slot?.kind === "refusal" ? "refusal" : slot?.kind === "followup" ? "followup" : stated;
    const importance = Math.min(90, Math.max(30, Math.round(Number(item.importance) || 60)));
    const replaces = Number.isInteger(item.replaces) && knownIds.has(item.replaces as number) ? (item.replaces as number) : null;
    facts.push({ type, content, importance, replaces, slot: slot?.slot ?? null });
  }
  const followups = new Set(existing.filter((item) => item.type === "followup").map((item) => item.id));
  const closes = (Array.isArray(answer.closes) ? answer.closes : [])
    .filter((id): id is number => Number.isInteger(id) && followups.has(id as number));
  return { summary: neverKeptUnasked(summary) || repeatsForgotten(summary, forgotten) ? "" : summary, facts, closes };
}

export type MemoryOutcome = "saved" | "empty" | "expired" | "failed" | "retry" | "skipped";

/** What the summary cost, kept on the call next to the live session's own tokens. */
export interface MemoryUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** At Google's text-model rates (api/services/voice/gateway/pricing.ts). */
  costUsd?: number;
}

interface CallRow {
  userId: number;
  userType: string;
  endedAt: Date | null;
}

export interface PostCallDeps {
  loadCall(callId: string): Promise<CallRow | null>;
  /** Moves the call from pending to writing; false when another server already took it. */
  claim(callId: string): Promise<boolean>;
  setStatus(callId: string, status: string, usage?: MemoryUsage): Promise<void>;
  readTranscript(callId: string): Promise<TranscriptLine[] | null>;
  deleteTranscript(callId: string): Promise<void>;
  existing(user: CallRow): Promise<ExistingMemory[]>;
  ask(user: CallRow, prompt: string): Promise<{ text: string; usage?: MemoryUsage }>;
  write(user: CallRow, callId: string, memory: CallMemory): Promise<void>;
  /** Counts attempts at this call; the words are dropped after the third failure. */
  attempt(callId: string): Promise<number>;
}

const MAX_ATTEMPTS = 3;
/** Less than this much said by the user is not a conversation worth summarizing. */
const MIN_USER_CHARS = 12;

export async function summarizeCall(callId: string, deps: PostCallDeps = databaseDeps): Promise<MemoryOutcome> {
  const call = await deps.loadCall(callId);
  if (!call || !(await deps.claim(callId))) return "skipped";
  const lines = await deps.readTranscript(callId);
  if (!lines) {
    await deps.setStatus(callId, "expired");
    return "expired";
  }
  const userChars = lines.filter((line) => line.role === "user").reduce((sum, line) => sum + line.text.trim().length, 0);
  if (userChars < MIN_USER_CHARS) {
    await deps.deleteTranscript(callId);
    await deps.setStatus(callId, "empty");
    return "empty";
  }

  try {
    const existing = await deps.existing(call);
    const answer = await deps.ask(call, memoryPrompt(lines, existing));
    // Read the forgotten items again just before writing: the user may have deleted a memory while the model answered,
    // or cleared everything (the words are gone: nothing of this call is kept).
    const latest = await deps.readTranscript(callId).catch(() => lines);
    if (latest === null) {
      await deps.setStatus(callId, "empty", answer.usage);
      return "empty";
    }
    const memory = readCallMemory(answer.text, existing, forgottenOf(latest));
    if (!memory) throw new Error("unreadable_answer");
    if (memory.summary || memory.facts.length || memory.closes.length) await deps.write(call, callId, memory);
    await deps.deleteTranscript(callId);
    await deps.setStatus(callId, memory.summary || memory.facts.length ? "saved" : "empty", answer.usage);
    log.info({ event: "voice.memory_saved", callId, facts: memory.facts.length, summary: Boolean(memory.summary) }, "Call remembered");
    return memory.summary || memory.facts.length ? "saved" : "empty";
  } catch (error) {
    const attempts = await deps.attempt(callId).catch(() => MAX_ATTEMPTS);
    const giveUp = attempts >= MAX_ATTEMPTS;
    log.warn({ event: "voice.memory_failed", callId, attempts, giveUp, err: error }, "Call summary not written");
    if (giveUp) await deps.deleteTranscript(callId);
    await deps.setStatus(callId, giveUp ? "failed" : "pending");
    return giveUp ? "failed" : "retry";
  }
}

/**
 * The user forgot a memory (`content`), or all of them (`null`), from the memory screen. A call of theirs whose summary
 * has not been written yet still holds the words it came from: the item joins those words as forgotten, so the summary
 * leaves it out; after "forget everything" the words are dropped and nothing of those calls is kept. The forgotten text
 * lives only as long as the words (Redis, an hour).
 */
export async function forgetInPendingCalls(user: { userId: number; userType: string }, content: string | null): Promise<void> {
  const calls = await db.select({ id: voiceCalls.id }).from(voiceCalls).where(and(
    eq(voiceCalls.userId, user.userId),
    eq(voiceCalls.userType, user.userType),
    inArray(voiceCalls.memoryStatus, ["pending", "writing"]),
  ));
  for (const call of calls) {
    if (content === null) {
      await deleteTranscript(call.id);
      await db.update(voiceCalls).set({ memoryStatus: "empty" }).where(and(eq(voiceCalls.id, call.id), eq(voiceCalls.memoryStatus, "pending")));
    } else {
      await appendForgotten(call.id, content);
    }
  }
}

// ─── The real stores ────────────────────────────────────────────────

function dayLabel(date: Date): string {
  const [, month, day] = businessDateKey(date).split("-");
  return `${Number(day)}/${Number(month)}`;
}

/** The stores the summary writes to; exported for the database test (tests/voice-memory-slots.test.ts). */
export const databaseDeps: PostCallDeps = {
  async loadCall(callId) {
    const [row] = await db
      .select({ userId: voiceCalls.userId, userType: voiceCalls.userType, endedAt: voiceCalls.endedAt })
      .from(voiceCalls)
      .where(eq(voiceCalls.id, callId))
      .limit(1);
    return row ?? null;
  },

  async claim(callId) {
    const [result] = (await db
      .update(voiceCalls)
      .set({ memoryStatus: "writing" })
      .where(and(eq(voiceCalls.id, callId), eq(voiceCalls.memoryStatus, "pending"), eq(voiceCalls.status, "ended")))) as unknown as [
      { affectedRows?: number },
    ];
    return Number(result?.affectedRows ?? 0) === 1;
  },

  async setStatus(callId, status, usage) {
    await db
      .update(voiceCalls)
      .set({
        memoryStatus: status,
        ...(usage
          ? { metrics: sql`JSON_SET(COALESCE(${voiceCalls.metrics}, JSON_OBJECT()), '$.memory', CAST(${JSON.stringify(usage)} AS JSON))` }
          : {}),
      })
      .where(eq(voiceCalls.id, callId));
  },

  readTranscript,
  deleteTranscript,

  async existing(user) {
    const rows = await db
      .select({ id: aiMemoryItems.id, type: aiMemoryItems.memoryType, content: aiMemoryItems.content, metadata: aiMemoryItems.metadata })
      .from(aiMemoryItems)
      .where(and(
        eq(aiMemoryItems.userId, user.userId),
        eq(aiMemoryItems.userType, user.userType),
        eq(aiMemoryItems.status, "active"),
        inArray(aiMemoryItems.memoryType, [...FACT_TYPES]),
      ))
      .orderBy(desc(aiMemoryItems.updatedAt))
      .limit(40);
    const now = Date.now();
    return rows.flatMap((row) => {
      const meta = slotMeta(row.metadata);
      // An expired refusal or follow-up is no longer true: it is not shown, so it is not carried on.
      if (meta.validUntil && meta.validUntil.getTime() < now) return [];
      return [{ id: row.id, type: row.type, content: String(row.content), slot: meta.slot, day: meta.day }];
    }).slice(0, 30);
  },

  async ask(user, prompt) {
    const answer = await askTextModel({
      modelSetting: "voice_memory_model",
      defaultModel: "gemini-3.8-flash",
      system: MEMORY_SYSTEM,
      prompt,
      json: true,
      // Flash models think before answering, and the thinking counts against this budget.
      maxTokens: 4_096,
    });
    void recordAiLedger({
      userId: user.userId,
      userType: user.userType,
      channel: "voice_memory",
      providerSlug: "gemini",
      modelId: answer.model,
      promptTokens: answer.inputTokens,
      completionTokens: answer.outputTokens,
    });
    return {
      text: answer.text,
      usage: {
        model: answer.model,
        inputTokens: answer.inputTokens,
        outputTokens: answer.outputTokens,
        costUsd: textModelCostUsd(answer.model, answer.inputTokens, answer.outputTokens),
      },
    };
  },

  async write(user, callId, memory) {
    const day = user.endedAt ? businessDateKey(user.endedAt) : businessDateKey();
    const metadata = { source: "voice_call", callId, day };
    const scope = and(eq(aiMemoryItems.userId, user.userId), eq(aiMemoryItems.userType, user.userType));
    if (memory.summary) {
      const content = `مكالمة ${dayLabel(user.endedAt ?? new Date())}: ${memory.summary}`;
      await db
        .insert(aiMemoryItems)
        .values({ userId: user.userId, userType: user.userType, memoryType: "summary", content, contentHash: contentHash(content), importance: 40, status: "active", metadata })
        .onDuplicateKeyUpdate({ set: { status: "active", updatedAt: new Date() } });
    }
    const said = user.endedAt ?? new Date();
    for (const fact of memory.facts) {
      if (fact.replaces !== null) {
        await db.update(aiMemoryItems).set({ status: "replaced" }).where(and(scope, eq(aiMemoryItems.id, fact.replaces)));
      }
      // One current value per slot: whatever else holds this slot is replaced by what was said now.
      if (fact.slot) {
        await db.update(aiMemoryItems).set({ status: "replaced" }).where(and(
          scope,
          eq(aiMemoryItems.status, "active"),
          sql`JSON_UNQUOTE(JSON_EXTRACT(${aiMemoryItems.metadata}, '$.slot')) = ${fact.slot}`,
        ));
      }
      const until = fact.slot ? slotExpiry(fact.slot, said) : null;
      const factMetadata = { ...metadata, ...(fact.slot ? { slot: fact.slot } : {}), ...(until ? { validUntil: until.toISOString() } : {}) };
      await db
        .insert(aiMemoryItems)
        .values({
          userId: user.userId,
          userType: user.userType,
          memoryType: fact.type,
          content: fact.content,
          contentHash: contentHash(fact.content),
          importance: fact.importance,
          status: "active",
          metadata: factMetadata,
        })
        .onDuplicateKeyUpdate({ set: { status: "active", importance: fact.importance, memoryType: fact.type, metadata: factMetadata, updatedAt: new Date() } });
    }
    if (memory.closes.length) {
      await db.update(aiMemoryItems).set({ status: "done" })
        .where(and(scope, eq(aiMemoryItems.memoryType, "followup"), inArray(aiMemoryItems.id, memory.closes)));
    }
    await invalidateMemoryUserCache(user.userId, user.userType).catch(() => undefined);
  },

  async attempt(callId) {
    // Only the server that claimed the call counts, so a plain read and write is enough.
    const key = `voice:memory:attempts:${callId}`;
    const count = Number(await cacheGet(key)) + 1;
    await cacheSet(key, TRANSCRIPT_TTL_SECONDS * 2, String(count));
    return count;
  },
};

/**
 * Calls whose summary did not happen when they ended (the server restarted, or the model failed): tried again while
 * their words are still in Redis, and marked expired once they cannot be.
 */
export async function sweepCallMemories(now = new Date(), deps: PostCallDeps = databaseDeps): Promise<{ tried: number; expired: number }> {
  const oldest = new Date(now.getTime() - TRANSCRIPT_TTL_SECONDS * 1000);
  const settled = new Date(now.getTime() - 60_000);
  // A server that died while writing leaves "writing" behind; after fifteen minutes it is pending again.
  await db
    .update(voiceCalls)
    .set({ memoryStatus: "pending" })
    .where(and(eq(voiceCalls.memoryStatus, "writing"), lt(voiceCalls.updatedAt, new Date(now.getTime() - 15 * 60_000))));
  const [expired] = (await db
    .update(voiceCalls)
    .set({ memoryStatus: "expired" })
    .where(and(eq(voiceCalls.status, "ended"), eq(voiceCalls.memoryStatus, "pending"), lt(voiceCalls.endedAt, oldest)))) as unknown as [
    { affectedRows?: number },
  ];
  const due = await db
    .select({ id: voiceCalls.id })
    .from(voiceCalls)
    .where(and(
      eq(voiceCalls.status, "ended"),
      eq(voiceCalls.memoryStatus, "pending"),
      gt(voiceCalls.endedAt, oldest),
      lt(voiceCalls.endedAt, settled),
    ))
    .orderBy(voiceCalls.endedAt)
    .limit(25);
  for (const call of due) await summarizeCall(call.id, deps);
  return { tried: due.length, expired: Number(expired?.affectedRows ?? 0) };
}
