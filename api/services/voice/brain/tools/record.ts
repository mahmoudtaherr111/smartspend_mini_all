/**
 * Writing from a call: record_draft, change_draft, confirm and cancel.
 *
 * A spoken expense goes through the same parser as a typed one (`ai.parseExpense`), and its amounts are checked
 * twice: against the items the model understood, and against the numbers actually heard from the user. Any
 * disagreement becomes one question about that number. Nothing is written without a draft, the gate in
 * drafts.ts, and a result read back from the write itself; only then may the assistant say it is done.
 */
import type { ToolRunOutcome } from "../../gateway/call-session";
import {
  actionSummary,
  confirmAction,
  createGoalPayloadFromMessage,
  createPendingGoalAction,
  createPendingRuntimeAction,
  createPhase8PayloadFromMessage,
  goalSummary,
  validateGoalCreate,
  validateRuntimeAction,
  type GoalCreatePayload,
  type RuntimeActionName,
  type RuntimeActionPayload,
} from "../../../action-runtime";
import type { Draft, GateRefusal } from "../drafts";
import { spellAmount, spellCount } from "../spoken";
import { extractSpokenNumbers } from "../validator";
import { num, str, type ParsedExpenseItem, type ToolContext, type VoiceTool } from "./types";

interface ExpenseDraftPayload {
  items: ParsedExpenseItem[];
  rawText: string;
  classificationLogId?: number;
  /** The waiting entry (a pending clarification) this draft finishes, closed once it is saved. */
  answers?: number;
}

interface ActionDraftPayload {
  actionName: RuntimeActionName;
  payload: RuntimeActionPayload;
}

interface UndoDraftPayload {
  ids: number[];
}

/** 15 and 50 sound alike in a noisy street; so do their thousands. */
export function confusableWith(amount: number): number | null {
  for (const scale of [1, 1000]) {
    const base = amount / scale;
    if (!Number.isInteger(base)) continue;
    if (base >= 13 && base <= 19) return (base - 10) * 10 * scale;
    if (base >= 30 && base <= 90 && base % 10 === 0) return (base / 10 + 10) * scale;
  }
  return null;
}

function sameAmounts(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = (list: number[]) => [...list].map((n) => Math.round(n * 100)).sort((x, y) => x - y);
  const x = sorted(a);
  const y = sorted(b);
  return x.every((value, index) => value === y[index]);
}

const TYPE_LABEL: Record<string, string> = { income: "دخل", transfer: "تحويل", investment: "استثمار" };

const operations = (count: number) => spellCount(count, { one: "عملية واحدة", two: "عمليتين", few: "عمليات", many: "عملية" });

function lineFor(item: ParsedExpenseItem): { label: string; amount: number; detail?: string } {
  const what = item.subCategory && item.subCategory !== "عام" ? item.subCategory : item.category;
  return {
    label: TYPE_LABEL[item.type] ? `${TYPE_LABEL[item.type]}: ${what}` : what,
    amount: item.amount,
    detail: item.description || undefined,
  };
}

function refusalAdvice(reason: GateRefusal): string {
  switch (reason) {
    case "no_yes": return "لسه مفيش موافقة واضحة بعد ما عرضت المسودة. اسأل سؤال تأكيد قصير، أو قوله يدوس تأكيد على الكارت.";
    case "changed": return "المستخدم غيّر حاجة أو قال لأ. اعمل مسودة جديدة بالتعديل واعرضها تاني.";
    case "expired": return "المسودة خلصت صلاحيتها. اعرضها تاني لو لسه عايزها.";
    case "not_latest": return "دي مش آخر مسودة. اشتغل على آخر مسودة بس.";
    default: return "المسودة دي مش متاحة. اعمل مسودة جديدة لو لسه مطلوب.";
  }
}

// ─── record_draft ───────────────────────────────────────────────────

async function recordDraft(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolRunOutcome> {
  const words = str(args.words, 500);
  if (!words) return { response: { ok: false, error: "missing_words", say: "اطلب من المستخدم يقول المصروف تاني." } };
  const understood = Array.isArray(args.items)
    ? args.items.map((item) => num((item as Record<string, unknown>)?.amount)).filter((n): n is number => n !== undefined && n > 0)
    : [];

  // An answer to an entry left waiting from before (money_query pending) is recorded the way the app records one:
  // what the user first typed, then the answer in brackets. The first words come from the database, not the model.
  const clarificationId = num(args.clarification_id);
  const waiting = clarificationId !== undefined ? await ctx.app.waitingEntry(ctx.identity, clarificationId) : null;
  if (clarificationId !== undefined && !waiting) {
    return { response: { ok: false, error: "not_waiting", say: "العملية دي مابقتش مستنية رد (اتسجلت أو اتقفلت). اسأله لو لسه عايز يسجلها." } };
  }
  const text = waiting ? `${waiting.words} (${words})` : words;

  const parsed = await ctx.app.parseExpense(ctx.identity, text);
  // The parser opens a question on the home screen; the call asks it itself and closes it once recorded.
  if (parsed.clarificationId) ctx.openClarifications.push(parsed.clarificationId);
  if (parsed.decision === "clarify" || parsed.items.length === 0) {
    return {
      response: {
        ok: false,
        needs: "clarification",
        question: parsed.clarificationQuestion ?? "ممكن توضح المبلغ والحاجة؟",
        say: "اسأل السؤال ده بكلامك، ولما يجاوب نادي record_draft تاني بالجملة كاملة.",
        clarification_id: parsed.clarificationId ?? null,
      },
    };
  }

  const amounts = parsed.items.map((item) => item.amount);
  // Numbers the user typed in a waiting entry are theirs as much as the ones just said.
  const heard = [
    ...extractSpokenNumbers(ctx.drafts.wordsSince(ctx.now().getTime() - 45_000)),
    ...(waiting ? extractSpokenNumbers(waiting.words) : []),
  ].map((n) => n.value);
  const unheard = heard.length ? amounts.filter((amount) => !heard.some((value) => Math.abs(value - amount) < 0.5)) : [];
  const modelDisagrees = understood.length > 0 && !sameAmounts(understood, amounts);
  if (unheard.length || modelDisagrees) {
    const doubtful = unheard.length ? unheard : amounts;
    return {
      response: {
        ok: false,
        needs: "confirm_amounts",
        amounts: doubtful.map((amount) => ({
          amount,
          say: spellAmount(amount, { exact: true }).text,
          or: confusableWith(amount) === null ? null : spellAmount(confusableWith(amount)!, { exact: true }).text,
        })),
        say: "اتأكد من الرقم ده بس بسؤال قصير (مثلاً «خمستاشر ولا خمسين؟»)، وبعدين نادي record_draft تاني.",
      },
    };
  }

  const draft = ctx.drafts.add<ExpenseDraftPayload>({
    kind: "expenses",
    title: parsed.items.length === 1 ? "تسجيل مصروف" : `تسجيل ${operations(parsed.items.length)}`,
    lines: parsed.items.map(lineFor),
    total: parsed.items.reduce((sum, item) => sum + item.amount, 0),
    payload: {
      items: parsed.items,
      rawText: text,
      classificationLogId: parsed.classificationLogId,
      ...(waiting ? { answers: clarificationId } : {}),
    },
  });

  ctx.ledger.nextBatch();
  const items = parsed.items.map((item, index) => {
    const fact = ctx.ledger.add({ id: `${draft.id}_${index}`, label: lineFor(item).label, value: item.amount, source: "draft", exact: true });
    return { what: fact.label, say: fact.say, date: item.date ?? null };
  });
  const total = ctx.ledger.add({ id: `${draft.id}_total`, label: "الإجمالي", value: draft.total ?? 0, source: "draft", exact: true });
  const doubleCheck = parsed.items
    .filter((item) => confusableWith(item.amount) !== null)
    .map((item) => spellAmount(item.amount, { exact: true }).text);

  return {
    response: {
      ok: true,
      draft_id: draft.id,
      items,
      total_say: parsed.items.length > 1 ? total.say : undefined,
      ...(doubleCheck.length ? { double_check: doubleCheck } : {}),
      say:
        "لسه ماتسجلش حاجة. اقرا البنود في جملة واسأل سؤال واحد: «أسجلها؟» لبند واحد، «أسجلهم؟» لأكتر من بند. " +
        "متقولش «سجلت» ولا «اتسجل» قبل ما confirm يرجع ok. " +
        "الأرقام اللي في double_check قولها بوضوح عشان متتلخبطش.",
    },
    card: ctx.drafts.card(draft),
  };
}

// ─── change_draft ───────────────────────────────────────────────────

const ACTIONS: Record<string, RuntimeActionName> = {
  goal_create: "goal.create",
  goal_update: "goal.update",
  budget_create: "budget.create",
  wallet_create: "wallet.create",
  wallet_update: "wallet.update",
  profile_update: "profile.update",
  recategorize: "expense.recategorize",
};

/** Age and gender are never stored (the owner's decision), whatever the call hears. */
const FORBIDDEN_PROFILE_KEYS = /^(age|gender|sex|birth|dateofbirth|dob|birthyear|السن|العمر|النوع)$/i;

function scrubProfile(payload: RuntimeActionPayload): RuntimeActionPayload {
  const record = payload as { patch?: Record<string, unknown> };
  if (!record.patch) return payload;
  const patch = Object.fromEntries(Object.entries(record.patch).filter(([key]) => !FORBIDDEN_PROFILE_KEYS.test(key)));
  return { ...(payload as object), patch } as RuntimeActionPayload;
}

async function changeDraft(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolRunOutcome> {
  const action = String(args.action ?? "");
  if (action === "undo_last") {
    const last = ctx.drafts.latestExecuted("expenses");
    if (!last?.resultIds?.length) {
      return { response: { ok: false, error: "nothing_to_undo", say: "مفيش حاجة اتسجلت في المكالمة دي أقدر ألغيها. الحاجات القديمة بتتلغي من شاشة المصاريف." } };
    }
    const draft = ctx.drafts.add<UndoDraftPayload>({
      kind: "undo",
      title: "إلغاء آخر تسجيل",
      lines: last.lines,
      total: last.total,
      payload: { ids: last.resultIds },
    });
    return {
      response: { ok: true, draft_id: draft.id, undo: last.lines.map((line) => line.label), say: "اسأل يأكد إنه عايز يلغي التسجيل ده." },
      card: ctx.drafts.card(draft),
    };
  }

  const actionName = ACTIONS[action];
  if (!actionName) {
    return { response: { ok: false, error: "not_by_voice", say: "دي مش بتتعمل من المكالمة. قوله يعملها من الشاشة بتاعتها." } };
  }
  const runtime = { userId: ctx.identity.userId, userType: ctx.identity.userType, userPlan: ctx.identity.plan };
  const words = str(args.words, 400) ?? "";
  const fields = args.fields && typeof args.fields === "object" && !Array.isArray(args.fields)
    ? (args.fields as RuntimeActionPayload) : null;
  let payload: RuntimeActionPayload | null = null;
  try {
    if (actionName === "goal.create") {
      const candidate = (fields as GoalCreatePayload | null) ?? createGoalPayloadFromMessage(words);
      payload = candidate ? await validateGoalCreate(runtime, candidate) : null;
    } else {
      const candidate = fields ?? (createPhase8PayloadFromMessage(words)?.actionName === actionName
        ? createPhase8PayloadFromMessage(words)!.payload : null);
      payload = candidate ? await validateRuntimeAction(runtime, actionName, actionName === "profile.update" ? scrubProfile(candidate) : candidate) : null;
    }
  } catch (error) {
    return { response: { ok: false, error: "invalid", say: error instanceof Error ? "في بيانات ناقصة أو غلط. اسأل عن الناقص بس." : "اسأل عن الناقص بس." } };
  }
  if (!payload) return { response: { ok: false, error: "missing_fields", say: "محتاج تفاصيل أكتر. اسأل عن الناقص بس بسؤال واحد." } };

  const summary = actionName === "goal.create" ? goalSummary(payload as GoalCreatePayload) : actionSummary(actionName, payload);
  const draft = ctx.drafts.add<ActionDraftPayload>({
    kind: "action",
    title: summary,
    lines: [{ label: summary }],
    payload: { actionName, payload },
  });
  return { response: { ok: true, draft_id: draft.id, summary, say: "لسه ماتعملش. اعرض الملخص ده بجملة واسأل سؤال واحد زي «أعملها؟». متقولش إنها اتعملت قبل ما confirm يرجع ok." }, card: ctx.drafts.card(draft) };
}

// ─── Executing a draft (voice or tap) ───────────────────────────────

async function execute(draft: Draft, ctx: ToolContext): Promise<{ ok: boolean; message: string }> {
  if (draft.kind === "expenses") {
    const payload = draft.payload as ExpenseDraftPayload;
    const { ids } = await ctx.app.saveExpenses(ctx.identity, payload.items.map((item, index) => ({
      ...item,
      rawText: payload.rawText,
      classificationLogId: payload.classificationLogId,
      clientRequestId: `vc:${ctx.identity.callId}:${draft.id}:${index}`.slice(0, 64),
    })));
    const closes = [...ctx.openClarifications.splice(0), ...(payload.answers !== undefined ? [payload.answers] : [])];
    for (const id of closes) await ctx.app.dismissClarification(ctx.identity, id).catch(() => undefined);
    if (ids.length !== payload.items.length) throw new Error("save_incomplete");
    const message = payload.items.length === 1
      ? `اتسجل ${lineFor(payload.items[0]).label} بـ ${spellAmount(payload.items[0].amount, { exact: true }).text}`
      : `اتسجلت ${operations(payload.items.length)} بإجمالي ${spellAmount(draft.total ?? 0, { exact: true }).text}`;
    ctx.drafts.settle(draft.id, "executed", { resultIds: ids, message });
    return { ok: true, message };
  }
  if (draft.kind === "undo") {
    await ctx.app.deleteExpenses(ctx.identity, (draft.payload as UndoDraftPayload).ids);
    const undone = ctx.drafts.latestExecuted("expenses");
    if (undone) ctx.drafts.settle(undone.id, "cancelled", { message: `${undone.message ?? undone.title} (اتلغى)` });
    ctx.drafts.settle(draft.id, "executed", { message: "اتلغى آخر تسجيل" });
    return { ok: true, message: "اتلغى آخر تسجيل" };
  }
  const { actionName, payload } = draft.payload as ActionDraftPayload;
  const runtime = { userId: ctx.identity.userId, userType: ctx.identity.userType, userPlan: ctx.identity.plan };
  const pending = actionName === "goal.create"
    ? await createPendingGoalAction(runtime, payload as GoalCreatePayload)
    : await createPendingRuntimeAction(runtime, actionName, payload);
  const result = await confirmAction(runtime, Number(pending.action.id));
  const message = result.message || draft.title;
  ctx.drafts.settle(draft.id, "executed", { message });
  return { ok: true, message };
}

/** Runs a draft that passed the gate, turning any failure into a settled, honest outcome. */
export async function executeDraft(draft: Draft, ctx: ToolContext): Promise<{ ok: boolean; message: string }> {
  try {
    return await execute(draft, ctx);
  } catch {
    ctx.drafts.settle(draft.id, "failed", { message: "ماتمش" });
    return { ok: false, message: "ماتمش" };
  }
}

async function confirm(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolRunOutcome> {
  const id = str(args.draft_id, 40) ?? ctx.drafts.latestPending()?.id ?? "";
  let gate = ctx.drafts.gate(id, false);
  // The user's "yes" may be transcribed a moment after the model heard it.
  if (!gate.ok && gate.reason === "no_yes") {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    gate = ctx.drafts.gate(id, false);
  }
  if (!gate.ok) {
    return { response: { ok: false, reason: gate.reason, say: refusalAdvice(gate.reason) } };
  }
  const result = await executeDraft(gate.draft, ctx);
  const draft = ctx.drafts.get(id)!;
  return {
    response: result.ok
      ? { ok: true, done: result.message, say: "قول إن ده اتعمل بجملة قصيرة." }
      : { ok: false, error: "write_failed", say: "قول بوضوح إنه ماتسجلش، واعرض تحاول تاني." },
    card: ctx.drafts.card(draft),
  };
}

async function cancel(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolRunOutcome> {
  const id = str(args.draft_id, 40) ?? ctx.drafts.latestPending()?.id ?? "";
  const draft = ctx.drafts.get(id);
  if (!draft || draft.status !== "pending") return { response: { ok: false, error: "no_pending_draft" } };
  ctx.drafts.settle(id, "cancelled");
  return { response: { ok: true, say: "قول إنك لغيتها." }, card: ctx.drafts.card(draft) };
}

// ─── Declarations ──────────────────────────────────────────────────

export const recordDraftTool: VoiceTool = {
  declaration: {
    name: "record_draft",
    description:
      "Prepare money the user says was spent or received (already happened). Pass their exact words and the amounts " +
      "you understood. Returns a draft to read back and confirm, a question to ask, or amounts to double-check.",
    parameters: {
      type: "object",
      properties: {
        words: { type: "string", description: "The user's own words, verbatim" },
        items: {
          type: "array",
          items: { type: "object", properties: { amount: { type: "number" }, what: { type: "string" } }, required: ["amount"] },
        },
        clarification_id: { type: "number", description: "Answering a waiting entry from money_query pending: its id (words = their answer)" },
      },
      required: ["words"],
    },
  },
  run: recordDraft,
};

export const changeDraftTool: VoiceTool = {
  declaration: {
    name: "change_draft",
    description:
      "Prepare a change: a savings goal, a budget, a wallet, a profile detail, a recategorized expense, or undoing " +
      "what this call recorded. Returns a draft to confirm.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["goal_create", "goal_update", "budget_create", "wallet_create", "wallet_update", "profile_update", "recategorize", "undo_last"],
        },
        words: { type: "string", description: "What the user asked for, in their words" },
        fields: { type: "object", description: "Exact fields when already known" },
      },
      required: ["action"],
    },
  },
  run: changeDraft,
};

export const confirmTool: VoiceTool = {
  declaration: {
    name: "confirm",
    description: "Execute the latest draft after the user clearly said yes to it. Say it is done only if this returns ok.",
    parameters: { type: "object", properties: { draft_id: { type: "string" } }, required: ["draft_id"] },
  },
  run: confirm,
};

export const cancelTool: VoiceTool = {
  declaration: {
    name: "cancel",
    description: "Drop a draft the user does not want.",
    parameters: { type: "object", properties: { draft_id: { type: "string" } }, required: ["draft_id"] },
  },
  run: cancel,
};

