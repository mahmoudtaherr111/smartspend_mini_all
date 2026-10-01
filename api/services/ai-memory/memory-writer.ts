import { and, eq, gt, sql } from "drizzle-orm";
import {
  aiConversationSummaries,
  chatConversations,
  chatMessages,
  aiMemoryEmbeddings,
  aiMemoryItems,
} from "../../../db/schema";
import { db } from "../../queries/connection";
import { withMemoryOwnerLock } from "./slot-store";
import { createLogger } from "../../lib/log";
const log = createLogger("memory-writer");
import { MemoryEmbeddingClient } from "./embedding-client";
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

function memorySignalFor(content: string): {
  type?: ExtractedMemory["type"];
  importance: number;
  reason: string;
} | null {
  const normalized = normalizeMemoryText(content);
  for (const rule of MEMORY_SIGNAL_RULES) {
    if (
      rule.patterns.some((pattern) =>
        normalized.includes(normalizeMemoryText(pattern)),
      )
    ) {
      return {
        type: rule.type,
        importance: rule.importance,
        reason: rule.reason,
      };
    }
  }

  if (
    MEMORY_TRIGGERS.some((trigger) =>
      normalized.includes(normalizeMemoryText(trigger)),
    )
  ) {
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
  if (
    normalized.includes("هدف") ||
    normalized.includes("احوش") ||
    normalized.includes("ادخر")
  )
    return "plan";
  if (normalized.includes("اتفقنا") || normalized.includes("اتفاق"))
    return "agreement";
  if (
    normalized.includes("افضل") ||
    normalized.includes("بحب") ||
    normalized.includes("بكره")
  )
    return "preference";
  if (
    normalized.includes("ميزانيه") ||
    normalized.includes("حد") ||
    normalized.includes("قيد")
  )
    return "plan";
  if (
    normalized.includes("مشروع") ||
    normalized.includes("بيزنس") ||
    normalized.includes("business")
  )
    return "plan";
  return "fact";
}

function structuredMemoryTypeFor(
  content: string,
  fallback: ExtractedMemory["type"],
): string {
  const normalized = normalizeMemoryText(content);
  if (
    normalized.includes("مشروع") ||
    normalized.includes("بيزنس") ||
    normalized.includes("business")
  ) {
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
  const amountMatches = [
    ...normalized.matchAll(/(\d+)\s*(الف|ألف|k|مليون|million)?/gi),
  ];
  const amounts = amountMatches
    .map((match) => {
      const base = Number(match[1]);
      if (!Number.isFinite(base)) return undefined;
      const unit = String(match[2] ?? "").toLowerCase();
      if (unit === "الف" || unit === "ألف" || unit === "k") return base * 1000;
      if (unit === "مليون" || unit === "million") return base * 1_000_000;
      return base;
    })
    .filter(
      (value): value is number =>
        value !== undefined && Number.isFinite(value) && value > 10,
    );

  if (amounts && amounts.length > 0) {
    const maxAmount = Math.max(...amounts);
    meta.subject_amount = maxAmount;
    meta.amount = maxAmount;
  }

  const monthMatch = normalized.match(/(\d+)\s*(شهر|شهور|months?)/i);
  if (monthMatch) {
    meta.estimated_months = Number(monthMatch[1]);
    meta.period = `${Number(monthMatch[1])} months`;
  } else if (
    normalized.includes("الشهر ده") ||
    normalized.includes("هذا الشهر")
  ) {
    meta.period = "current_month";
  }

  const deadlineMatch = normalized.match(
    /(?:قبل|بحلول|deadline|by)\s+([^،.؟?]{2,40})/i,
  );
  if (deadlineMatch?.[1]) meta.deadline = deadlineMatch[1].trim();

  const subjectPatterns = [
    "سياره",
    "سيارة",
    "شقه",
    "شقة",
    "سفر",
    "عربيه",
    "عربية",
    "لابتوب",
    "موبايل",
    "كاميرا",
  ];
  for (const subject of subjectPatterns) {
    if (normalized.includes(normalizeMemoryText(subject))) {
      meta.subject = subject;
      break;
    }
  }

  if (
    normalized.includes("ادخار") ||
    normalized.includes("احوش") ||
    normalized.includes("ادخر")
  ) {
    meta.intent = "saving";
  }
  if (
    normalized.includes("شراء") ||
    normalized.includes("اشتري") ||
    normalized.includes("اجيب")
  ) {
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
    [
      "خطه",
      "خطة",
      "هدف",
      "ادخار",
      "احوش",
      "ميزانيه",
      "budget",
      "plan",
      "goal",
    ].some((term) => normalized.includes(normalizeMemoryText(term)))
  );
}

export function buildConversationCapsule(messages: MemoryMessage[]): string {
  const lastUser =
    [...messages].reverse().find((message) => message.role === "user")
      ?.content ?? "";
  const lastAssistant =
    [...messages].reverse().find((message) => message.role === "assistant")
      ?.content ?? "";
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
    .find(
      (message) =>
        message.role === "user" && !isLowSignalMemoryText(message.content),
    )?.content;
  const substantiveAssistant = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role === "assistant" && !isLowSignalMemoryText(message.content),
    )?.content;
  const fallback = [substantiveUser, substantiveAssistant]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ");
  return fallback
    ? truncateWords(fallback, 30)
    : "استعلام ذاكرة بدون ذكرى جديدة";
}

export function buildRunningSummary(
  messages: MemoryMessage[],
  previousSummary = "",
): string {
  const recent = messages
    .slice(-8)
    .map((message) => `${message.role}: ${truncateWords(message.content, 28)}`)
    .join("\n");
  return truncateWords(
    [previousSummary, recent].filter(Boolean).join("\n"),
    130,
  );
}

export function extractSemanticMemories(
  messages: MemoryMessage[],
): ExtractedMemory[] {
  const memories = new Map<string, ExtractedMemory>();

  for (const [index, message] of messages.entries()) {
    if (message.role !== "user") continue;

    if (assistantPlanCommitSignal(message.content)) {
      const previousAssistant = [...messages.slice(0, index)]
        .reverse()
        .find(
          (item) =>
            item.role === "assistant" && assistantPlanCandidate(item.content),
        );
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

async function maybeStoreEmbedding(
  memoryItemId: number,
  input: ConversationMemoryInput,
  content: string,
): Promise<void> {
  try {
    const config = await loadEmbeddingConfig("memory");
    if (!config.enabled) return;

    const [existing] = await db
      .select({ id: aiMemoryEmbeddings.id })
      .from(aiMemoryEmbeddings)
      .where(
        and(
          eq(aiMemoryEmbeddings.memoryItemId, memoryItemId),
          eq(aiMemoryEmbeddings.model, config.model),
          eq(aiMemoryEmbeddings.dimensions, config.dimensions),
        ),
      )
      .limit(1);

    if (existing?.id) return;

    const client = new MemoryEmbeddingClient(config);
    const result = await client.embedText({
      text: content,
      task: "document",
      dimensions: config.dimensions,
      userId: input.userId,
      userType: input.userType,
    });

    if (result.fallback) {
      log.warn(
        {
          event: "memory.embedding_fallback",
          reason: result.fallbackReason ?? "unknown",
        },
        "Embedding skipped",
      );
      return;
    }

    await withMemoryOwnerLock(input, async (tx) => {
      const [current] = await tx
        .select({ id: aiMemoryItems.id })
        .from(aiMemoryItems)
        .where(
          and(
            eq(aiMemoryItems.id, memoryItemId),
            eq(aiMemoryItems.userId, input.userId),
            eq(aiMemoryItems.userType, input.userType),
            eq(aiMemoryItems.status, "active"),
            eq(aiMemoryItems.contentHash, contentHash(content)),
          ),
        );
      if (!current) return;
      await tx
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
    });
  } catch (error) {
    log.warn(
      { event: "memory.embedding_failed", err: error },
      "Embedding skipped",
    );
  }
}

export async function writeConversationMemory(
  input: ConversationMemoryInput,
): Promise<ConversationMemoryDraft> {
  const indexed: Array<{ id: number; content: string }> = [];
  let previousCapsule = "";
  const draft = await withMemoryOwnerLock(input, async (tx) => {
    const [conversation] = await tx
      .select({
        id: chatConversations.id,
        metadata: chatConversations.metadata,
      })
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.id, input.conversationId),
          eq(chatConversations.userId, input.userId),
          eq(chatConversations.userType, input.userType),
        ),
      )
      .for("update");
    // Conversation deletion wins against a delayed writer; no orphaned summary or recalled memory.
    if (!conversation) return { capsule: "", runningSummary: "", memories: [] };
    const [existing] = await tx
      .select()
      .from(aiConversationSummaries)
      .where(
        and(
          eq(aiConversationSummaries.conversationId, input.conversationId),
          eq(aiConversationSummaries.userId, input.userId),
          eq(aiConversationSummaries.userType, input.userType),
        ),
      )
      .limit(1);
    previousCapsule = existing?.capsule ?? "";
    const metadata =
      conversation.metadata && typeof conversation.metadata === "object"
        ? (conversation.metadata as Record<string, unknown>)
        : {};
    const processed =
      typeof metadata.memoryProcessedId === "number"
        ? Math.max(0, metadata.memoryProcessedId)
        : 0;
    const rows = await tx
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
      })
      .from(chatMessages)
      .where(
        and(
          eq(chatMessages.conversationId, input.conversationId),
          gt(chatMessages.id, processed),
        ),
      )
      .orderBy(chatMessages.id)
      .limit(100);
    const fresh = rows.filter(
      (row) => row.role === "user" || row.role === "assistant",
    ) as MemoryMessage[];
    const hasNewUser = fresh.some((row) => row.role === "user");
    const context: MemoryMessage[] = [];
    if (
      processed > 0 &&
      (existing?.capsule || existing?.runningSummary) &&
      hasNewUser
    ) {
      const [previous] = await tx
        .select({
          id: chatMessages.id,
          role: chatMessages.role,
          content: chatMessages.content,
        })
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.conversationId, input.conversationId),
            eq(chatMessages.id, processed),
          ),
        )
        .limit(1);
      if (previous?.role === "assistant")
        context.push({ ...previous, role: "assistant" });
    }
    const built = hasNewUser
      ? draftConversationMemory(
          { ...input, messages: [...context, ...fresh] },
          existing?.runningSummary ?? "",
        )
      : {
          capsule: existing?.capsule ?? "",
          runningSummary: existing?.runningSummary ?? "",
          memories: [],
        };
    const messageCount = (existing?.messageCount ?? 0) + rows.length;
    await tx
      .insert(aiConversationSummaries)
      .values({
        userId: input.userId,
        userType: input.userType,
        conversationId: input.conversationId,
        capsule: built.capsule,
        runningSummary: built.runningSummary,
        messageCount,
        source: input.source ?? "chat",
      })
      .onDuplicateKeyUpdate({
        set: {
          capsule: built.capsule,
          runningSummary: built.runningSummary,
          messageCount,
          source: input.source ?? "chat",
        },
      });
    const watermark = rows.at(-1)?.id ?? processed;
    await tx
      .update(chatConversations)
      .set({
        metadata: sql`JSON_SET(COALESCE(${chatConversations.metadata}, JSON_OBJECT()), '$.memoryProcessedId', ${watermark})`,
      })
      .where(
        and(
          eq(chatConversations.id, input.conversationId),
          eq(chatConversations.userId, input.userId),
          eq(chatConversations.userType, input.userType),
        ),
      );
    for (const memory of built.memories) {
      const hash = contentHash(memory.content);
      await tx
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
      const [stored] = await tx
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
      if (stored) indexed.push({ id: stored.id, content: memory.content });
    }
    return built;
  });
  for (const item of indexed)
    void maybeStoreEmbedding(item.id, input, item.content);
  if (
    draft.memories.length ||
    !isLowSignalMemoryText(draft.capsule) ||
    (previousCapsule && !isLowSignalMemoryText(previousCapsule))
  ) {
    await invalidateMemoryUserCache(input.userId, input.userType);
  }
  return draft;
}
