/**
 * memory: what the user said in earlier calls and chats, and what they ask the call to remember or forget.
 * It uses the app's one AI memory (`ai_memory_items`, `retrieveMemoryContext`), never a store of its own, and it
 * refuses to keep age or gender (the owner's decision), however the user phrases it.
 */
import { and, desc, eq } from "drizzle-orm";
import { aiMemoryEmbeddings, aiMemoryItems } from "../../../../../db/schema";
import { businessDateKey } from "../../../../lib/app-time";
import { db } from "../../../../queries/connection";
import { invalidateMemoryUserCache, retrieveMemoryContext } from "../../../ai-memory";
import { contentHash } from "../../../ai-memory/text-utils";
import type { ToolRunOutcome } from "../../gateway/call-session";
import { getSmartProfile } from "../../../user-profile-service";
import { AGE_OR_GENDER } from "../never-kept";
import { callQuestion, checkedAnswer } from "../profile-questions";
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
      date: item.createdAt ? businessDateKey(new Date(item.createdAt)) : null,
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
  // Forgetting deletes the memory and its search vector; nothing of it is kept behind a status.
  await db.delete(aiMemoryItems).where(scope);
  await db.delete(aiMemoryEmbeddings).where(and(
    eq(aiMemoryEmbeddings.memoryItemId, memoryId),
    eq(aiMemoryEmbeddings.userId, ctx.identity.userId),
    eq(aiMemoryEmbeddings.userType, ctx.identity.userType),
  ));
  await invalidateMemoryUserCache(ctx.identity.userId, ctx.identity.userType).catch(() => undefined);
  return { response: { ok: true, say: "قول إنك نسيتها." } };
}

/** The user answered (or declined) the profile question from the call's facts. */
async function answer(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolRunOutcome> {
  const key = str(args.key, 80) ?? "";
  const question = callQuestion(key);
  if (!question) return { response: { ok: false, error: "unknown_question", say: "اسأل بس السؤال اللي في CALL FACTS." } };
  if (args.skip === true) {
    await ctx.app.answerProfileQuestion(ctx.identity, key, undefined, true);
    return { response: { ok: true, say: "قول مفيش مشكلة في كلمتين، ومتسألش تاني." } };
  }
  const value = checkedAnswer(question, args.value);
  if (value === null) {
    return { response: { ok: false, error: "unclear_answer", say: "الإجابة مش واضحة: اسأل تاني بشكل أبسط، أو سيبها." } };
  }
  await ctx.app.answerProfileQuestion(ctx.identity, key, value, false);
  return { response: { ok: true, saved: { key, value }, say: "قول إنك حفظتها في كلمتين، وإنه يقدر يغيرها من ملفه في الإعدادات." } };
}

/** "إنت عارف عني إيه؟": the profile the app keeps and the latest things remembered, in short. */
async function list(ctx: ToolContext): Promise<ToolRunOutcome> {
  const { userId, userType } = ctx.identity;
  const [profile, rows] = await Promise.all([
    getSmartProfile(userId, userType),
    db
      .select({ content: aiMemoryItems.content })
      .from(aiMemoryItems)
      .where(and(eq(aiMemoryItems.userId, userId), eq(aiMemoryItems.userType, userType), eq(aiMemoryItems.status, "active")))
      .orderBy(desc(aiMemoryItems.updatedAt))
      .limit(8),
  ]);
  const fi = profile.financialInfo ?? {};
  const known = Object.fromEntries(Object.entries({
    job: profile.basicInfo?.profession,
    payday: fi.salaryDay,
    income: fi.averageMonthlyIncome,
    goal: fi.primaryGoal,
    debt_monthly: fi.monthlyDebtPayment,
  }).filter(([, value]) => value !== undefined && value !== null && value !== ""));
  for (const value of [fi.averageMonthlyIncome, fi.monthlyDebtPayment]) if (typeof value === "number") ctx.ledger.noteUserValue(value);
  return {
    response: {
      ok: true,
      profile: known,
      remembered: rows.map((row) => String(row.content).replace(/\s+/g, " ").slice(0, 100)),
      say: "لخّص في جملتين أهم اللي تعرفه، وقوله إنه يقدر يشوف كل حاجة ويمسحها من «ذاكرة سمارت» في الشات.",
    },
  };
}

export const memoryTool: VoiceTool = {
  declaration: {
    name: "memory",
    description:
      "search: what the user said before. remember: what they ask you to keep. forget: a memory they want gone (search " +
      "first for its memory_id). list: what you know about them. answer: their answer to the question in CALL FACTS " +
      "(key and value, or skip true if they would rather not say).",
    parameters: {
      type: "object",
      properties: {
        op: { type: "string", enum: ["search", "remember", "forget", "list", "answer"] },
        query: { type: "string", description: "What to look for, for search" },
        fact: { type: "string", description: "What to keep, in a short sentence, for remember" },
        memory_id: { type: "integer", description: "From a search result, for forget" },
        key: { type: "string", description: "The question's key, for answer" },
        value: { type: "string", description: "For answer: a number, true or false, an option value, or option values separated by commas" },
        skip: { type: "boolean", description: "They would rather not say, for answer" },
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
    if (op === "list") return list(ctx);
    if (op === "answer") return answer(args, ctx);
    if (op === "forget") {
      const memoryId = num(args.memory_id);
      return memoryId ? forget(Math.floor(memoryId), ctx) : { response: { ok: false, error: "missing_memory_id", say: "دوّر الأول بـ search." } };
    }
    return search(str(args.query, 200) ?? "", ctx);
  },
};
