/** Atomic memory writes, serialized by the account row across workers and server replicas. */
import { and, eq, sql } from "drizzle-orm";
import {
  aiConversationSummaries,
  aiMemoryItems,
  chatConversations,
  chatMessages,
  localUsers,
  users,
} from "../../../db/schema";
import { db } from "../../queries/connection";
import { readSlot, slotMeta } from "./slots";

export type MemoryTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
export interface MemoryOwner {
  userId: number;
  userType: string;
}

export async function withMemoryOwnerLock<T>(
  owner: MemoryOwner,
  work: (tx: MemoryTransaction) => Promise<T>,
): Promise<T> {
  if (owner.userType !== "oauth" && owner.userType !== "local")
    throw new Error("memory_user_type");
  return db.transaction(async (tx) => {
    const table = owner.userType === "oauth" ? users : localUsers;
    const [account] = await tx
      .select({ id: table.id })
      .from(table)
      .where(eq(table.id, owner.userId))
      .for("update");
    // A delayed summary must not recreate data for an account that has been deleted.
    if (!account) throw new Error("memory_user_missing");
    return work(tx);
  });
}

/** Retain only a processed-message watermark: old conversations cannot teach a forgotten fact again next turn. */
export async function forgetConversationSummaries(
  tx: MemoryTransaction,
  owner: MemoryOwner,
): Promise<void> {
  await tx.execute(sql`UPDATE ${chatConversations}
    LEFT JOIN (SELECT conversation_id, MAX(id) AS last_id FROM chat_messages GROUP BY conversation_id) AS memory_watermarks
      ON memory_watermarks.conversation_id = ${chatConversations.id}
    SET ${chatConversations.metadata} = JSON_SET(COALESCE(${chatConversations.metadata}, JSON_OBJECT()), '$.memoryProcessedId', COALESCE(memory_watermarks.last_id, 0))
    WHERE ${chatConversations.userId} = ${owner.userId} AND ${chatConversations.userType} = ${owner.userType}`);
  const conversations = await tx
    .select({
      id: chatConversations.id,
      count: sql<number>`COUNT(${chatMessages.id})`,
    })
    .from(chatConversations)
    .leftJoin(
      chatMessages,
      eq(chatMessages.conversationId, chatConversations.id),
    )
    .where(
      and(
        eq(chatConversations.userId, owner.userId),
        eq(chatConversations.userType, owner.userType),
      ),
    )
    .groupBy(chatConversations.id);
  for (let i = 0; i < conversations.length; i += 200) {
    await tx
      .insert(aiConversationSummaries)
      .values(
        conversations.slice(i, i + 200).map((row) => ({
          ...owner,
          conversationId: row.id,
          capsule: "",
          runningSummary: "",
          messageCount: Number(row.count),
          source: "chat",
        })),
      )
      .onDuplicateKeyUpdate({
        set: {
          capsule: "",
          runningSummary: "",
          messageCount: sql`VALUES(message_count)`,
        },
      });
  }
}

export function observedMemoryTime(metadata: unknown): number {
  const meta =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)
      : {};
  const precise =
    typeof meta.observedAt === "string" ? Date.parse(meta.observedAt) : NaN;
  if (Number.isFinite(precise)) return precise;
  const day = slotMeta(metadata).day;
  return day ? Date.parse(`${day}T00:00:00Z`) : 0;
}

/** Returns false for an older delayed write. Replacement and insertion either both commit or neither does. */
export async function putMemory(
  tx: MemoryTransaction,
  owner: MemoryOwner,
  record: typeof aiMemoryItems.$inferInsert,
  observedAt: Date,
  replaces?: number | null,
): Promise<boolean> {
  const raw =
    record.metadata && typeof record.metadata === "object"
      ? (record.metadata as Record<string, unknown>)
      : {};
  const slot = readSlot(raw.slot)?.slot;
  const scope = and(
    eq(aiMemoryItems.userId, owner.userId),
    eq(aiMemoryItems.userType, owner.userType),
  );
  if (slot) {
    const inSlot = and(
      scope,
      eq(aiMemoryItems.status, "active"),
      sql`JSON_UNQUOTE(JSON_EXTRACT(${aiMemoryItems.metadata}, '$.slot')) = ${slot}`,
    );
    const current = await tx
      .select({ metadata: aiMemoryItems.metadata })
      .from(aiMemoryItems)
      .where(inSlot)
      .for("update");
    if (
      current.some(
        (row) => observedMemoryTime(row.metadata) > observedAt.getTime(),
      )
    )
      return false;
    await tx.update(aiMemoryItems).set({ status: "replaced" }).where(inSlot);
  }
  if (replaces)
    await tx
      .update(aiMemoryItems)
      .set({ status: "replaced" })
      .where(and(scope, eq(aiMemoryItems.id, replaces)));
  const metadata = { ...raw, observedAt: observedAt.toISOString() };
  await tx
    .insert(aiMemoryItems)
    .values({
      ...record,
      userId: owner.userId,
      userType: owner.userType,
      status: "active",
      metadata,
    })
    .onDuplicateKeyUpdate({
      set: {
        status: "active",
        memoryType: record.memoryType,
        importance: record.importance,
        metadata,
        updatedAt: new Date(),
      },
    });
  return true;
}
