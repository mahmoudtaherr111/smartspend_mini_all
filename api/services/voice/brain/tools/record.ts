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
  cancelAction,
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
import { isRefund } from "../../../../../contracts/expense-save";
import { getFinanceCacheGen } from "../../../finance-semantic-layer/cache";
import { normalizeArabic } from "../../../../lib/unified-normalizer";
import {
  num,
  str,
  type BudgetStatus,
  type ParsedExpenseItem,
  type ToolContext,
  type VoiceTool,
} from "./types";
import { COACH_ACTIONS, COACH_FIELDS_SCHEMA, coachDraft, executeCoachDraft } from "./coach";

interface ExpenseDraftPayload {
  businessId?: number;
  items: ParsedExpenseItem[];
  rawText: string;
  classificationLogId?: number;
  /** The waiting entry (a pending clarification) this draft finishes, closed once it is saved. */
  answers?: number;
}

interface ActionDraftPayload {
  actionName: RuntimeActionName;
  payload: RuntimeActionPayload;
  /**
   * The action runtime's pending action, created with the draft: every confirmation (a tap, a yes, a retry after a
   * reconnect) runs this one id, whose pending → confirmed step is atomic, so it runs once.
   */
  actionId: number;
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
    if (base >= 30 && base <= 90 && base % 10 === 0)
      return (base / 10 + 10) * scale;
  }
  return null;
}

function sameAmounts(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = (list: number[]) =>
    [...list].map((n) => Math.round(n * 100)).sort((x, y) => x - y);
  const x = sorted(a);
  const y = sorted(b);
  return x.every((value, index) => value === y[index]);
}

const TYPE_LABEL: Record<string, string> = {
  income: "دخل",
  transfer: "تحويل",
  investment: "استثمار",
};

const operations = (count: number) =>
  spellCount(count, {
    one: "عملية واحدة",
    two: "عمليتين",
    few: "عمليات",
    many: "عملية",
  });

function lineFor(item: ParsedExpenseItem): {
  label: string;
  amount: number;
  detail?: string;
} {
  const what =
    item.subCategory && item.subCategory !== "عام"
      ? item.subCategory
      : item.category;
  // A refund is money back into a category, never new spending in it; the card and the read-back say so.
  const kind = isRefund(item)
    ? "مرتجع"
    : item.type === "transfer" && item.direction
      ? item.direction === "incoming"
        ? "تحويل ليك"
        : "تحويل منك"
      : TYPE_LABEL[item.type];
  const person = item.personName ? ` (${item.personName})` : "";
  return {
    label: kind ? `${kind}: ${what}${person}` : `${what}${person}`,
    amount: item.amount,
    detail: item.description || undefined,
  };
}

/** A total is only said for items of one kind: spending plus a refund, or income plus spending, has no single sum. */
function draftTotal(items: ParsedExpenseItem[]): number | undefined {
  const kinds = new Set(
    items.map((item) => `${item.type}:${item.direction ?? ""}`),
  );
  return kinds.size === 1
    ? items.reduce((sum, item) => sum + item.amount, 0)
    : undefined;
}

function refusalAdvice(reason: GateRefusal): string {
  switch (reason) {
    case "no_yes":
      return "لسه مفيش موافقة واضحة بعد ما عرضت المسودة. اسأل سؤال تأكيد قصير، أو قوله يدوس تأكيد على الكارت.";
    case "changed":
      return "المستخدم غيّر حاجة أو قال لأ. اعمل مسودة جديدة بالتعديل واعرضها تاني.";
    case "expired":
      return "المسودة خلصت صلاحيتها. اعرضها تاني لو لسه عايزها.";
    case "not_latest":
      return "دي مش آخر مسودة. اشتغل على آخر مسودة بس.";
    case "not_presented":
      return "لسه ماعرضتش المسودة على المستخدم. اقراها له واسأله الأول.";
    case "not_pending":
      return "المسودة دي اتنفذت أو اتلغت أو بتتنفذ دلوقتي؛ متنفذهاش تاني.";
    default:
      return "المسودة دي مش متاحة. اعمل مسودة جديدة لو لسه مطلوب.";
  }
}

// ─── record_draft ───────────────────────────────────────────────────

async function recordDraft(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolRunOutcome> {
  const words = str(args.words, 500);
  if (!words)
    return {
      response: {
        ok: false,
        error: "missing_words",
        say: "اطلب من المستخدم يقول المصروف تاني.",
      },
    };
  const normalized = normalizeArabic(words);
  // Paying or returning something "للمحل" describes a merchant too; it does not by itself name the user's ledger.
  const namesBusiness =
    /(?:^|\s)(?:للمشروع|للورشه|للبزنس|لمشروعي|حساب المشروع|حساب المحل|مصاريف المحل|مصروفات المحل|مصاريف المشروع|مصاريف الشغل|ايجار المحل)(?=\s|$)/.test(
      normalized,
    );
  const namesPersonal =
    /(?:^|\s)(?:شخصي|شخصيه|شخصيه|لنفسي|لحسابي الشخصي)(?=\s|$)/.test(normalized);
  if (
    (namesBusiness && (!args.scope || args.scope === "personal")) ||
    (namesPersonal && args.scope === "business") ||
    (namesBusiness && namesPersonal)
  ) {
    return {
      response: {
        ok: false,
        needs: "ledger_scope",
        say: "اسأل ده لمشروعه ولا لحسابه الشخصي. لو فيهم الاتنين، سجل كل حساب لوحده وبموافقته.",
      },
    };
  }
  const business =
    args.scope === "business" ? await ctx.app.business(ctx.identity) : null;
  if (business === "none" || business === "not_in_plan") {
    return {
      response: {
        ok: false,
        error: "business_unavailable",
        say: "التسجيل للمشروع مش متاح دلوقتي. متسجلوش في حسابه الشخصي.",
      },
    };
  }
  const understood = Array.isArray(args.items)
    ? args.items
        .map((item) => num((item as Record<string, unknown>)?.amount))
        .filter((n): n is number => n !== undefined && n > 0)
    : [];

  // An answer to an entry left waiting from before (money_query pending) is recorded the way the app records one:
  // what the user first typed, then the answer in brackets. The first words come from the database, not the model.
  const clarificationId = num(args.clarification_id);
  const waiting =
    clarificationId !== undefined
      ? await ctx.app.waitingEntry(ctx.identity, clarificationId)
      : null;
  if (clarificationId !== undefined && !waiting) {
    return {
      response: {
        ok: false,
        error: "not_waiting",
        say: "العملية دي مابقتش مستنية رد (اتسجلت أو اتقفلت). اسأله لو لسه عايز يسجلها.",
      },
    };
  }
  const text = waiting ? `${waiting.words} (${words})` : words;

  const parsed = business
    ? await ctx.app.parseExpense(ctx.identity, text, {
        businessId: business.id,
      })
    : await ctx.app.parseExpense(ctx.identity, text);
  // The parser opens a question on the home screen; the call asks it itself and closes it once recorded.
  if (parsed.clarificationId)
    ctx.openClarifications.push(parsed.clarificationId);
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
    ...extractSpokenNumbers(
      ctx.drafts.wordsSince(ctx.now().getTime() - 45_000),
    ),
    ...(waiting ? extractSpokenNumbers(waiting.words) : []),
  ].map((n) => n.value);
  const unheard = heard.length
    ? amounts.filter(
        (amount) => !heard.some((value) => Math.abs(value - amount) < 0.5),
      )
    : [];
  const modelDisagrees =
    understood.length > 0 && !sameAmounts(understood, amounts);
  // The words carry a number the user never said while every amount the model understood is one they did: the
  // model misquoted them ("لا قصدي خمسين" sent as "خمسمية عيش"). That is not the user's doubt to settle; the model
  // sends their words again, and the new draft goes through these same checks.
  const misquoted =
    unheard.length > 0 &&
    understood.length > 0 &&
    understood.every((amount) => heard.some((value) => Math.abs(value - amount) < 0.5));
  if (misquoted) {
    return {
      response: {
        ok: false,
        needs: "user_words",
        say:
          `الـwords فيها ${unheard.map((amount) => spellAmount(amount, { exact: true }).text).join(" و")} والمستخدم ماقالهوش. ` +
          "نادي record_draft تاني والـwords بكلام المستخدم نفسه زي ما قاله، من غير ما تسأله.",
      },
    };
  }
  if (unheard.length || modelDisagrees) {
    const doubtful = unheard.length ? unheard : amounts;
    return {
      response: {
        ok: false,
        needs: "confirm_amounts",
        amounts: doubtful.map((amount) => ({
          amount,
          say: spellAmount(amount, { exact: true }).text,
          or:
            confusableWith(amount) === null
              ? null
              : spellAmount(confusableWith(amount)!, { exact: true }).text,
        })),
        say: "اتأكد من الرقم ده بس بسؤال قصير (مثلاً «خمستاشر ولا خمسين؟»)، وبعدين نادي record_draft تاني.",
      },
    };
  }

  // A topic the user dropped while the parse ran leaves no draft behind.
  ctx.signal.throwIfAborted();
  const draft = ctx.drafts.add<ExpenseDraftPayload>({
    kind: "expenses",
    title:
      (parsed.items.length === 1
        ? isRefund(parsed.items[0])
          ? "تسجيل مرتجع"
          : "تسجيل مصروف"
        : `تسجيل ${operations(parsed.items.length)}`) +
      (business ? ` — مشروع ${business.name}` : ""),
    lines: parsed.items.map(lineFor),
    total: draftTotal(parsed.items),
    payload: {
      ...(business ? { businessId: business.id } : {}),
      items: parsed.items,
      rawText: text,
      classificationLogId: parsed.classificationLogId,
      ...(waiting ? { answers: clarificationId } : {}),
    },
  });

  ctx.ledger.nextBatch();
  const items = parsed.items.map((item, index) => {
    const fact = ctx.ledger.add({
      id: `${draft.id}_${index}`,
      label: lineFor(item).label,
      value: item.amount,
      source: "draft",
      exact: true,
    });
    return { what: fact.label, say: fact.say, date: item.date ?? null };
  });
  const total =
    draft.total === undefined
      ? null
      : ctx.ledger.add({
          id: `${draft.id}_total`,
          label: "الإجمالي",
          value: draft.total,
          source: "draft",
          exact: true,
        });
  const doubleCheck = parsed.items
    .filter((item) => confusableWith(item.amount) !== null)
    .map((item) => spellAmount(item.amount, { exact: true }).text);

  return {
    response: {
      ok: true,
      draft_id: draft.id,
      items,
      scope: business ? `مشروع ${business.name}` : "الحساب الشخصي",
      total_say: parsed.items.length > 1 && total ? total.say : undefined,
      ...(parsed.items.some(isRefund)
        ? {
            refund:
              "فيه مرتجع: فلوس رجعتلك وبتتخصم من مصروف الفئة، مش مصروف جديد.",
          }
        : {}),
      ...(doubleCheck.length ? { double_check: doubleCheck } : {}),
      say:
        `لسه ماتسجلش حاجة. اعرض المسودة بالمبلغ والفئة والحساب: «${items.map((item) => `${item.say} جنيه ${item.what}`).join("، ")} ${business ? `لمشروع ${business.name}` : "في الحساب الشخصي"}. ${parsed.items.length === 1 ? "أسجلها؟" : "أسجلهم؟"}». ` +
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
const FORBIDDEN_PROFILE_KEYS =
  /^(age|gender|sex|birth|dateofbirth|dob|birthyear|السن|العمر|النوع)$/i;

function scrubProfile(payload: RuntimeActionPayload): RuntimeActionPayload {
  const record = payload as { patch?: Record<string, unknown> };
  if (!record.patch) return payload;
  const patch = Object.fromEntries(
    Object.entries(record.patch).filter(
      ([key]) => !FORBIDDEN_PROFILE_KEYS.test(key),
    ),
  );
  return { ...(payload as object), patch } as RuntimeActionPayload;
}

async function changeDraft(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolRunOutcome> {
  const action = String(args.action ?? "");
  if (action === "undo_last") {
    const last = ctx.drafts.latestExecuted("expenses");
    if (!last?.resultIds?.length) {
      return {
        response: {
          ok: false,
          error: "nothing_to_undo",
          say: "مفيش حاجة اتسجلت في المكالمة دي أقدر ألغيها. الحاجات القديمة بتتلغي من شاشة المصاريف.",
        },
      };
    }
    const draft = ctx.drafts.add<UndoDraftPayload>({
      kind: "undo",
      title: "إلغاء آخر تسجيل",
      lines: last.lines,
      total: last.total,
      payload: { ids: last.resultIds },
    });
    return {
      response: {
        ok: true,
        draft_id: draft.id,
        undo: last.lines.map((line) => line.label),
        say: "اسأل يأكد إنه عايز يلغي التسجيل ده.",
      },
      card: ctx.drafts.card(draft),
    };
  }

  if ((COACH_ACTIONS as readonly string[]).includes(action)) {
    if (!ctx.coach)
      return {
        response: {
          ok: false,
          error: "not_by_voice",
          say: "دي مش بتتعمل من المكالمة. قوله يعملها من الشاشة بتاعتها.",
        },
      };
    const fields =
      args.fields &&
      typeof args.fields === "object" &&
      !Array.isArray(args.fields)
        ? (args.fields as Record<string, unknown>)
        : {};
    const built = await coachDraft(action, fields, ctx);
    if (!built || "refuse" in built)
      return {
        response: {
          ok: false,
          error: "missing_fields",
          say: built?.refuse ?? "محتاج تفاصيل أكتر.",
          ...(built && "refuse" in built && built.choices ? { choices: built.choices } : {}),
        },
      };
    ctx.signal.throwIfAborted();
    const draft = ctx.drafts.add({
      kind: "coach",
      title: built.title,
      lines: built.lines,
      payload: built.payload,
      edits: built.payload.op === "budget_update",
    });
    return {
      response: {
        ok: true,
        draft_id: draft.id,
        summary: built.title,
        say: "لسه ماتحفظش. اقرا الملخص بجملة واسأل سؤال واحد. متقولش إنه اتحفظ قبل ما confirm يرجع ok.",
      },
      card: ctx.drafts.card(draft),
    };
  }

  const actionName = ACTIONS[action];
  if (!actionName) {
    return {
      response: {
        ok: false,
        error: "not_by_voice",
        say: "دي مش بتتعمل من المكالمة. قوله يعملها من الشاشة بتاعتها.",
      },
    };
  }
  const runtime = {
    userId: ctx.identity.userId,
    userType: ctx.identity.userType,
    userPlan: ctx.identity.plan,
  };
  const words = str(args.words, 400) ?? "";
  const fields =
    args.fields &&
    typeof args.fields === "object" &&
    !Array.isArray(args.fields)
      ? (args.fields as RuntimeActionPayload)
      : null;
  let payload: RuntimeActionPayload | null = null;
  try {
    if (actionName === "goal.create") {
      const candidate =
        (fields as GoalCreatePayload | null) ??
        createGoalPayloadFromMessage(words);
      payload = candidate ? await validateGoalCreate(runtime, candidate) : null;
    } else {
      const candidate =
        fields ??
        (createPhase8PayloadFromMessage(words)?.actionName === actionName
          ? createPhase8PayloadFromMessage(words)!.payload
          : null);
      payload = candidate
        ? await validateRuntimeAction(
            runtime,
            actionName,
            actionName === "profile.update"
              ? scrubProfile(candidate)
              : candidate,
          )
        : null;
    }
  } catch (error) {
    return {
      response: {
        ok: false,
        error: "invalid",
        say:
          error instanceof Error
            ? "في بيانات ناقصة أو غلط. اسأل عن الناقص بس."
            : "اسأل عن الناقص بس.",
      },
    };
  }
  // In a coach call an existing budget is changed with budget_update; budget_create would add a second one for the
  // same category beside it (the evaluation's "أقلل ميزانية الأكل لألف وخمسمية" came as budget_create).
  if (actionName === "budget.create" && ctx.coach) {
    const budgets = await ctx.app.listBudgets(ctx.identity).catch(() => [] as BudgetStatus[]);
    const category = payload ? (payload as { category?: string | null }).category ?? null : null;
    const same = category ? budgets.find((budget) => budget.category === category) : undefined;
    if (same || (!payload && budgets.length)) {
      const listed = (same ? [same] : budgets)
        .slice(0, 6)
        .map((budget) => `${budget.title} (budget_id ${budget.id}، الحد ${budget.limit})`)
        .join("، ");
      return {
        response: {
          ok: false,
          error: same ? "budget_exists" : "missing_fields",
          say: same
            ? `فيه ميزانية للبند ده بالفعل: ${listed}. لتغيير حدها أو وقفها استخدم change_draft budget_update بالـbudget_id ده، مش budget_create.`
            : `الميزانيات الموجودة: ${listed}. لو المستخدم بيغير واحدة منهم استخدم change_draft budget_update بالـbudget_id؛ budget_create بس لبند مالوش ميزانية، وتفاصيله في fields.`,
        },
      };
    }
  }
  if (!payload)
    return {
      response: {
        ok: false,
        error: "missing_fields",
        say: "محتاج تفاصيل أكتر. اسأل عن الناقص بس بسؤال واحد.",
      },
    };

  const summary =
    actionName === "goal.create"
      ? goalSummary(payload as GoalCreatePayload)
      : actionSummary(actionName, payload);
  ctx.signal.throwIfAborted();
  // The durable action is made now, once; confirming runs this id, however many times confirmation arrives.
  const pending =
    actionName === "goal.create"
      ? await createPendingGoalAction(runtime, payload as GoalCreatePayload)
      : await createPendingRuntimeAction(runtime, actionName, payload);
  const draft = ctx.drafts.add<ActionDraftPayload>({
    kind: "action",
    title: summary,
    lines: [{ label: summary }],
    payload: { actionName, payload, actionId: Number(pending.action.id) },
    edits: actionName.endsWith(".update"),
  });
  return {
    response: {
      ok: true,
      draft_id: draft.id,
      summary,
      say: "لسه ماتعملش. اعرض الملخص ده بجملة واسأل سؤال واحد زي «أعملها؟». متقولش إنها اتعملت قبل ما confirm يرجع ok.",
    },
    card: ctx.drafts.card(draft),
  };
}

// ─── Executing a draft (voice or tap) ───────────────────────────────

async function execute(
  draft: Draft,
  ctx: ToolContext,
): Promise<{ ok: boolean; message: string }> {
  if (draft.kind === "expenses") {
    const payload = draft.payload as ExpenseDraftPayload;
    const { ids } = await ctx.app.saveExpenses(
      ctx.identity,
      payload.items.map((item, index) => ({
        ...item,
        ...(payload.businessId ? { businessId: payload.businessId } : {}),
        rawText: payload.rawText,
        classificationLogId: payload.classificationLogId,
        clientRequestId: `vc:${ctx.identity.callId}:${draft.id}:${index}`.slice(
          0,
          64,
        ),
      })),
    );
    const closes = [
      ...ctx.openClarifications.splice(0),
      ...(payload.answers !== undefined ? [payload.answers] : []),
    ];
    for (const id of closes)
      await ctx.app
        .dismissClarification(ctx.identity, id)
        .catch(() => undefined);
    // The batch is one transaction: all of it or none. No row found means it was not written.
    if (ids.length !== payload.items.length) throw new Error("save_incomplete");
    const message =
      payload.items.length === 1
        ? `اتسجل ${lineFor(payload.items[0]).label} بـ ${spellAmount(payload.items[0].amount, { exact: true }).text}`
        : draft.total === undefined
          ? `اتسجلت ${operations(payload.items.length)}`
          : `اتسجلت ${operations(payload.items.length)} بإجمالي ${spellAmount(draft.total, { exact: true }).text}`;
    ctx.drafts.settle(draft.id, "executed", { resultIds: ids, message });
    await recordsChanged(ctx);
    return { ok: true, message };
  }
  if (draft.kind === "undo") {
    const ids = (draft.payload as UndoDraftPayload).ids;
    const { deleted } = await ctx.app.deleteExpenses(ctx.identity, ids);
    const undone = ctx.drafts.latestExecuted("expenses");
    const message =
      deleted === ids.length
        ? "اتلغى آخر تسجيل"
        : `اتلغى ${deleted} من ${ids.length} بس`;
    if (undone && deleted === ids.length)
      ctx.drafts.settle(undone.id, "cancelled", {
        message: `${undone.message ?? undone.title} (اتلغى)`,
      });
    ctx.drafts.settle(draft.id, "executed", { message });
    await recordsChanged(ctx);
    return { ok: true, message };
  }
  if (draft.kind === "coach") {
    const message = await executeCoachDraft(draft, ctx);
    ctx.drafts.settle(draft.id, "executed", { message });
    return { ok: true, message };
  }
  const { actionId } = draft.payload as ActionDraftPayload;
  const runtime = {
    userId: ctx.identity.userId,
    userType: ctx.identity.userType,
    userPlan: ctx.identity.plan,
  };
  const result = await confirmAction(
    runtime,
    actionId,
    {},
    { suggestFollowUp: false },
  );
  const message = result.message || draft.title;
  ctx.drafts.settle(draft.id, "executed", { message });
  await recordsChanged(ctx);
  return { ok: true, message };
}

/** Said with every executed write: the call's earlier figures are out of date until read again. */
export const RECORDS_CHANGED_SAY =
  "السجل اتغير: أي رقم اتقال قبل كده في المكالمة ممكن يكون اتغير؛ لو محتاج رقم هاته تاني بـ money_query.";

/**
 * The call's own write changed the records: every figure read before is marked out of date, and the ledger
 * generation it moved to is taken as seen, so the next read does not report it as someone else's change.
 */
async function recordsChanged(ctx: ToolContext): Promise<void> {
  ctx.ledger.markRecordsChanged();
  if (!ctx.records) return;
  ctx.records.seen = await getFinanceCacheGen(
    ctx.identity.userId,
    ctx.identity.userType,
  ).catch(() => ctx.records!.seen);
}

/** Runs a draft that passed the gate, turning any failure into a settled, honest outcome. */
export async function executeDraft(
  draft: Draft,
  ctx: ToolContext,
): Promise<{ ok: boolean; message: string }> {
  try {
    if (ctx.beforeWrite && !(await ctx.beforeWrite(draft.id))) {
      // A previous owner may already have committed it. Never turn an unknown outcome into permission to retry.
      const message =
        "التسجيل ده اتأكد قبل كده أو الاتصال اتغير. راجع نتيجته في التطبيق قبل ما تعيده.";
      ctx.drafts.settle(draft.id, "failed", { message });
      return { ok: false, message };
    }
    ctx.signal.throwIfAborted();
    return await execute(draft, ctx);
  } catch {
    ctx.drafts.settle(draft.id, "failed", { message: "ماتمش" });
    return { ok: false, message: "ماتمش" };
  }
}

async function confirm(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolRunOutcome> {
  const id = str(args.draft_id, 40) ?? ctx.drafts.latestPending()?.id ?? "";
  let gate = ctx.drafts.gate(id, false);
  // The user's "yes" may be transcribed a moment after the model heard it.
  if (!gate.ok && gate.reason === "no_yes") {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    gate = ctx.drafts.gate(id, false);
  }
  if (!gate.ok) {
    return {
      response: {
        ok: false,
        reason: gate.reason,
        say: refusalAdvice(gate.reason),
      },
    };
  }
  // The gate claimed the draft. Stopped before the write starts, it is released untouched; after this line the write
  // has started and only its own result says what happened.
  if (ctx.signal.aborted) {
    ctx.drafts.release(gate.draft.id);
    return {
      response: {
        ok: false,
        error: "stopped",
        say: "ماتنفذش حاجة. اسأل المستخدم لو لسه عايزها.",
      },
    };
  }
  const result = await executeDraft(gate.draft, ctx);
  const draft = ctx.drafts.get(id)!;
  return {
    response: result.ok
      ? {
          ok: true,
          done: result.message,
          records_changed: RECORDS_CHANGED_SAY,
          say: "قول إن ده اتعمل بجملة قصيرة.",
        }
      : {
          ok: false,
          error: "write_failed",
          say: "قول بوضوح إنه ماتسجلش، واعرض تحاول تاني.",
        },
    card: ctx.drafts.card(draft),
  };
}

async function cancel(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolRunOutcome> {
  const id = str(args.draft_id, 40) ?? ctx.drafts.latestPending()?.id ?? "";
  const draft = ctx.drafts.get(id);
  if (!draft || draft.status !== "pending")
    return { response: { ok: false, error: "no_pending_draft" } };
  ctx.drafts.settle(id, "cancelled");
  await dropRuntimeAction(draft, ctx);
  return {
    response: { ok: true, say: "قول إنك لغيتها." },
    card: ctx.drafts.card(draft),
  };
}

/** A dropped action draft also drops its pending action in the runtime, so it cannot be confirmed from elsewhere. */
export async function dropRuntimeAction(
  draft: Draft,
  ctx: Pick<ToolContext, "identity">,
): Promise<void> {
  if (draft.kind !== "action") return;
  const { actionId } = draft.payload as ActionDraftPayload;
  if (!actionId) return;
  const runtime = {
    userId: ctx.identity.userId,
    userType: ctx.identity.userType,
    userPlan: ctx.identity.plan,
  };
  await cancelAction(runtime, actionId).catch(() => undefined);
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
        words: {
          type: "string",
          description: "The user's own words, verbatim",
        },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              amount: { type: "number" },
              what: { type: "string" },
            },
            required: ["amount"],
          },
        },
        clarification_id: {
          type: "number",
          description:
            "Answering a waiting entry from money_query pending: its id (words = their answer)",
        },
        scope: {
          type: "string",
          enum: ["personal", "business"],
          description:
            "Ledger to record in; ask when unclear. Never move business spending to personal.",
        },
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
          enum: [
            "goal_create",
            "goal_update",
            "budget_create",
            "wallet_create",
            "wallet_update",
            "profile_update",
            "recategorize",
            "undo_last",
          ],
        },
        words: {
          type: "string",
          description: "What the user asked for, in their words",
        },
        fields: {
          type: "object",
          description: "Exact fields when already known",
        },
      },
      required: ["action"],
    },
  },
  run: changeDraft,
};

/** The coach call's change_draft: the same actions, and saving a plan, its steps and reminders, and commitments. */
export const changeDraftCoachTool: VoiceTool = {
  declaration: {
    name: "change_draft",
    description:
      "Draft only; read back then confirm. Money from user/facts, dates as given. budget_id from a read. " +
      "commitment_add: title, kind, direction, amount, recurrence (once for one date), start_day.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "goal_create",
            "goal_update",
            "budget_create",
            "wallet_create",
            "wallet_update",
            "profile_update",
            "recategorize",
            "undo_last",
            ...COACH_ACTIONS,
          ],
        },
        words: {
          type: "string",
          description: "What the user asked for, in their words",
        },
        fields: COACH_FIELDS_SCHEMA,
      },
      required: ["action"],
    },
  },
  run: changeDraft,
};

export const confirmTool: VoiceTool = {
  declaration: {
    name: "confirm",
    description:
      "Execute the latest draft after the user clearly said yes to it. Say it is done only if this returns ok.",
    parameters: {
      type: "object",
      properties: { draft_id: { type: "string" } },
      required: ["draft_id"],
    },
  },
  run: confirm,
};

export const cancelTool: VoiceTool = {
  declaration: {
    name: "cancel",
    description: "Drop a draft the user does not want.",
    parameters: {
      type: "object",
      properties: { draft_id: { type: "string" } },
      required: ["draft_id"],
    },
  },
  run: cancel,
};
