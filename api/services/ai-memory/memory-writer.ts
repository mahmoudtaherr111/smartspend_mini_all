import { and, eq } from "drizzle-orm";
import {
  aiConversationSummaries,
  aiMemoryEmbeddings,
  aiMemoryItems,
} from "../../../db/schema";
import { db } from "../../queries/connection";
import { FireworksEmbeddingClient } from "./embedding-client";
import { loadEmbeddingConfig } from "./embedding-settings";
import { invalidateMemoryUserCache } from "./memory-retriever";
import {
  contentHash,
  isLowSignalMemoryText,
  normalizeMemoryText,
  truncateWords,
} from "./text-utils";
import type {
  ConversationMemoryDraft,
  ConversationMemoryInput,
  ExtractedMemory,
  MemoryMessage,
} from "./types";

const MEMORY_TRIGGERS = [
  "اتفقنا",
  "اتفاق",
  "خطة",
  "هدف",
  "احوش",
  "ادخر",
  "عايز",
  "عاوز",
  "افضل",
  "مهم",
  "افتكر",
  "فاكر",
  "remember",
  "plan",
  "goal",
];

const MEMORY_SIGNAL_RULES: Array<{
  type: ExtractedMemory["type"];
  importance: number;
  reason: string;
  patterns: string[];
}> = [
  {
    type: "preference",
    importance: 72,
    reason: "preference_signal",
    patterns: [
      "بحب",
      "بكره",
      "افضل",
      "مفضل",
      "مش بحب",
      "prefer",
      "avoid",
      "hate",
      "like",
    ],
  },
  {
    type: "plan",
    importance: 78,
    reason: "commitment_or_constraint_signal",
    patterns: [
      "مش هلمس",
      "ما تلمسش",
      "متنفذش",
      "ما تنفذش",
      "غير لما اكد",
      "لما اكد",
      "حد اقصي",
      "ميزانيه",
      "budget",
      "limit",
      "confirm",
    ],
  },
  {
    type: "fact",
    importance: 52,
    reason: "site_help_interest_signal",
    patterns: [
      "ازاي اربط",
      "كيف اربط",
      "اربط الفيزا",
      "اربط الكارت",
      "sms",
      "رسائل",
      "استخدم التطبيق",
      "استخدم الموقع",
      "bank",
      "visa",
      "card",
    ],
  },
];

function memorySignalFor(content: string): { type?: ExtractedMemory["type"]; importance: number; reason: string } | null {
  const normalized = normalizeMemoryText(content);
  for (const rule of MEMORY_SIGNAL_RULES) {
    if (rule.patterns.some((pattern) => normalized.includes(normalizeMemoryText(pattern)))) {
      return {
        type: rule.type,
        importance: rule.importance,
        reason: rule.reason,
      };
    }
  }

  if (MEMORY_TRIGGERS.some((trigger) => normalized.includes(normalizeMemoryText(trigger)))) {
    return {
      type: memoryTypeFor(content),
      importance: importanceFor(content),
      reason: "core_memory_trigger",
    };
  }

  return null;
}

function importanceFor(content: string): number {
  const normalized = normalizeMemoryText(content);
  let score = 55;
  if (normalized.includes("هدف") || normalized.includes("goal")) score += 20;
  if (normalized.includes("اتفقنا") || normalized.includes("plan")) score += 15;
  if (normalized.includes("احوش") || normalized.includes("ادخر")) score += 10;
  return Math.min(95, score);
}

function memoryTypeFor(content: string): ExtractedMemory["type"] {
  const normalized = normalizeMemoryText(content);
  if (normalized.includes("هدف") || normalized.includes("احوش") || normalized.includes("ادخر")) return "plan";
  if (normalized.includes("اتفقنا") || normalized.includes("اتفاق")) return "agreement";
  if (normalized.includes("افضل") || normalized.includes("بحب") || normalized.includes("بكره")) return "preference";
  if (normalized.includes("ميزانيه") || normalized.includes("حد") || normalized.includes("قيد")) return "plan";
  if (normalized.includes("مشروع") || normalized.includes("بيزنس") || normalized.includes("business")) return "plan";
  return "fact";
}

function structuredMemoryTypeFor(content: string, fallback: ExtractedMemory["type"]): string {
  const normalized = normalizeMemoryText(content);
  if (normalized.includes("مشروع") || normalized.includes("بيزنس") || normalized.includes("business")) {
    return "business_context";
  }
  if (
    normalized.includes("حد اقصي") ||
    normalized.includes("ميزانيه") ||
    normalized.includes("مش هلمس") ||
    normalized.includes("ما تلمسش") ||
    normalized.includes("ما تنفذش") ||
    normalized.includes("متنفذش") ||
    normalized.includes("لما اكد") ||
    normalized.includes("بعد تاكيد") ||
    normalized.includes("confirm") ||
    normalized.includes("limit")
  ) {
    return "constraint";
  }
  if (fallback === "fact") return "fact";
  return fallback;
}

function extractStructuredMemoryMeta(content: string): Record<string, unknown> {
  const normalized = normalizeMemoryText(content);
  const meta: Record<string, unknown> = {};
  const amountMatches = [...normalized.matchAll(/(\d+)\s*(الف|ألف|k|مليون|million)?/gi)];
  const amounts = amountMatches
    .map((match) => {
      const base = Number(match[1]);
      if (!Number.isFinite(base)) return undefined;
      const unit = String(match[2] ?? "").toLowerCase();
      if (unit === "الف" || unit === "ألف" || unit === "k") return base * 1000;
      if (unit === "مليون" || unit === "million") return base * 1_000_000;
      return base;
    })
    .filter((value): value is number => value !== undefined && Number.isFinite(value) && value > 10);

  if (amounts && amounts.length > 0) {
    const maxAmount = Math.max(...amounts);
    meta.subject_amount = maxAmount;
    meta.amount = maxAmount;
  }

  const monthMatch = normalized.match(/(\d+)\s*(شهر|شهور|months?)/i);
  if (monthMatch) {
    meta.estimated_months = Number(monthMatch[1]);
    meta.period = `${Number(monthMatch[1])} months`;
  } else if (normalized.includes("الشهر ده") || normalized.includes("هذا الشهر")) {
    meta.period = "current_month";
  }

  const deadlineMatch = normalized.match(/(?:قبل|بحلول|deadline|by)\s+([^،.؟?]{2,40})/i);
  if (deadlineMatch?.[1]) meta.deadline = deadlineMatch[1].trim();

  const subjectPatterns = ["سياره", "سيارة", "شقه", "شقة", "سفر", "عربيه", "عربية", "لابتوب", "موبايل", "كاميرا"];
  for (const subject of subjectPatterns) {
    if (normalized.includes(normalizeMemoryText(subject))) {
      meta.subject = subject;
      break;
    }
  }

  if (normalized.includes("ادخار") || normalized.includes("احوش") || normalized.includes("ادخر")) {
    meta.intent = "saving";
  }
  if (normalized.includes("شراء") || normalized.includes("اشتري") || normalized.includes("اجيب")) {
    meta.intent = "purchase";
  }
  meta.status =
    normalized.includes("ما تنفذش") ||
    normalized.includes("متنفذش") ||
    normalized.includes("لما اكد") ||
    normalized.includes("بعد تاكيد")
      ? "pending_confirmation"
      : "active";

  return Object.keys(meta).length > 0 ? meta : undefined!;
}

function assistantPlanCommitSignal(content: string): boolean {
  const normalized = normalizeMemoryText(content);
  return [
    "احفظ",
    "خزن",
    "افتكر كده",
    "تمام افتكر",
    "تمام كده",
    "موافق",
    "اتفقنا",
    "remember this",
    "save this",
  ].some((term) => normalized.includes(normalizeMemoryText(term)));
}

function assistantPlanCandidate(content: string): boolean {
  const normalized = normalizeMemoryText(content);
  return (
    !isLowSignalMemoryText(content) &&
    ["خطه", "خطة", "هدف", "ادخار", "احوش", "ميزانيه", "budget", "plan", "goal"].some((term) =>
      normalized.includes(normalizeMemoryText(term)),
    )
  );
}

export function buildConversationCapsule(messages: MemoryMessage[]): string {
  const lastUser = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";
  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant")?.content ?? "";
  if (lastUser && isLowSignalMemoryText(lastUser)) {
    return "استعلام ذاكرة بدون ذكرى جديدة";
  }
  const seed = [lastUser, lastAssistant].filter(Boolean).join(" ");
  const compactSeed = seed.replace(/\s+/g, " ");
  if (!isLowSignalMemoryText(compactSeed)) {
    return truncateWords(compactSeed, 30);
  }

  const substantiveUser = [...messages]
    .reverse()
    .find((message) => message.role === "user" && !isLowSignalMemoryText(message.content))?.content;
  const substantiveAssistant = [...messages]
    .reverse()
    .find((message) => message.role === "assistant" && !isLowSignalMemoryText(message.content))?.content;
  const fallback = [substantiveUser, substantiveAssistant].filter(Boolean).join(" ").replace(/\s+/g, " ");
  return fallback ? truncateWords(fallback, 30) : "استعلام ذاكرة بدون ذكرى جديدة";
}

export function buildRunningSummary(messages: MemoryMessage[], previousSummary = ""): string {
  const recent = messages
    .slice(-8)
    .map((message) => `${message.role}: ${truncateWords(message.content, 28)}`)
    .join("\n");
  return truncateWords([previousSummary, recent].filter(Boolean).join("\n"), 130);
}

export function extractSemanticMemories(messages: MemoryMessage[]): ExtractedMemory[] {
  const memories = new Map<string, ExtractedMemory>();

  for (const [index, message] of messages.entries()) {
    if (message.role !== "user") continue;

    if (assistantPlanCommitSignal(message.content)) {
      const previousAssistant = [...messages.slice(0, index)]
        .reverse()
        .find((item) => item.role === "assistant" && assistantPlanCandidate(item.content));
      if (previousAssistant) {
        const content = truncateWords(previousAssistant.content, 60);
        const hash = contentHash(`assistant_plan:${content}`);
        const structuredMeta = extractStructuredMemoryMeta(content);
        memories.set(hash, {
          type: "plan",
          content,
          importance: 82,
          sourceMessageId: previousAssistant.id,
          metadata: {
            extractedBy: "deterministic_v2",
            reason: "assistant_plan_confirmed_by_user",
            structuredType: "agreement",
            status: "active",
            confidence: 0.82,
            ...(structuredMeta || {}),
          },
        });
      }
    }

    if (isLowSignalMemoryText(message.content)) continue;

    const signal = memorySignalFor(message.content);
    if (!signal) continue;

    const content = truncateWords(message.content, 40);
    if (content.length < 8) continue;

    const hash = contentHash(content);
    const structuredMeta = extractStructuredMemoryMeta(content);
    const type = signal.type ?? memoryTypeFor(content);
    memories.set(hash, {
      type,
      content,
      importance: signal.importance,
      sourceMessageId: message.id,
      metadata: {
        extractedBy: "deterministic_v2",
        reason: signal.reason,
        structuredType: structuredMemoryTypeFor(content, type),
        status: "active",
        confidence: Math.min(0.98, Math.max(0.5, signal.importance / 100)),
        ...(structuredMeta || {}),
      },
    });
  }

  return [...memories.values()].slice(0, 5);
}

export function hasSemanticMemoryCandidate(messages: MemoryMessage[]): boolean {
  return extractSemanticMemories(messages).length > 0;
}

export function draftConversationMemory(
  input: ConversationMemoryInput,
  previousSummary = "",
): ConversationMemoryDraft {
  return {
    capsule: buildConversationCapsule(input.messages),
    runningSummary: buildRunningSummary(input.messages, previousSummary),
    memories: extractSemanticMemories(input.messages).map((memory) => ({
      ...memory,
      metadata: {
        ...(memory.metadata ?? {}),
        sourceConversationId: input.conversationId,
      },
    })),
  };
}

async function maybeStoreEmbedding(memoryItemId: number, input: ConversationMemoryInput, content: string): Promise<void> {
  try {
    const config = await loadEmbeddingConfig("memory");
    if (!config.enabled) return;

    const [existing] = await db
      .select({ id: aiMemoryEmbeddings.id })
      .from(aiMemoryEmbeddings)
      .where(
        and(
          eq(aiMemoryEmbeddings.memoryItemId, memoryItemId),
          eq(aiMemoryEmbeddings.provider, "fireworks"),
          eq(aiMemoryEmbeddings.model, config.model),
          eq(aiMemoryEmbeddings.dimensions, config.dimensions),
        ),
      )
      .limit(1);

    if (existing?.id) return;

    const client = new FireworksEmbeddingClient(config);
    const result = await client.embedText({
      text: content,
      dimensions: config.dimensions,
      userId: input.userId,
      userType: input.userType,
    });

    if (result.fallback) {
      console.warn("[AI Memory] embedding skipped fallback", result.fallbackReason ?? "unknown");
      return;
    }

    await db
      .insert(aiMemoryEmbeddings)
      .values({
        memoryItemId,
        userId: input.userId,
        userType: input.userType,
        provider: result.provider,
        model: result.model,
        dimensions: result.dimensions,
        vectorHash: contentHash(result.vector.join(",")),
        vector: result.vector,
      })
      .onDuplicateKeyUpdate({
        set: {
          vectorHash: contentHash(result.vector.join(",")),
          vector: result.vector,
        },
      });
  } catch (error) {
    console.warn("[AI Memory] embedding skipped", error instanceof Error ? error.message : String(error));
  }
}

export async function writeConversationMemory(input: ConversationMemoryInput): Promise<ConversationMemoryDraft> {
  const [existing] = await db
    .select()
    .from(aiConversationSummaries)
    .where(eq(aiConversationSummaries.conversationId, input.conversationId))
    .limit(1);

  const draft = draftConversationMemory(input, existing?.runningSummary ?? "");

  await db
    .insert(aiConversationSummaries)
    .values({
      userId: input.userId,
      userType: input.userType,
      conversationId: input.conversationId,
      capsule: draft.capsule,
      runningSummary: draft.runningSummary,
      messageCount: input.messages.length,
      source: input.source ?? "chat",
    })
    .onDuplicateKeyUpdate({
      set: {
        capsule: draft.capsule,
        runningSummary: draft.runningSummary,
        messageCount: input.messages.length,
        source: input.source ?? "chat",
      },
    });

  for (const memory of draft.memories) {
    const hash = contentHash(memory.content);
    await db
      .insert(aiMemoryItems)
      .values({
        userId: input.userId,
        userType: input.userType,
        memoryType: memory.type,
        content: memory.content,
        contentHash: hash,
        importance: memory.importance,
        sourceConversationId: input.conversationId,
        sourceMessageId: memory.sourceMessageId,
        status: "active",
        metadata: memory.metadata,
      })
      .onDuplicateKeyUpdate({
        set: {
          importance: memory.importance,
          status: "active",
          metadata: memory.metadata,
        },
      });

    const [stored] = await db
      .select({ id: aiMemoryItems.id })
      .from(aiMemoryItems)
      .where(
        and(
          eq(aiMemoryItems.userId, input.userId),
          eq(aiMemoryItems.userType, input.userType),
          eq(aiMemoryItems.contentHash, hash),
        ),
      )
      .limit(1);

    if (stored?.id) {
      await maybeStoreEmbedding(stored.id, input, memory.content);
    }
  }

  const previousCapsule = typeof existing?.capsule === "string" ? existing.capsule : "";
  const retrievalRelevantMemoryChange =
    draft.memories.length > 0 ||
    !isLowSignalMemoryText(draft.capsule) ||
    (previousCapsule.length > 0 && !isLowSignalMemoryText(previousCapsule));

  if (retrievalRelevantMemoryChange) {
    await invalidateMemoryUserCache(input.userId, input.userType).catch((error: unknown) => {
      console.warn("[AI Memory] cache invalidation failed", error instanceof Error ? error.message : String(error));
    });
  }

  return draft;
}
