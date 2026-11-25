import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../api/queries/connection";
import {
  aiActionAuditLogs, aiActionMemory, aiPendingActions, chatConversations, chatMessages,
  cashflowSettlements, classificationLogs, commitmentHints, commitmentOverrides, commitmentQuestions, commitmentReminders,
  commitmentScheduleItems, expenseDailyRollups, expenses, inAppNotifications, installmentPlans, localUsers, pendingClarifications, scheduledCashflows,
  recordingRequests, systemSettings, userContacts, users,
} from "../db/schema";
import { commitmentsRouter } from "../api/commitments-router";
import { adminConsoleRouter } from "../api/admin-console-router";
import { expenseRouter } from "../api/expense-router";
import { chatRouter } from "../api/chat-router";
import { addDays } from "../api/services/coach/schedule";
import { businessDateKey } from "../api/lib/app-time";
import { invalidateSettingsCache } from "../api/lib/settings-cache";
import { readSentence } from "../api/services/recording/read-sentence";
import { advanceRecording, getRecordingUsage, recordingKey, reserveRecording, settleRecording } from "../api/services/recording/admission";
import { activeChatRecordingQuestion, chatRecordingReplay, runChatRecordingTurn } from "../api/services/action-runtime/chat-recording";
import { cancelAction, confirmAction } from "../api/services/action-runtime";
import { TAXONOMY_VERSION } from "../contracts/taxonomy";

vi.mock("../api/services/recording/read-sentence", async (importOriginal) => ({
  ...await importOriginal<typeof import("../api/services/recording/read-sentence")>(),
  readSentence: vi.fn(),
}));

// Needs a migrated MySQL database: npm run test:db (docs/guides/testing.md).
const itWithDatabase = it.runIf(process.env.RUN_DB_INTEGRATION === "1");

const user = { userId: 88_952, userType: "local" };
const context = { user: { id: user.userId, type: "local", role: "user", plan: "free", name: "Reading Test", email: null } } as never;
const commitments = commitmentsRouter.createCaller(context);
const ledger = expenseRouter.createCaller(context);
const chat = chatRouter.createCaller(context);
const today = businessDateKey();

async function setEngine(value: "rules" | "understanding") {
  await db.insert(systemSettings).values({ key: "recording_engine", value }).onDuplicateKeyUpdate({ set: { value } });
  invalidateSettingsCache();
}

async function clean() {
  if (process.env.RUN_DB_INTEGRATION !== "1") return;
  const scope = <T extends { userId: typeof expenses.userId; userType: typeof expenses.userType }>(table: T) =>
    and(eq(table.userId, user.userId), eq(table.userType, user.userType));
  const threads = await db.select({ id: chatConversations.id }).from(chatConversations).where(scope(chatConversations as never));
  if (threads.length) await db.delete(chatMessages).where(inArray(chatMessages.conversationId, threads.map(({ id }) => id)));
  for (const table of [aiActionAuditLogs, aiActionMemory, aiPendingActions, chatConversations] as const) {
    await db.delete(table).where(scope(table as never));
  }
  for (const table of [cashflowSettlements, commitmentHints, commitmentOverrides, commitmentQuestions, commitmentReminders, commitmentScheduleItems,
    scheduledCashflows, installmentPlans, inAppNotifications, expenses, userContacts, expenseDailyRollups, classificationLogs, pendingClarifications, recordingRequests] as const) {
    await db.delete(table).where(scope(table as never));
  }
  await db.delete(localUsers).where(eq(localUsers.id, user.userId));
  await db.delete(systemSettings).where(eq(systemSettings.key, "recording_engine"));
  invalidateSettingsCache();
}

beforeEach(async () => {
  vi.mocked(readSentence).mockReset();
  await clean();
  if (process.env.RUN_DB_INTEGRATION !== "1") return;
  await db.insert(localUsers).values({ id: user.userId, phone: "syn-reading", name: "Synthetic", password: "synthetic" });
});
afterAll(clean);

/** A reading log row as the recording service writes it: the items, each with its reading. */
async function readingLog(text: string, items: Array<Record<string, unknown>>): Promise<number> {
  const [row] = await db.insert(classificationLogs).values({
    userId: user.userId, userType: user.userType, originalText: text, parsedBy: "ai", finalResult: items, decision: "auto_save", confidence: 100,
  });
  return Number(row.insertId);
}

const schoolReading = (commitmentId: number | null) => ({
  amount: 5000, category: "تعليم", subCategory: "مدرسة", type: "expense", description: "مصاريف يوسف",
  reading: { category: "education", sub: "school_fees", kind: "spending", flow: "out", commitmentId, commitmentDueDay: null, installments: 1, walletId: null, flags: [] },
});

const school = () => commitments.create({ shape: "fixed", kind: "school", title: "مدرسة الأولاد", amount: 5000, remainingCount: 3, startDay: addDays(today, 2) });

const savedRow = async (id: number) => (await db.select().from(expenses).where(and(eq(expenses.id, id), eq(expenses.userId, user.userId), eq(expenses.userType, user.userType))))[0];

describe("atomic recording admission in MySQL", () => {
  const owner = { id: user.userId, type: "local" as const, plan: "free" };
  const limits = { free_daily_limit: "5", recording_monthly_request_limit_free: "3", recording_monthly_token_limit_free: "100" };
  const tokens = (reservedTokens: number) => () => ({ reservedTokens, plan: null });

  itWithDatabase("serializes the last tokens across concurrent recordings and returns unused capacity", async () => {
    const attempts = await Promise.allSettled([
      reserveRecording(owner, recordingKey("typed", "a"), limits, tokens(60)),
      reserveRecording(owner, recordingKey("voice", "b"), limits, tokens(60)),
    ]);
    const [approved] = attempts.filter(result => result.status === "fulfilled");
    expect(attempts.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(approved?.value.lease).toBeDefined();
    expect(await getRecordingUsage(owner)).toMatchObject({ requests: 1, chargedTokens: 0, reservedTokens: 60 });
    await settleRecording(approved.value.lease!, 22);
    await reserveRecording(owner, recordingKey("typed", "next"), limits, tokens(60));
    expect(await getRecordingUsage(owner)).toMatchObject({ requests: 2, chargedTokens: 22, reservedTokens: 60 });
  });

  itWithDatabase("charges speech and provider retries separately while counting and replaying one logical request", async () => {
    const key = recordingKey("voice", "clip");
    const config = { ...limits, recording_monthly_request_limit_free: "1" };
    const first = await reserveRecording(owner, key, config, tokens(25));
    await expect(reserveRecording(owner, key, config, tokens(25))).rejects.toMatchObject({ code: "CONFLICT" });
    await advanceRecording(first.lease!, config, 12, tokens(40));
    await settleRecording(first.lease!, 9);
    const retry = await reserveRecording(owner, key, config, tokens(30));
    const response = {
      text: "دفعت عشر جنيه", items: [], model: "test", parsedBy: "ai" as const,
      decision: "clarify" as const, overallConfidence: 0, processingTimeMs: 10,
      classificationLogId: await readingLog("دفعت عشر جنيه", []),
    };
    await settleRecording(retry.lease!, 17, response);
    const replay = await reserveRecording(owner, key, config, () => { throw new Error("Replay re-admitted"); });
    expect(replay.reply).toEqual(response);
    await expect(reserveRecording(owner, recordingKey("typed", "other"), config, tokens(1))).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await getRecordingUsage(owner)).toMatchObject({ requests: 1, chargedTokens: 38, reservedTokens: 0 });
  });

  itWithDatabase("checks the daily cap and starts a new balance at Cairo midnight on the first", async () => {
    const config = { ...limits, free_daily_limit: "1", recording_monthly_request_limit_free: "1" };
    const priorMonth = new Date("2026-11-30T21:59:59.000Z");
    const newMonth = new Date("2026-11-30T22:00:00.000Z");
    const results = await Promise.allSettled([
      reserveRecording(owner, recordingKey("typed", "month-a"), config, tokens(75), priorMonth),
      reserveRecording(owner, recordingKey("voice", "month-b"), config, tokens(10), priorMonth),
    ]);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    await reserveRecording(owner, recordingKey("typed", "new-month"), config, tokens(100), newMonth);
    expect(await getRecordingUsage(owner, priorMonth)).toMatchObject({ requests: 1 });
    expect(await getRecordingUsage(owner, newMonth)).toMatchObject({ requests: 1, reservedTokens: 100 });
  });
});

describe("chat recording writes", () => {
  const recorder = { id: user.userId, type: "local" as const, plan: "free" };
  const actionContext = { ...user, userPlan: recorder.plan };
  const unstructured = (content: string) => ({ content });
  const failedReply = () => { throw new Error("synthetic reply failure"); };
  const myLedger = () => db.select().from(expenses).where(and(eq(expenses.userId, user.userId), eq(expenses.userType, user.userType)));
  const myActions = () => db.select().from(aiPendingActions).where(and(eq(aiPendingActions.userId, user.userId), eq(aiPendingActions.userType, user.userType)));

  async function mockChatRead(text: string, partial = false) {
    const item = schoolReading(null);
    const id = await readingLog(text, [item]);
    if (partial) {
      await db.update(classificationLogs).set({ decision: "clarify", reasoningTraceLight: {
        chatRecording: true, partialBooking: { missing: [{ clause: "دفعت رسوم التوصيل", itemId: randomUUID() }], businessId: null },
      } }).where(eq(classificationLogs.id, id));
    } else {
      await db.update(classificationLogs).set({ reasoningTraceLight: { chatRecording: true } }).where(eq(classificationLogs.id, id));
    }
    vi.mocked(readSentence).mockResolvedValue({
      decision: partial ? "clarify" : "auto_save", classificationLogId: id, partialReady: partial,
      items: [item], trace: { totalTokens: 0 },
    } as Awaited<ReturnType<typeof readSentence>>);
  }

  itWithDatabase("rolls back a failed chat reply and serializes retries of the same turn", async () => {
    const input = { message: "دفعت ٥٠٠٠ مصاريف مدرسة", clientTurnId: randomUUID() };
    await mockChatRead(input.message);
    const intent = { kind: "record" as const, sentence: input.message, requireReview: false, includesQuestion: false };
    await expect(runChatRecordingTurn(recorder, input, intent, failedReply)).rejects.toThrow("synthetic reply failure");
    expect(await myLedger()).toHaveLength(0);
    expect(await myActions()).toHaveLength(0);

    const [first, retry] = await Promise.all([
      runChatRecordingTurn(recorder, input, intent, unstructured),
      runChatRecordingTurn(recorder, input, intent, unstructured),
    ]);
    expect(first).toEqual(retry);
    expect(await myLedger()).toHaveLength(1);
    expect(await myActions()).toHaveLength(2);
    expect(await chatRecordingReplay(recorder, input)).toEqual(first);
    await expect(chatRecordingReplay(recorder, { ...input, message: "دفعت ٣٠ جنيه" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await chatRecordingReplay({ ...recorder, type: "oauth" }, input)).toBeNull();
  });

  itWithDatabase("requires explicit consent, books a reviewed turn once, and forbids cross-conversation approval", async () => {
    const input = { message: "سجل مصروف مدرسة ٥٠٠٠", clientTurnId: randomUUID() };
    const sentence = "مصروف مدرسة ٥٠٠٠";
    await mockChatRead(sentence);
    const draft = await runChatRecordingTurn(recorder, input, {
      kind: "record", sentence, requireReview: true, includesQuestion: false,
    }, unstructured);
    expect(draft.actions[0]).toMatchObject({ name: "expense.create", status: "pending_confirmation" });
    expect(await myLedger()).toHaveLength(0);
    const actionId = Number(draft.actions[0].id);
    await expect(confirmAction({ ...actionContext, conversationId: draft.conversationId + 1 }, actionId)).rejects.toThrow();
    await expect(confirmAction({ ...actionContext, userType: "oauth" }, actionId)).rejects.toThrow();
    const confirms = await Promise.all([confirmAction(actionContext, actionId), confirmAction(actionContext, actionId)]);
    expect(confirms[0]).toEqual(confirms[1]);
    expect(await myLedger()).toHaveLength(1);
    const undone = await confirmAction(actionContext, Number(confirms[0].artifacts?.at(-1)?.payload.actionId), {
      phrase: "تراجع عن العملية",
    });
    expect(undone.actionName).toBe("action.undo");
    expect(await myLedger()).toHaveLength(0);

    const second = await runChatRecordingTurn(recorder, { ...input, clientTurnId: randomUUID() }, {
      kind: "record", sentence, requireReview: true, includesQuestion: false,
    }, unstructured);
    await cancelAction(actionContext, Number(second.actions[0].id));
    await expect(confirmAction(actionContext, Number(second.actions[0].id))).rejects.toThrow();
    expect(await myLedger()).toHaveLength(0);
  });

  itWithDatabase("answers a mixed turn from the committed ledger and leaves a replay and a question read-only", async () => {
    await setEngine("understanding");
    const sentence = "دفعت ٥٠٠٠ مصاريف مدرسة";
    await mockChatRead(sentence);
    const input = { message: `${sentence}، وقولي صرفت كام النهارده؟`, clientTurnId: randomUUID() };
    const first = await chat.sendMessage(input);
    expect(first.response).toContain("سجّلت عملية.");
    expect(first.response).toMatch(/5[,٬]?000|٥[٬,]?٠٠٠/u);
    expect(first.toolsUsed).toContain("finance.summary");
    expect(await myLedger()).toHaveLength(1);
    const replay = await chat.sendMessage(input);
    expect(replay.response).toEqual(first.response);
    const question = await chat.sendMessage({
      message: "صرفت كام النهارده؟", conversationId: first.conversationId, clientTurnId: randomUUID(),
    });
    expect(question.response).toMatch(/5[,٬]?000|٥[٬,]?٠٠٠/u);
    expect(await myLedger()).toHaveLength(1);
  });

  itWithDatabase("keeps the complete clause and question atomic and rolls back a failed clarification reply", async () => {
    await setEngine("understanding");
    const [previous] = await db.select().from(systemSettings).where(eq(systemSettings.key, "understanding_auto_save"));
    await db.insert(systemSettings).values({ key: "understanding_auto_save", value: "true" }).onDuplicateKeyUpdate({ set: { value: "true" } });
    invalidateSettingsCache();
    try {
      const input = { message: "دفعت ٥٠٠٠ مصاريف مدرسة ودفعت رسوم التوصيل", clientTurnId: randomUUID() };
      const intent = { kind: "record" as const, sentence: input.message, requireReview: false, includesQuestion: false };
      await mockChatRead(input.message, true);
      await expect(runChatRecordingTurn(recorder, input, intent, failedReply)).rejects.toThrow("synthetic reply failure");
      expect(await myLedger()).toHaveLength(0);
      const initial = await runChatRecordingTurn(recorder, input, intent, unstructured);
      expect(await myLedger()).toHaveLength(1);
      expect(await ledger.getPendingClarifications()).toEqual([]);
      const [conversation] = await db.select().from(chatConversations).where(eq(chatConversations.id, initial.conversationId));
      const question = await activeChatRecordingQuestion(recorder, conversation.id, conversation.metadata);
      expect(question?.question).toContain("رسوم التوصيل");
      const answer = { message: "٥٠", clientTurnId: randomUUID(), conversationId: conversation.id };
      await mockChatRead("دفعت رسوم التوصيل (٥٠)");
      const followup = { kind: "answer" as const, questionId: question!.id };
      await expect(runChatRecordingTurn(recorder, answer, followup, failedReply)).rejects.toThrow("synthetic reply failure");
      expect(await myLedger()).toHaveLength(1);
      expect(await activeChatRecordingQuestion(recorder, conversation.id, conversation.metadata)).toEqual(question);
      const recorded = await runChatRecordingTurn(recorder, answer, followup, unstructured);
      expect(recorded.recordedExpenseIds).toHaveLength(1);
      expect(await myLedger()).toHaveLength(2);
      expect(await chatRecordingReplay(recorder, answer)).toEqual(recorded);
      expect(await activeChatRecordingQuestion(recorder, conversation.id, conversation.metadata)).toBeUndefined();
    } finally {
      if (previous) await db.update(systemSettings).set({ value: previous.value }).where(eq(systemSettings.key, previous.key));
      else await db.delete(systemSettings).where(eq(systemSettings.key, "understanding_auto_save"));
      invalidateSettingsCache();
    }
  });
});

describe("saving what a reading read (docs/decisions/0052-understanding-engine.md)", () => {
  itWithDatabase("keeps the specific grocery purpose on readback until the user refiles the expense", async () => {
    await setEngine("understanding");
    const text = "شيبسي من الكشك بـ 35";
    const item = { amount: 35, category: "أكل وشرب", subCategory: "بقالة", type: "expense" as const };
    const classificationLogId = await readingLog(text, [{ ...item, reading: {
      taxonomyVersion: TAXONOMY_VERSION, category: "groceries", sub: "packaged_snacks", kind: "spending", flow: "out",
    } }]);
    const { id } = await ledger.create({ ...item, rawText: text, source: "ai_parsed", classificationLogId });
    expect(await ledger.getById({ id })).toMatchObject({ ...item, amount: expect.anything(),
      purposeLabels: { categoryAr: "بقالة وتموين", subAr: "سناكس ومشروبات" },
    });
    await ledger.update({ id, category: "أكل وشرب", subCategory: "دليفري" });
    await ledger.update({ id, category: "أكل وشرب", subCategory: "بقالة" });
    expect((await ledger.getById({ id }))?.purposeLabels).toBeUndefined();
  });
  itWithDatabase("attributes a subcategory edit to the saved reading when the same sentence was read twice", async () => {
    await setEngine("understanding");
    const text = "مصاريف المدرسة 5000";
    const item = schoolReading(null);
    const logId = await readingLog(text, [item]);
    const repeatId = await readingLog(text, [item]);
    const saved = await ledger.create({ ...item, rawText: text, type: "expense", source: "ai_parsed", classificationLogId: logId });
    await ledger.update({ id: saved.id, category: "تعليم", subCategory: "دروس خصوصية" });
    const log = async (id: number) => (await db.select().from(classificationLogs).where(eq(classificationLogs.id, id)))[0];
    expect((await log(logId)).wasCorrected).toBeTruthy();
    expect((await log(repeatId)).wasCorrected).toBeFalsy();
    await db.update(classificationLogs).set({ classificationVersion: "u2-p6-t2.0" }).where(eq(classificationLogs.id, logId));
    const admin = adminConsoleRouter.createCaller({ user: { id: 1, type: "local", role: "admin" }, req: new Request("http://localhost/") } as never);
    expect((await admin.understandingQuality({ days: 1 })).groups).toEqual(expect.arrayContaining([
      expect.objectContaining({ version: "u2-p6-t2.0", linked: 1, corrected: 1 }),
    ]));
  });
  itWithDatabase("reviews a clarified reading before writing, and accepts its confirmation only once", async () => {
    // A pending understanding question keeps its engine across an admin switch.
    await setEngine("rules");
    const [question] = await db.insert(pendingClarifications).values({
      ...user, originalText: "دفعت اشتراك بالدولار", question: "اكتب العملية بالمصري", status: "pending",
      contextData: { recordingEngine: "understanding", restateSentence: true, source: "ai_parsed" },
    });
    const item = schoolReading(null);
    const text = "دفعت مصاريف المدرسة 5000 جنيه";
    const logId = await readingLog(text, [item]);
    const reader = vi.mocked(readSentence);
    reader.mockResolvedValueOnce({
      text, decision: "review", classificationLogId: logId, items: [item],
    } as Awaited<ReturnType<typeof readSentence>>);
    const clarificationId = Number(question.insertId);
    const review = await ledger.answerClarification({ clarificationId, answer: text });
    expect(reader).toHaveBeenCalledWith(expect.objectContaining({ text }));
    expect(review).toMatchObject({ savedCount: 0, needsClarification: true, clarificationId });
    expect(review.clarificationQuestion).toContain("5000");
    const rows = () => db.select().from(expenses).where(and(eq(expenses.userId, user.userId), eq(expenses.userType, user.userType)));
    expect(await rows()).toHaveLength(0);
    const replies = await Promise.allSettled([1, 2].map(() => ledger.answerClarification({ clarificationId, answer: "احفظ" })));
    expect(replies.filter(reply => reply.status === "fulfilled")).toHaveLength(1);
    expect(reader).toHaveBeenCalledTimes(1);
    expect(await rows()).toMatchObject([{ classificationLogId: logId, category: item.category }]);
  });
  itWithDatabase("links a payment to the commitment its reading named, though the words name none, and keeps the v2 answer on the row", async () => {
    await setEngine("understanding");
    const { id: cashflowId } = await school();
    const classificationLogId = await readingLog("دفعت مصاريف يوسف 5000", [schoolReading(cashflowId)]);

    const saved = await ledger.batchCreate([
      { description: "مصاريف يوسف", rawText: "دفعت مصاريف يوسف 5000", amount: 5000, category: "تعليم", subCategory: "مدرسة", type: "expense", source: "ai_parsed", classificationLogId },
    ]);

    expect(saved.commitmentLinks?.[0]).toMatchObject({ status: "linked", cashflowId });
    const row = await savedRow(saved.ids![0]);
    expect((row.parsedMetadata as { reading?: unknown }).reading).toMatchObject({ category: "education", sub: "school_fees", kind: "spending", flow: "out" });
  });

  itWithDatabase("does not link the same payment without a reading, and ignores a reading the client sends", async () => {
    await setEngine("understanding");
    const { id: cashflowId } = await school();

    const saved = await ledger.create({
      description: "مصاريف يوسف", rawText: "دفعت مصاريف يوسف 5000", amount: 5000, category: "تعليم", subCategory: "مدرسة", type: "expense", source: "ai_parsed",
      parsedMetadata: { reading: { category: "education", sub: "school_fees", kind: "spending", flow: "out", commitmentId: cashflowId } },
    });

    expect(saved.commitmentLinks?.[0]?.status).not.toBe("linked");
    const row = await savedRow(saved.id);
    expect((row.parsedMetadata as { reading?: unknown } | null)?.reading).toBeUndefined();
  });

  itWithDatabase("leaves the reading out when the person changed the category before saving", async () => {
    await setEngine("understanding");
    const { id: cashflowId } = await school();
    const classificationLogId = await readingLog("دفعت مصاريف يوسف 5000", [schoolReading(cashflowId)]);

    const saved = await ledger.create({
      description: "مصاريف يوسف", rawText: "دفعت مصاريف يوسف 5000", amount: 5000, category: "أطفال", subCategory: "عام", type: "expense", source: "ai_parsed", classificationLogId,
    });

    const row = await savedRow(saved.id);
    expect((row.parsedMetadata as { reading?: unknown } | null)?.reading).toBeUndefined();
  });

  itWithDatabase("books a mixed reading once under concurrent retries and asks only about the missing purchase", async () => {
    await setEngine("understanding");
    await db.insert(systemSettings).values({ key: "understanding_auto_save", value: "true" }).onDuplicateKeyUpdate({ set: { value: "true" } });
    invalidateSettingsCache();
    const taxi = { amount: 80, category: "مواصلات", subCategory: "تاكسي", type: "expense", description: "تاكسي",
      readingItemId: "f9aa941b-be44-40f2-9907-430504d37a97",
      reading: { category: "transport", sub: "ride_apps", kind: "spending", flow: "out", taxonomyVersion: TAXONOMY_VERSION } };
    const missingId = "f9aa941b-be44-40f2-9907-430504d37a98";
    const id = await readingLog("ركبت تاكسي بـ٨٠ وجبت دوا مش فاكر بكام", [taxi]);
    try {
      await db.update(classificationLogs).set({ reasoningTraceLight: { partialBooking: {
        businessId: null, missing: [{ clause: "جبت دوا مش فاكر بكام", itemId: missingId }],
      } } }).where(eq(classificationLogs.id, id));
      const call = () => ledger.commitPartialReading({ classificationLogId: id });
      const [a, b] = await Promise.all([call(), call()]);
      expect(b).toEqual(a);
      expect(a.savedIds).toHaveLength(1);
      expect(a.questions).toHaveLength(1);
      const clarificationId = a.questions[0].id;
      const read = vi.mocked(readSentence);
      const medicine = { ...taxi, amount: 120, category: "صحة", subCategory: "صيدلية", description: "دوا",
        readingItemId: missingId, reading: { ...taxi.reading, category: "health", sub: "pharmacy" } };
      read.mockResolvedValueOnce({ decision: "auto_save", classificationLogId: await readingLog("دوا ١٢٠", [medicine]),
        items: [medicine] } as unknown as Awaited<ReturnType<typeof readSentence>>);
      await ledger.answerClarification({ clarificationId, answer: "الدوا كان ١٢٠" });
      expect(read).toHaveBeenCalledWith(expect.objectContaining({ text: "جبت دوا مش فاكر بكام (الدوا كان ١٢٠)", continuationItemId: missingId }));
      await expect(ledger.answerClarification({ clarificationId, answer: "الدوا كان ١٢٠" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      const rows = await db.select().from(expenses).where(and(eq(expenses.userId, user.userId), eq(expenses.userType, user.userType)));
      expect(rows.map(row => Number(row.amount)).sort((x,y) => x-y)).toEqual([80,120]);
      expect((await call()).questions).toEqual([]);
      await db.insert(users).values({ id: user.userId, unionId: "synthetic-reading-scope", name: "Scope fixture" });
      const stranger = expenseRouter.createCaller({ user: { ...user, id: user.userId, type: "oauth" } } as never);
      await expect(stranger.commitPartialReading({ classificationLogId: id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    } finally {
      await db.delete(users).where(and(eq(users.id, user.userId), eq(users.unionId, "synthetic-reading-scope")));
      await db.delete(systemSettings).where(eq(systemSettings.key, "understanding_auto_save"));
      invalidateSettingsCache();
    }
  });

  itWithDatabase("preserves two equal-amount purposes across reordering, a correction and undo", async () => {
    await setEngine("understanding");
    const pair = [
      { id: "62b1d870-80a1-48f8-9b06-e34c3a7174c0", sub: "vegetables_fruits", text: "فاكهة" },
      { id: "62b1d870-80a1-48f8-9b06-e34c3a7174c1", sub: "packaged_snacks", text: "شيبسي" },
    ];
    const item = { amount: 50, category: "أكل وشرب", subCategory: "بقالة", type: "expense" as const };
    const logId = await readingLog("فاكهة ٥٠ وشيبسي ٥٠", pair.map(({ id, sub, text }) => ({
      ...item, readingItemId: id, clause: text, reading: { taxonomyVersion: TAXONOMY_VERSION, category: "groceries", sub, kind: "spending", flow: "out" },
    })));
    const saved = await ledger.batchCreate([...pair].reverse().map(({ id }) => ({
      ...item, classificationLogId: logId, readingItemId: id, rawText: "فاكهة ٥٠ وشيبسي ٥٠",
    })));
    const [snacks, fruit] = saved.ids!;
    expect((await savedRow(snacks)).parsedMetadata).toMatchObject({ readingItemId: pair[1].id, reading: { sub: pair[1].sub } });
    expect((await savedRow(fruit)).parsedMetadata).toMatchObject({ readingItemId: pair[0].id, reading: { sub: pair[0].sub } });
    await ledger.update({ id: snacks, category: "سكن", subCategory: "منظفات" });
    await ledger.delete({ id: snacks });
    expect(await savedRow(snacks)).toBeUndefined();
    expect((await savedRow(fruit)).amount).toEqual("50.00");
    await expect(ledger.create({ ...item, rawText: "فاكهة", classificationLogId: logId, readingItemId: "ef2d9888-ba5a-4401-a556-ee43f331b70c" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  itWithDatabase("keeps an explicit purpose edit even when both leaves have the same old filing", async () => {
    const result = await ledger.create({ type: "expense", category: "أكل وشرب", subCategory: "بقالة", amount: 75,
      rawText: "طلبات", purpose: { category: "groceries", sub: "vegetables_fruits" } });
    expect(await savedRow(result.id)).toMatchObject({ purposeCategoryId: "groceries", purposeSubId: "vegetables_fruits" });
    await ledger.update({ id: result.id, purpose: { category: "groceries", sub: "packaged_snacks" } });
    expect(await savedRow(result.id)).toMatchObject({ category: "أكل وشرب", subCategory: "بقالة", purposeSubId: "packaged_snacks", amount: "75.00" });
    await expect(ledger.update({ id: result.id, purpose: { category: "salary", sub: "other" } })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect((await savedRow(result.id)).purposeSubId).toBe("packaged_snacks");
  });

  itWithDatabase("changes nothing under the rules engine", async () => {
    await setEngine("rules");
    const { id: cashflowId } = await school();
    const classificationLogId = await readingLog("دفعت مصاريف يوسف 5000", [schoolReading(cashflowId)]);

    const saved = await ledger.create({
      description: "مصاريف يوسف", rawText: "دفعت مصاريف يوسف 5000", amount: 5000, category: "تعليم", subCategory: "مدرسة", type: "expense", source: "ai_parsed", classificationLogId,
    });

    expect(saved.commitmentLinks?.[0]?.status).not.toBe("linked");
    const row = await savedRow(saved.id);
    expect((row.parsedMetadata as { reading?: unknown } | null)?.reading).toBeUndefined();
  });
});
