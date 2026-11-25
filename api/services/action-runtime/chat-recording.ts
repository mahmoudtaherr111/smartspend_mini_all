import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { aiActionAuditLogs, aiActionMemory, aiPendingActions, chatConversations, chatMessages, classificationLogs, pendingClarifications } from "../../../db/schema";
import { db } from "../../queries/connection";
import { businessDateKey } from "../../lib/app-time";
import { invalidateMemoryUserCache } from "../ai-memory";
import { afterLedgerWrite, deleteLedgerEntryInTx, lockLedgerOwner, type LedgerTx } from "../ledger-writer";
import { readSentence } from "../recording/read-sentence";
import { recordingKey } from "../recording/admission";
import { readingOf } from "../recording/saved-reading";
import type { RecordedItem } from "../recording/types";
import { actionConfirmationArtifact } from "./artifacts";
import { confirmationPhraseFor } from "./confirmation-phrases";
import type { ActionDraft, Artifact } from "../ai-kernel/types";
import type { ActionExecutionResult, ActionRuntimeContext } from "./types";

type ChatRecorder = { id: number; type: "oauth" | "local"; plan?: string };
type Question = { id: number; question: string };
type ChatRecordingReply = {
  response: string;
  conversationId: number;
  tokensUsed: number;
  model: string;
  toolsUsed: string[];
  recordedExpenseIds: number[];
  actions: ActionDraft[];
  artifacts: Artifact[];
  awaitingReadAnswer?: boolean;
};
const identity = (user: { id: number; type: string }) => ({ userId: user.id, userType: user.type });
const actionOwner = (user: ChatRecorder) => and(eq(aiPendingActions.userId, user.id), eq(aiPendingActions.userType, user.type));
const conversationOwner = (id: number, user: ChatRecorder) => and(
  eq(chatConversations.id, id), eq(chatConversations.userId, user.id), eq(chatConversations.userType, user.type),
);
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const positiveId = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const deadline = () => new Date(Date.now() + 30 * 60_000);

type TurnPayload = { messageDigest: string; recordingReply?: ChatRecordingReply; recordingLogId?: number; assistantMessageId?: number };
const payloadOf = (value: unknown) => (value ?? {}) as TurnPayload;
const turnKey = (id: string) => `chat-recording:${digest(id)}`;
type TurnInput = { message: string; clientTurnId: string; conversationId?: number };
type RecordingIntent = { kind: "record"; sentence: string; requireReview: boolean; includesQuestion: boolean }
  | { kind: "answer" | "dismiss"; questionId: number };
type ReplyStructure = (content: string, artifacts: Artifact[], actions: ActionDraft[]) => unknown;

function replyOf(prior: typeof aiPendingActions.$inferSelect, input: TurnInput) {
  const payload = payloadOf(prior.payload);
  if (payload.messageDigest !== digest(input.message) || (input.conversationId && prior.conversationId !== input.conversationId)) {
    throw new TRPCError({ code: "CONFLICT", message: "الرسالة دي ليها محاولة تسجيل مختلفة." });
  }
  if (payload.recordingReply) return payload.recordingReply;
  throw new TRPCError({ code: "CONFLICT", message: "التسجيل لسه شغّال. جرّب تاني بعد شوية." });
}

export async function chatRecordingReplay(user: ChatRecorder, input: TurnInput) {
  const [prior] = await db.select().from(aiPendingActions).where(and(actionOwner(user), eq(aiPendingActions.idempotencyKey, turnKey(input.clientTurnId)))).limit(1);
  if (!prior) return null;
  const reply = replyOf(prior, input);
  const [conv] = await db.select({ id: chatConversations.id }).from(chatConversations).where(conversationOwner(reply.conversationId, user)).limit(1);
  if (!conv) throw new TRPCError({ code: "NOT_FOUND", message: "المحادثة مش موجودة." });
  if (reply.awaitingReadAnswer) await completeChatLedgerWrite(identity(user), reply.recordedExpenseIds);
  return reply;
}

function recordingQuestionsOf(metadata: unknown): Question[] {
  if (!metadata || typeof metadata !== "object" || !("recordingQuestions" in metadata) || !Array.isArray(metadata.recordingQuestions)) return [];
  return metadata.recordingQuestions.filter((question): question is Question => positiveId(question?.id) && typeof question?.question === "string");
}

async function activeRecordingQuestions(connection: typeof db | LedgerTx, user: ChatRecorder, conversationId: number, metadata: unknown) {
  const ids = recordingQuestionsOf(metadata).map(({ id }) => id);
  if (!ids.length) return [];
  return connection.select({ id: pendingClarifications.id, question: pendingClarifications.question }).from(pendingClarifications)
    .where(and(eq(pendingClarifications.userId, user.id), eq(pendingClarifications.userType, user.type),
      eq(pendingClarifications.status, "pending"), inArray(pendingClarifications.id, ids),
      sql`JSON_EXTRACT(${pendingClarifications.contextData}, '$.chatConversationId') = ${conversationId}`))
    .orderBy(pendingClarifications.id);
}

export async function activeChatRecordingQuestion(user: ChatRecorder, conversationId: number, metadata: unknown) {
  const [question] = await activeRecordingQuestions(db, user, conversationId, metadata);
  return question;
}

/** This id is supplied only by the trusted chat turn; the legacy draft parser never accepts it. */
async function saveLoggedChatReading(
  tx: LedgerTx,
  owner: { userId: number; userType: string },
  logId: number,
  confirming: boolean,
) {
  const [log] = await tx.select().from(classificationLogs).where(and(
    eq(classificationLogs.id, logId), eq(classificationLogs.userId, owner.userId), eq(classificationLogs.userType, owner.userType),
  )).limit(1);
  const trace = log?.reasoningTraceLight as { chatRecording?: boolean } | undefined;
  if (!log || trace?.chatRecording !== true || (log.decision !== "auto_save" && (!confirming || log.decision !== "review"))
    || !Array.isArray(log.finalResult) || !log.finalResult.length
    || !log.finalResult.every((item: RecordedItem) => item && item.amount > 0 && readingOf(item.reading))) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "التسجيل محتاج يتراجع من جديد." });
  }
  const { saveClarifiedItems } = await import("../../expense-router");
  return saveClarifiedItems(tx, log.finalResult as RecordedItem[], {
    ...owner, rawText: log.originalText, source: "ai_parsed", askedAt: log.createdAt, classificationLogId: log.id, fromReading: true,
  });
}

export async function confirmChatReading(ctx: ActionRuntimeContext, actionId: number): Promise<ActionExecutionResult | null> {
  const owner = { userId: ctx.userId, userType: ctx.userType };
  const scope = and(eq(aiPendingActions.id, actionId), eq(aiPendingActions.userId, owner.userId),
    eq(aiPendingActions.userType, owner.userType), eq(aiPendingActions.actionName, "expense.create"),
    sql`${aiPendingActions.idempotencyKey} LIKE 'chat-recording:%'`);
  const [candidate] = await db.select({ id: aiPendingActions.id }).from(aiPendingActions).where(scope).limit(1);
  if (!candidate) return null;
  const { expenseIds, undo } = await db.transaction(async tx => {
    await lockLedgerOwner(tx, owner);
    const [action] = await tx.select().from(aiPendingActions).where(scope).limit(1).for("update");
    const { recordingLogId } = payloadOf(action?.payload);
    if (!action?.conversationId || !positiveId(recordingLogId)
      || (ctx.conversationId !== undefined && action.conversationId !== ctx.conversationId)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "التسجيل مش موجود." });
    }
    const [conversation] = await tx.select({ id: chatConversations.id }).from(chatConversations).where(and(
      eq(chatConversations.id, action.conversationId), eq(chatConversations.userId, owner.userId), eq(chatConversations.userType, owner.userType),
    )).limit(1).for("update");
    if (!conversation) throw new TRPCError({ code: "NOT_FOUND", message: "المحادثة مش موجودة." });
    if (action.status === "executed") {
      return action.result as { expenseIds: number[]; undo: ActionDraft };
    }
    if (action.status !== "pending_confirmation" || new Date(action.expiresAt).getTime() < Date.now()) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "التسجيل محتاج يتراجع من جديد." });
    }
    const expenses = await saveLoggedChatReading(tx, owner, recordingLogId, true);
    const expenseIds = expenses.map(({ id }) => id);
    const undo = await recordUndo(tx, { id: owner.userId, type: ctx.userType }, action.conversationId, actionId, expenseIds, []);
    await tx.update(aiPendingActions).set({
      status: "executed", confirmedAt: new Date(), executedAt: new Date(), result: { expenseIds, undo },
    }).where(scope);
    return { expenseIds, undo };
  });
  await completeChatLedgerWrite(owner, expenseIds);
  const message = recordedMessage(expenseIds.length);
  const artifact: Artifact = { id: `action_result:${actionId}`, type: "metric_card", title: message, payload: { expenseIds } };
  return { actionId, actionName: "expense.create", status: "executed", message, result: { expenseIds }, artifact,
    artifacts: [artifact, actionConfirmationArtifact(undo)] };
}

async function completeChatLedgerWrite(owner: { userId: number; userType: string }, expenseIds: number[]) {
  if (!expenseIds.length) return;
  const { commitmentLinksFor } = await import("../../expense-router");
  await afterLedgerWrite(owner, { spending: true });
  await Promise.allSettled([commitmentLinksFor(owner, expenseIds), invalidateMemoryUserCache(owner.userId, owner.userType)]);
}

/** Same action history and confirmation requirements as the rest of the chat. */
async function recordUndo(
  tx: LedgerTx,
  user: Pick<ChatRecorder, "id"> & { type: string },
  conversationId: number,
  recordingActionId: number,
  expenseIds: number[],
  questionIds: number[],
): Promise<ActionDraft> {
  const summary = expenseIds.length === 1 ? "تسجيل عملية" : `تسجيل ${expenseIds.length} عمليات`;
  const [memory] = await tx.insert(aiActionMemory).values({
    ...identity(user), actionName: "expense.create", status: "executed", summary,
    payload: { expenseIds, questionIds }, sourceConversationId: conversationId,
  });
  await tx.insert(aiActionAuditLogs).values({
    ...identity(user), actionId: recordingActionId, actionName: "expense.create", event: "executed", status: "executed",
    metadata: { expenseIds },
  });
  const payload = { targetActionName: "expense.create", targetActionMemoryId: Number(memory.insertId) };
  const [undo] = await tx.insert(aiPendingActions).values({
    ...identity(user), conversationId, actionName: "action.undo", status: "pending_confirmation", risk: "high",
    summary: "تراجع عن التسجيل ده", payload, expiresAt: deadline(),
  });
  return {
    id: String(undo.insertId), name: "action.undo", status: "pending_confirmation", risk: "high",
    summary: "تراجع عن التسجيل ده", payload, confirmationRequired: true,
    confirmationPhrase: confirmationPhraseFor("action.undo", "high"),
  };
}

export async function undoChatReading(
  ctx: ActionRuntimeContext,
  target: { id: number; actionName: string },
  payment: { expenseIds: number[]; questionIds?: number[] },
) {
  const owner = { userId: ctx.userId, userType: ctx.userType };
  await db.transaction(async (tx) => {
    await lockLedgerOwner(tx, owner);
    const own = and(eq(aiActionMemory.id, target.id), eq(aiActionMemory.userId, owner.userId),
      eq(aiActionMemory.userType, owner.userType), eq(aiActionMemory.status, "executed"));
    const [claimed] = await tx.update(aiActionMemory).set({ status: "undone" }).where(own);
    if (!claimed.affectedRows) throw new TRPCError({ code: "CONFLICT", message: "التسجيل ده اتلغى بالفعل." });
    for (const id of payment.expenseIds) await deleteLedgerEntryInTx(tx, owner, id);
    if (payment.questionIds?.length) {
      await tx.update(pendingClarifications).set({ status: "ignored" }).where(and(
        eq(pendingClarifications.userId, owner.userId), eq(pendingClarifications.userType, owner.userType),
        eq(pendingClarifications.status, "pending"), inArray(pendingClarifications.id, payment.questionIds),
      ));
    }
  });
  await afterLedgerWrite(owner);
  return { undoneActionMemoryId: target.id, undoneActionName: target.actionName, expenseIds: payment.expenseIds };
}

const recordedMessage = (count: number) => count === 1 ? "سجّلت عملية." : `سجّلت ${count} عمليات.`;

const ownedQuestion = (id: number, user: ChatRecorder) => and(
  eq(pendingClarifications.id, id), eq(pendingClarifications.userId, user.id),
  eq(pendingClarifications.userType, user.type), eq(pendingClarifications.status, "pending"),
);

export async function runChatRecordingTurn(
  user: ChatRecorder,
  input: TurnInput,
  intent: RecordingIntent,
  structure: ReplyStructure,
): Promise<ChatRecordingReply> {
  const owner = identity(user);
  const idempotencyKey = turnKey(input.clientTurnId);
  const messageDigest = digest(input.message);
  const ownsTurn = and(actionOwner(user), eq(aiPendingActions.idempotencyKey, idempotencyKey));
  const { prepareReadingAnswer, commitPartialReadingInTx } = await import("../../expense-router");
  const read = intent.kind === "record" ? await readSentence({
    user, text: intent.sentence, channel: "text", openClarification: false,
    requestKey: recordingKey("chat", `${input.clientTurnId}:${messageDigest}`),
    partialBooking: !intent.requireReview, chatRecording: true,
  }) : null;
  const [clarification] = intent.kind === "answer"
    ? await db.select().from(pendingClarifications).where(ownedQuestion(intent.questionId, user)).limit(1)
    : [];
  const context = clarification?.contextData as Record<string, unknown> | undefined;
  const prepared = clarification && input.conversationId && context?.chatConversationId === input.conversationId
    ? await prepareReadingAnswer(user, { clarificationId: clarification.id, answer: input.message }, clarification, context, {
      requireReview: context.requireReview === true,
    })
    : null;

  const reply = await db.transaction(async tx => {
    await lockLedgerOwner(tx, owner);
    const [prior] = await tx.select().from(aiPendingActions).where(ownsTurn).limit(1);
    if (prior) return replyOf(prior, input);

    let conversationId = input.conversationId;
    let questions: Question[] = [];
    if (conversationId) {
      const [conversation] = await tx.select({ metadata: chatConversations.metadata }).from(chatConversations)
        .where(conversationOwner(conversationId, user)).limit(1).for("update");
      if (!conversation) throw new TRPCError({ code: "NOT_FOUND", message: "المحادثة مش موجودة." });
      questions = await activeRecordingQuestions(tx, user, conversationId, conversation.metadata);
    } else {
      const [result] = await tx.insert(chatConversations).values({
        ...owner, title: input.message.slice(0, 100), messageCount: 0, totalTokens: 0, lastMessageAt: new Date(),
      });
      conversationId = Number(result.insertId);
    }

    let ids: number[] = [];
    let addedQuestions: Question[] = [];
    let reviewItems: RecordedItem[] = [];
    const recordingLogId = read?.classificationLogId;
    if (intent.kind === "answer" || intent.kind === "dismiss") {
      if (questions[0]?.id !== intent.questionId) {
        throw new TRPCError({ code: "CONFLICT", message: "السؤال ده اتغيّر. افتح المحادثة تاني." });
      }
      if (intent.kind === "dismiss") {
        await tx.update(pendingClarifications).set({ status: "ignored" }).where(ownedQuestion(intent.questionId, user));
        questions.shift();
      } else if (prepared) {
        const result = await prepared.apply(tx);
        ids = result.saved.map(({ id }) => id);
        if (result.needsClarification && result.clarificationQuestion) {
          questions[0] = { id: intent.questionId, question: result.clarificationQuestion };
        } else {
          questions.shift();
        }
      } else {
        throw new TRPCError({ code: "NOT_FOUND", message: "السؤال مش موجود." });
      }
    } else if (intent.kind === "record" && read) {
      if (read.partialReady && recordingLogId) {
        const partial = await commitPartialReadingInTx(tx, owner, recordingLogId, conversationId);
        ids = partial.ids;
        addedQuestions = await tx.select({ id: pendingClarifications.id, question: pendingClarifications.question })
          .from(pendingClarifications).where(and(eq(pendingClarifications.userId, user.id),
            eq(pendingClarifications.userType, user.type), eq(pendingClarifications.status, "pending"),
            inArray(pendingClarifications.id, partial.questionIds))).orderBy(pendingClarifications.id);
      } else if (read.decision === "auto_save" && recordingLogId && !intent.requireReview) {
        ids = (await saveLoggedChatReading(tx, owner, recordingLogId, false)).map(({ id }) => id);
      } else if (read.decision !== "clarify" && recordingLogId && read.items.length) {
        reviewItems = read.items;
      } else if (read.clarificationQuestion) {
        const [question] = await tx.insert(pendingClarifications).values({
          ...owner, originalText: intent.sentence, question: read.clarificationQuestion,
          contextData: { recordingEngine: "understanding", chatConversationId: conversationId, source: "ai_parsed",
            ...(read.restateSentence ? { restateSentence: true } : {}),
            ...(intent.requireReview ? { requireReview: true } : {}),
          },
        });
        addedQuestions = [{ id: Number(question.insertId), question: read.clarificationQuestion }];
      }
    }

    const review = reviewItems.map(item => {
      const incoming = item.direction === "incoming" || item.type === "income";
      const day = item.date ? `، ${businessDateKey(new Date(item.date))}` : "";
      return `${incoming ? "داخل" : "خارج"} ${item.amount} جنيه، ${[item.category, item.subCategory].filter(Boolean).join("/")}${day}`;
    }).join("\n");
    const [action] = await tx.insert(aiPendingActions).values({
      ...owner, conversationId, actionName: "expense.create", status: review ? "pending_confirmation" : "executed",
      risk: "medium", summary: review.slice(0, 500) || "تسجيل من المحادثة", payload: { messageDigest },
      idempotencyKey, expiresAt: deadline(), ...(review ? {} : { executedAt: new Date() }),
    });
    const actionId = Number(action.insertId);
    const actions: ActionDraft[] = [];
    if (ids.length) actions.push(await recordUndo(tx, user, conversationId, actionId, ids, addedQuestions.map(({ id }) => id)));
    if (review) actions.push({
      id: String(actionId), name: "expense.create", status: "pending_confirmation", risk: "medium",
      confirmationRequired: true, summary: review, payload: {},
    });
    const nextQuestions = [...questions, ...addedQuestions];
    const response = [
      ids.length ? recordedMessage(ids.length) : "",
      review ? "راجع التفاصيل وأكّد لو هي صح." : "",
      nextQuestions[0]?.question ?? "",
    ].filter(Boolean).join("\n") || "مفيش عملية اتسجلت.";
    const artifacts = actions.map(actionConfirmationArtifact);
    const row: ChatRecordingReply = {
      conversationId, response, tokensUsed: read?.trace.totalTokens ?? 0, model: read?.model || "recording",
      toolsUsed: ["read_sentence"], recordedExpenseIds: ids, actions, artifacts,
      ...(intent.kind === "record" && intent.includesQuestion ? { awaitingReadAnswer: true } : {}),
    };
    await tx.insert(chatMessages).values({ conversationId, role: "user", content: input.message, tokensUsed: 0 });
    const [assistant] = await tx.insert(chatMessages).values({
      conversationId, role: "assistant", content: response, tokensUsed: row.tokensUsed, model: row.model,
      toolCalls: row.toolsUsed, toolResults: { structured: structure(response, artifacts, actions) },
    });
    await tx.update(aiPendingActions).set({
      payload: { messageDigest, recordingReply: row, assistantMessageId: Number(assistant.insertId), ...(review ? { recordingLogId } : {}) },
    }).where(and(ownsTurn, eq(aiPendingActions.id, actionId)));
    await tx.update(chatConversations).set({
      messageCount: sql`message_count + 2`, totalTokens: sql`total_tokens + ${row.tokensUsed}`, lastMessageAt: new Date(),
      metadata: sql`JSON_SET(COALESCE(${chatConversations.metadata}, JSON_OBJECT()), '$.recordingQuestions', CAST(${JSON.stringify(nextQuestions)} AS JSON))`,
    }).where(conversationOwner(conversationId, user));
    return row;
  });
  await completeChatLedgerWrite(owner, reply.recordedExpenseIds);
  return reply;
}

export async function addChatRecordingAnswer(
  user: ChatRecorder,
  input: TurnInput,
  answer: { response: string; artifacts: Artifact[]; toolsUsed: string[]; tokensUsed: number },
  structure: ReplyStructure,
) {
  const owner = identity(user);
  const scope = and(actionOwner(user), eq(aiPendingActions.idempotencyKey, turnKey(input.clientTurnId)));
  return db.transaction(async tx => {
    await lockLedgerOwner(tx, owner);
    const [action] = await tx.select().from(aiPendingActions).where(scope).limit(1);
    if (!action) throw new TRPCError({ code: "NOT_FOUND", message: "التسجيل مش موجود." });
    const prior = replyOf(action, input);
    const payload = payloadOf(action.payload);
    const [conversation] = await tx.select({ id: chatConversations.id }).from(chatConversations)
      .where(conversationOwner(prior.conversationId, user)).limit(1).for("update");
    if (!conversation || !payload.assistantMessageId || !prior.awaitingReadAnswer) return prior;
    const reply = { ...prior, response: `${prior.response}\n\n${answer.response}`, artifacts: [...prior.artifacts, ...answer.artifacts],
      toolsUsed: [...prior.toolsUsed, ...answer.toolsUsed], tokensUsed: prior.tokensUsed + answer.tokensUsed, awaitingReadAnswer: false };
    await tx.update(aiPendingActions).set({ payload: { ...payload, recordingReply: reply, assistantMessageId: undefined } }).where(scope);
    await tx.update(chatMessages).set({
      content: reply.response, toolCalls: reply.toolsUsed, tokensUsed: reply.tokensUsed,
      toolResults: { structured: structure(reply.response, reply.artifacts, reply.actions) },
    }).where(and(eq(chatMessages.id, payload.assistantMessageId), eq(chatMessages.conversationId, prior.conversationId)));
    await tx.update(chatConversations).set({ totalTokens: sql`total_tokens + ${answer.tokensUsed}` })
      .where(conversationOwner(prior.conversationId, user));
    return reply;
  });
}
