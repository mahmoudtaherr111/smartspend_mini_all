/**
 * memory: what the user said in earlier calls and chats, and what they ask the call to remember or forget.
 * It uses the app's one AI memory (`ai_memory_items`, `retrieveMemoryContext`), never a store of its own, and it
 * refuses to keep age or gender (the owner's decision), however the user phrases it.
 */
import { and, eq } from "drizzle-orm";
import { aiMemoryItems } from "../../../../../db/schema";
import { db } from "../../../../queries/connection";
import { invalidateMemoryUserCache, retrieveMemoryContext } from "../../../ai-memory";
import { contentHash } from "../../../ai-memory/text-utils";
import type { ToolRunOutcome } from "../../gateway/call-session";
import { AGE_OR_GENDER } from "../never-kept";
import { extractSpokenNumbers } from "../validator";
import { num, str, type ToolContext, type VoiceTool } from "./types";

async function search(query: string, ctx: ToolContext): Promise<ToolRunOutcome> {
  const result = await retrieveMemoryContext({ userId: ctx.identity.userId, userType: ctx.identity.userType, query, limit: 4 });
  const found = [...result.memories, ...result.capsules, ...result.actions]
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((item) => ({
      memory_id: item.source === "memory" ? Number(item.id) : null,
      text: String(item.content).replace(/\s+/g, " ").slice(0, 160),
      date: item.createdAt ? new Date(item.createdAt).toISOString().slice(0, 10) : null,
    }));
  // Numbers the user told us before may be repeated back.
  for (const item of found) for (const number of extractSpokenNumbers(item.text)) ctx.ledger.noteUserValue(number.value);
  return {
    response: found.length
      ? { ok: true, found, say: "ده اللي فاكره. لو مش متأكد إنه لسه صح، اسأل." }
      : { ok: true, found: [], say: "مفيش حاجة محفوظة عن ده. قول كده بوضوح ومتألفش." },
  };
}

async function remember(fact: string, ctx: ToolContext): Promise<ToolRunOutcome> {
  if (AGE_OR_GENDER.test(fact)) {
    return { response: { ok: false, error: "not_kept", say: "السن والنوع مش بنحفظهم. قول كده بلطف في جملة." } };
  }
  const content = fact.replace(/\s+/g, " ").trim().slice(0, 300);
  await db.insert(aiMemoryItems).values({
    userId: ctx.identity.userId,
    userType: ctx.identity.userType,
    memoryType: "preference",
    content,
    contentHash: contentHash(content),
    importance: 75,
    status: "active",
    metadata: { source: "voice", callId: ctx.identity.callId, explicit: true },
  }).onDuplicateKeyUpdate({ set: { status: "active", updatedAt: new Date() } });
  await invalidateMemoryUserCache(ctx.identity.userId, ctx.identity.userType).catch(() => undefined);
  return { response: { ok: true, say: "قول إنك هتفتكر ده في جملة قصيرة." } };
}

async function forget(memoryId: number, ctx: ToolContext): Promise<ToolRunOutcome> {
  const scope = and(
    eq(aiMemoryItems.id, memoryId),
    eq(aiMemoryItems.userId, ctx.identity.userId),
    eq(aiMemoryItems.userType, ctx.identity.userType),
  );
  const [item] = await db.select({ id: aiMemoryItems.id }).from(aiMemoryItems).where(scope).limit(1);
  if (!item) return { response: { ok: false, error: "not_found", say: "مالقيتش الحاجة دي. دوّر بـ search الأول." } };
  await db.update(aiMemoryItems).set({ status: "forgotten" }).where(scope);
  await invalidateMemoryUserCache(ctx.identity.userId, ctx.identity.userType).catch(() => undefined);
  return { response: { ok: true, say: "قول إنك نسيتها." } };
}

export const memoryTool: VoiceTool = {
  declaration: {
    name: "memory",
    description:
      "search: what the user said in earlier calls or chats. remember: something the user explicitly asks you to keep. " +
      "forget: a memory the user wants gone (search first to get its memory_id, and confirm with them).",
    parameters: {
      type: "object",
      properties: {
        op: { type: "string", enum: ["search", "remember", "forget"] },
        query: { type: "string", description: "What to look for, for search" },
        fact: { type: "string", description: "What to keep, in a short sentence, for remember" },
        memory_id: { type: "integer", description: "From a search result, for forget" },
      },
      required: ["op"],
    },
  },
  async run(args, ctx) {
    const op = String(args.op ?? "search");
    if (op === "remember") {
      const fact = str(args.fact, 300);
      return fact ? remember(fact, ctx) : { response: { ok: false, error: "missing_fact" } };
    }
    if (op === "forget") {
      const memoryId = num(args.memory_id);
      return memoryId ? forget(Math.floor(memoryId), ctx) : { response: { ok: false, error: "missing_memory_id", say: "دوّر الأول بـ search." } };
    }
    return search(str(args.query, 200) ?? "", ctx);
  },
};
