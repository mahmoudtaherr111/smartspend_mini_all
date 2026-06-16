import { chatConversations, chatMessages } from "../../../db/schema";
import { db } from "../../queries/connection";
import { writeConversationMemory } from "../ai-memory";
import type { VoiceArchiveInput, VoiceArchiveMessage } from "./types";

function insertedId(result: unknown): number {
  const direct = Number((result as { insertId?: unknown })?.insertId);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const first = Array.isArray(result) ? result[0] : undefined;
  const nested = Number((first as { insertId?: unknown })?.insertId);
  return Number.isFinite(nested) && nested > 0 ? nested : 0;
}

function compactTranscript(messages: VoiceArchiveMessage[]): VoiceArchiveMessage[] {
  return messages
    .map((message) => ({
      role: message.role,
      content: message.content.replace(/\s+/g, " ").trim(),
    }))
    .filter((message) => message.content.length > 0)
    .slice(-40);
}

function archiveSummary(sessionId: string, messages: VoiceArchiveMessage[]): string {
  const text = messages
    .slice(-12)
    .map((message) => `${message.role}: ${message.content}`)
    .join("\n");
  const compact = text.length > 2500 ? `${text.slice(0, 2497)}...` : text;
  return [`[Voice call archive]`, `session=${sessionId}`, compact].join("\n");
}

export async function persistVoiceCallArchive(input: VoiceArchiveInput): Promise<{
  conversationId: number;
  archivedMessages: number;
} | null> {
  const transcript = compactTranscript(input.transcript);
  if (transcript.length === 0) return null;

  const inserted = await db.insert(chatConversations).values({
    userId: input.userId,
    userType: input.userType,
    title: `Voice call archive ${new Date().toISOString().slice(0, 10)}`,
    messageCount: 1,
    totalTokens: 0,
    lastMessageAt: new Date(),
  });
  const conversationId = insertedId(inserted);
  if (!conversationId) {
    throw new Error("Failed to create voice call archive conversation");
  }

  await db.insert(chatMessages).values({
    conversationId,
    role: "system",
    content: archiveSummary(input.sessionId, transcript),
    tokensUsed: 0,
    model: "gemini_live_voice",
    createdAt: new Date(),
  });

  await writeConversationMemory({
    userId: input.userId,
    userType: input.userType,
    conversationId,
    messages: transcript,
    source: "voice",
  });

  return {
    conversationId,
    archivedMessages: transcript.length,
  };
}
