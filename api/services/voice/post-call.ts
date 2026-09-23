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
import { contentHash } from "../ai-memory/text-utils";
import { neverKeptUnasked } from "./brain/never-kept";
import { deleteTranscript, readTranscript, TRANSCRIPT_TTL_SECONDS, type TranscriptLine } from "./gateway/store";
import { askTextModel } from "./text-model";

const log = createLogger("voice-memory");

const FACT_TYPES = ["plan", "agreement", "preference", "fact"] as const;
type FactType = (typeof FACT_TYPES)[number];

export interface RememberedFact {
  type: FactType;
  content: string;
  importance: number;
  /** An existing memory this one updates. */
  replaces: number | null;
}

export interface CallMemory {
  summary: string;
  facts: RememberedFact[];
}

export interface ExistingMemory {
  id: number;
  type: string;
  content: string;
}

export const MEMORY_SYSTEM = `You read the words of one phone call between a user in Egypt and their money assistant, and decide what the
assistant should remember for the next call. Answer with JSON only:
{"summary": "...", "facts": [{"type": "plan|agreement|preference|fact", "content": "...", "importance": 1-100, "replaces": null}]}

- summary: at most two short sentences in Egyptian Arabic about what the call was about and what was decided or done.
  No greetings. Empty when the user said almost nothing.
- facts: at most five, only what will still matter in later calls and what the user said or agreed to: plans
  ("بيحوش لعربية على سنة"), agreements ("اتفقنا يقلل الأكل برّه لحد 1500 في الشهر"), preferences
  ("بيحب الأرقام بالتقريب"), and stable facts ("بيقبض يوم 25", "بيدفع إيجار 4000"). One short sentence each, in
  Egyptian Arabic, about the user in the third person.
- Never keep: age, gender, health, religion, politics, family matters, or any judgment of the person's character or
  state of mind; a single expense that was recorded (the ledger has it); suggestions the user did not take up.
- EXISTING lists what is already remembered, with ids. Do not repeat it. When a fact updates one of them, put that id
  in "replaces".
- Nothing worth keeping: an empty facts list.`;

/** The words of the call and what is already remembered, as the model reads them. */
export function memoryPrompt(lines: TranscriptLine[], existing: ExistingMemory[]): string {
  const words = lines
    .map((line) => `${line.role === "user" ? "المستخدم" : "المساعد"}: ${line.text.replace(/\s+/g, " ").trim()}`)
    .join("\n");
  const known = existing.length
    ? existing.map((item) => `- [${item.id}] (${item.type}) ${item.content.replace(/\s+/g, " ").slice(0, 160)}`).join("\n")
    : "- (nothing yet)";
  return `EXISTING:\n${known}\n\nCALL:\n${words}`;
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

/** What the model answered, held to the rules: at most five facts, nothing never kept, only known ids replaced. */
export function readCallMemory(text: string, existing: ExistingMemory[]): CallMemory | null {
  const answer = parseJsonObject(text);
  if (!answer) return null;
  const summary = oneLine(answer.summary, 280);
  const knownIds = new Set(existing.map((item) => item.id));
  const seen = new Set<string>();
  const facts: RememberedFact[] = [];
  for (const raw of Array.isArray(answer.facts) ? answer.facts : []) {
    if (facts.length >= 5) break;
    const item = (raw ?? {}) as Record<string, unknown>;
    const content = oneLine(item.content, 200);
    if (content.length < 6 || neverKeptUnasked(content) || seen.has(content)) continue;
    seen.add(content);
    const type = FACT_TYPES.includes(item.type as FactType) ? (item.type as FactType) : "fact";
    const importance = Math.min(90, Math.max(30, Math.round(Number(item.importance) || 60)));
    const replaces = Number.isInteger(item.replaces) && knownIds.has(item.replaces as number) ? (item.replaces as number) : null;
    facts.push({ type, content, importance, replaces });
  }
  return { summary: neverKeptUnasked(summary) ? "" : summary, facts };
}

export type MemoryOutcome = "saved" | "empty" | "expired" | "failed" | "retry" | "skipped";

/** What the summary cost, kept on the call next to the live session's own tokens. */
export interface MemoryUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
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
    const memory = readCallMemory(answer.text, existing);
    if (!memory) throw new Error("unreadable_answer");
    if (memory.summary || memory.facts.length) await deps.write(call, callId, memory);
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

// ─── The real stores ────────────────────────────────────────────────

function dayLabel(date: Date): string {
  const [, month, day] = businessDateKey(date).split("-");
  return `${Number(day)}/${Number(month)}`;
}

const databaseDeps: PostCallDeps = {
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
      .select({ id: aiMemoryItems.id, type: aiMemoryItems.memoryType, content: aiMemoryItems.content })
      .from(aiMemoryItems)
      .where(and(
        eq(aiMemoryItems.userId, user.userId),
        eq(aiMemoryItems.userType, user.userType),
        eq(aiMemoryItems.status, "active"),
        inArray(aiMemoryItems.memoryType, [...FACT_TYPES]),
      ))
      .orderBy(desc(aiMemoryItems.updatedAt))
      .limit(30);
    return rows.map((row) => ({ id: row.id, type: row.type, content: String(row.content) }));
  },

  async ask(_user, prompt) {
    const answer = await askTextModel({
      modelSetting: "voice_memory_model",
      defaultModel: "gemini-3.8-flash",
      fallbackModels: ["gemini-3.5-flash", "gemini-3.1-flash-lite"],
      system: MEMORY_SYSTEM,
      prompt,
      json: true,
      // Flash models think before answering, and the thinking counts against this budget.
      maxTokens: 4_096,
    });
    return { text: answer.text, usage: { model: answer.model, inputTokens: answer.inputTokens, outputTokens: answer.outputTokens } };
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
    for (const fact of memory.facts) {
      if (fact.replaces !== null) {
        await db.update(aiMemoryItems).set({ status: "replaced" }).where(and(scope, eq(aiMemoryItems.id, fact.replaces)));
      }
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
          metadata,
        })
        .onDuplicateKeyUpdate({ set: { status: "active", importance: fact.importance, updatedAt: new Date() } });
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
