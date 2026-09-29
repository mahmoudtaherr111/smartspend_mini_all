/**
 * The coach call's follow-up: what is due and free until payday, the plan the user agreed to and how it is going,
 * and the drafts that save a plan, mark a step, set a reminder or record a commitment. Every write is a draft behind
 * the consent gate (api/services/voice/brain/drafts.ts) and runs through api/services/coach, the same code the plan
 * screen uses. Amounts in a draft must be ones the call read, computed or heard from the user.
 */
import { businessDateKey, parseBusinessInstant } from "../../../../lib/app-time";
import { CASHFLOW_KINDS, createCashflow, position, settle, type CashflowKind } from "../../../coach/cashflows";
import { acceptPlan, activePlan, cancelReminder, setReminder, setStepStatus, STEP_KINDS, type StepKind } from "../../../coach/plans";
import { addDays, daysBetween } from "../../../coach/schedule";
import { getCategoryTotal, getFinanceBreakdown } from "../../../finance-semantic-layer/resolvers";
import type { ToolRunOutcome } from "../../gateway/call-session";
import type { Draft } from "../drafts";
import type { FactUnit } from "../facts";
import { spellAmount } from "../spoken";
import { num, str, type ToolContext } from "./types";

type Fact = { label: string; value: number; unit?: FactUnit; exact?: boolean };
type Answer = (built: { title: string; facts: Fact[]; extra?: Record<string, unknown>; coverage?: string }, label: string) => ToolRunOutcome;

const STATUS: Record<string, string> = { paid: "اتدفع", partial: "اتدفع جزء", due: "لسه", overdue: "فات ميعاده", unconfirmed: "مش معروف اتدفع ولا لأ" };

/** money_query commitments: what is due, what may come in, and what is free until the next payday. */
export async function commitmentsAnswer(ctx: ToolContext, answer: Answer): Promise<ToolRunOutcome> {
  const user = { userId: ctx.identity.userId, userType: ctx.identity.userType };
  const cash = await position(user, ctx.now());
  const next = cash.occurrences.filter((o) => o.status !== "paid").slice(0, 6);
  const facts: Fact[] = [
    { label: "اللي في المحافظ زي ما اتسجل", value: cash.wallets.total },
    { label: "اللي عليك لحد القبض ولسه مادفعتوش", value: cash.duesKnown },
    { label: "الفاضل بعد الالتزامات لحد القبض (من غير أي دخل جاي)", value: cash.freeBeforeIncome },
    ...(cash.incomeConfirmed ? [{ label: "دخل مؤكد جاي قبل القبض", value: cash.incomeConfirmed }] : []),
    ...(cash.incomeEstimated ? [{ label: "دخل متوقع مش مؤكد", value: cash.incomeEstimated }] : []),
    { label: cash.untilIsPayday ? "أيام لحد القبض" : "أيام لحد آخر الشهر", value: cash.days, unit: "days" },
  ];
  const caveats = [
    cash.wallets.count === 0 ? "مفيش محافظ متسجلة، فالفاضل محسوب من صفر." : null,
    cash.wallets.unknownAge ? `${cash.wallets.unknownAge} من المحافظ رصيدها مش معروف اتسجل امتى.` : null,
    cash.wallets.oldestObservedDay && cash.wallets.oldestObservedDay < addDays(cash.today, -3)
      ? `فيه رصيد متسجل من يوم ${cash.wallets.oldestObservedDay}؛ المصاريف بعده مش متخصومة منه.` : null,
    cash.duesUnknownAmount.length ? `فيه التزامات مبلغها مش معروف: ${cash.duesUnknownAmount.map((o) => o.title).join("، ")}.` : null,
    cash.duesUnconfirmed.length ? `مش معروف اتدفع ولا لأ: ${cash.duesUnconfirmed.map((o) => `${o.title} (${o.dueDay})`).join("، ")}.` : null,
    cash.undated.length ? `التزامات من غير ميعاد معروف مش محسوبة: ${cash.undated.map((u) => u.title).join("، ")}.` : null,
    cash.incomeEstimated ? "الدخل المتوقع مش داخل في الفاضل؛ قوله لوحده «لو وصل»." : null,
  ].filter(Boolean);
  return answer({
    title: cash.untilIsPayday ? "لحد القبض" : "لحد آخر الشهر",
    facts,
    extra: {
      until: cash.until,
      due: next.map((o) => ({ what: o.title, day: o.dueDay, left: o.remaining, state: STATUS[o.status], id: o.cashflowId })),
    },
    coverage: caveats.length ? caveats.join(" ") : undefined,
  }, cash.untilIsPayday ? `لحد القبض (${cash.until})` : `لحد ${cash.until}`);
}

/** money_query plan: the plan the user agreed to, its steps, and how each measurable one is going since then. */
export async function planAnswer(ctx: ToolContext, answer: Answer): Promise<ToolRunOutcome> {
  const user = { userId: ctx.identity.userId, userType: ctx.identity.userType };
  const plan = await activePlan(user);
  if (!plan) return { response: { ok: true, plan: null, say: "مفيش خطة متفق عليها. متعملش خطة غير لو المستخدم عايز." } };
  const today = businessDateKey(ctx.now());
  const since = plan.acceptedAt ? businessDateKey(new Date(plan.acceptedAt)) : today;
  const days = Math.max(1, daysBetween(since, today) + 1);
  const finance = { userId: user.userId, userType: user.userType, salaryDay: await ctx.salaryDay() };
  const period = { period: "custom" as const, startDate: since, endDate: today };
  const facts: Fact[] = [];
  const progress: Array<Record<string, unknown>> = [];
  for (const step of plan.steps) {
    const target = step.target ?? {};
    const perDay = typeof target.amountPerDay === "number" ? target.amountPerDay : null;
    const category = typeof target.category === "string" ? target.category : null;
    if (step.kind === "spending_limit" && perDay && category) {
      const spent = await getCategoryTotal(finance, category, period);
      facts.push({ label: `المتفق عليه في اليوم: ${step.title}`, value: perDay }, { label: `الفعلي في اليوم من ساعة الاتفاق: ${category}`, value: Math.round(spent.totalExpense / days) });
      progress.push({ step: step.title, id: step.id, status: step.status, spent: spent.totalExpense, days });
    } else {
      progress.push({ step: step.title, id: step.id, status: step.status, due: step.dueDay, reminder: step.reminderStatus === "scheduled" ? step.remindAt : null });
    }
  }
  // A day with nothing recorded is not a day of no spending: said apart, never counted as keeping to the plan.
  const byDay = await getFinanceBreakdown(finance, { ...period, granularity: "day", limit: 30 });
  const recordedDays = byDay.items.filter((item) => item.count > 0).length;
  return answer({
    title: plan.title,
    facts,
    extra: {
      plan: { title: plan.title, goal: plan.goal, since, review: plan.reviewDay, agreed_on: plan.evidence.slice(0, 4) },
      steps: progress,
      days_without_records: Math.max(0, days - recordedDays),
    },
    coverage: days - recordedDays > 0
      ? `فيه ${days - recordedDays} يوم من ساعة الاتفاق مفيهمش أي مصروف متسجل: ممكن ماتسجلش، مش لازم يكون التزم. اسأل قبل ما تحكم.`
      : undefined,
  }, `من ${since}`);
}

// ─── Drafts ─────────────────────────────────────────────────────────

export const COACH_ACTIONS = [
  "plan_save", "step_done", "reminder_set", "reminder_cancel", "commitment_add", "commitment_paid", "bank_confirm", "bank_dismiss",
] as const;
export type CoachAction = (typeof COACH_ACTIONS)[number];

export type CoachDraftPayload =
  | { op: "plan_save"; plan: Parameters<typeof acceptPlan>[1] }
  | { op: "step_done"; stepId: number }
  | { op: "reminder_set"; stepId: number; at: string }
  | { op: "reminder_cancel"; stepId: number }
  | { op: "commitment_add"; cashflow: Parameters<typeof createCashflow>[1] }
  | { op: "commitment_paid"; cashflowId: number; dueDay: string; expenseId: number | null; amount: number | null }
  | { op: "bank_confirm" | "bank_dismiss"; suggestionId: number };

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const day = (value: unknown) => (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null);

/** An amount a draft may carry: one the call read or computed, or one the user said. */
function knownAmount(ctx: ToolContext, value: unknown): number | null | "unknown" {
  const amount = num(value);
  if (amount === undefined) return null;
  return amount > 0 && ctx.ledger.allows(amount, false) ? amount : "unknown";
}

type Built = { payload: CoachDraftPayload; title: string; lines: Array<{ label: string; amount?: number; detail?: string }> } | { refuse: string };

function planDraft(fields: Record<string, unknown>, ctx: ToolContext): Built {
  const title = str(fields.title, 160);
  const rawSteps = Array.isArray(fields.steps) ? fields.steps.map(record).slice(0, 6) : [];
  if (!title || !rawSteps.length) return { refuse: "الخطة محتاجة اسم وخطوة واحدة على الأقل اتفقتوا عليها." };
  const steps = [];
  for (const raw of rawSteps) {
    const stepTitle = str(raw.title, 200);
    const kind = (STEP_KINDS as readonly string[]).includes(String(raw.kind)) ? (String(raw.kind) as StepKind) : "other";
    const perDay = knownAmount(ctx, raw.amount_per_day);
    const amount = knownAmount(ctx, raw.amount);
    if (!stepTitle) return { refuse: "كل خطوة محتاجة وصف." };
    if (perDay === "unknown" || amount === "unknown") return { refuse: "فيه مبلغ في الخطة مش من الحسبة ولا من كلام المستخدم. احسبه بـ calculate أو اسأل عنه." };
    steps.push({
      title: stepTitle,
      kind,
      target: { ...(perDay ? { amountPerDay: perDay } : {}), ...(amount ? { amount } : {}), ...(str(raw.category, 60) ? { category: str(raw.category, 60) } : {}) },
      dueDay: day(raw.due_day),
    });
  }
  const evidence = (Array.isArray(fields.evidence_refs) ? fields.evidence_refs : [])
    .map((ref) => ctx.ledger.byRef(String(ref)))
    .filter((fact): fact is NonNullable<typeof fact> => Boolean(fact))
    .slice(0, 6)
    .map((fact) => ({ label: fact.label, value: fact.value }));
  return {
    payload: {
      op: "plan_save",
      plan: { title, goal: str(fields.goal, 300) ?? null, steps, reviewDay: day(fields.review_day), source: "voice", callId: ctx.identity.callId, evidence },
    },
    title: `خطة: ${title}`,
    lines: steps.map((step) => ({ label: step.title, ...(typeof step.target.amountPerDay === "number" ? { amount: step.target.amountPerDay, detail: "في اليوم" } : {}) })),
  };
}

function cashflowDraft(fields: Record<string, unknown>, ctx: ToolContext): Built {
  const title = str(fields.title, 120);
  const kind = (CASHFLOW_KINDS as readonly string[]).includes(String(fields.kind)) ? (String(fields.kind) as CashflowKind) : "other";
  const amount = knownAmount(ctx, fields.amount);
  const recurrence = ["once", "weekly", "monthly", "yearly"].includes(String(fields.recurrence)) ? String(fields.recurrence) : null;
  if (!title || !recurrence) return { refuse: "محتاج اسم الالتزام وبيتكرر إزاي (مرة، كل أسبوع، كل شهر، كل سنة)." };
  if (amount === "unknown") return { refuse: "المبلغ ده مش من كلام المستخدم. اسأله عن المبلغ." };
  const direction = fields.direction === "in" ? "in" : "out";
  const startDay = day(fields.start_day);
  return {
    payload: {
      op: "commitment_add",
      cashflow: {
        kind, direction, title, amount, recurrence: recurrence as "monthly", startDay, endDay: day(fields.end_day),
        certainty: fields.certainty === "estimated" ? "estimated" : "confirmed", source: "voice",
      },
    },
    title: direction === "in" ? `دخل جاي: ${title}` : `التزام: ${title}`,
    lines: [{
      label: title,
      ...(amount ? { amount } : {}),
      detail: `${startDay ? `من ${startDay}` : "الميعاد مش معروف"}${fields.certainty === "estimated" ? "، تقديري" : ""}`,
    }],
  };
}

/** change_draft for the coach's actions; null for any other action. */
export function coachDraft(action: string, fields: Record<string, unknown>, ctx: ToolContext): Built | null {
  const stepId = num(fields.step_id);
  switch (action) {
    case "plan_save":
      return planDraft(fields, ctx);
    case "commitment_add":
      return cashflowDraft(fields, ctx);
    case "step_done":
      return stepId ? { payload: { op: "step_done", stepId }, title: "خطوة اتعملت", lines: [{ label: str(fields.title, 200) ?? "الخطوة" }] } : { refuse: "أنهي خطوة؟ هاتها من money_query plan." };
    case "reminder_cancel":
      return stepId ? { payload: { op: "reminder_cancel", stepId }, title: "إلغاء التذكير", lines: [{ label: str(fields.title, 200) ?? "التذكير" }] } : { refuse: "أنهي تذكير؟" };
    case "reminder_set": {
      const at = str(fields.at, 25);
      if (!stepId || !at || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(at)) return { refuse: "محتاج الخطوة وميعاد التذكير (اليوم والساعة)." };
      const instant = parseBusinessInstant(at);
      if (Number.isNaN(instant.getTime()) || instant.getTime() <= ctx.now().getTime()) return { refuse: "ميعاد التذكير لازم يكون بعد دلوقتي." };
      return { payload: { op: "reminder_set", stepId, at: instant.toISOString() }, title: "تذكير جوه التطبيق", lines: [{ label: str(fields.title, 200) ?? "الخطوة", detail: at.replace("T", " الساعة ") }] };
    }
    case "bank_confirm":
    case "bank_dismiss": {
      const suggestionId = num(fields.bank_id);
      if (!suggestionId) return { refuse: "أنهي رسالة بنك؟ هاتها من money_query pending (bank_id)." };
      const amount = knownAmount(ctx, fields.amount);
      return {
        payload: { op: action, suggestionId },
        title: action === "bank_confirm" ? "تسجيل رسالة البنك" : "تجاهل رسالة البنك",
        lines: [{ label: str(fields.title, 120) ?? "رسالة البنك", ...(typeof amount === "number" ? { amount } : {}) }],
      };
    }
    case "commitment_paid": {
      const cashflowId = num(fields.cashflow_id);
      const dueDay = day(fields.due_day);
      const amount = knownAmount(ctx, fields.amount);
      if (!cashflowId || !dueDay) return { refuse: "أنهي التزام وأنهي ميعاد؟ هاتهم من money_query commitments." };
      if (amount === "unknown") return { refuse: "المبلغ ده مش من كلام المستخدم." };
      return {
        payload: { op: "commitment_paid", cashflowId, dueDay, expenseId: num(fields.expense_id) ?? null, amount },
        title: "تسديد التزام",
        lines: [{ label: str(fields.title, 120) ?? "الالتزام", ...(amount ? { amount } : {}), detail: `ميعاد ${dueDay}` }],
      };
    }
    default:
      return null;
  }
}

/** Runs a confirmed coach draft; its message is what the call says was done. */
export async function executeCoachDraft(draft: Draft, ctx: ToolContext): Promise<string> {
  const user = { userId: ctx.identity.userId, userType: ctx.identity.userType };
  const payload = draft.payload as CoachDraftPayload;
  switch (payload.op) {
    case "plan_save": {
      const saved = await acceptPlan(user, payload.plan, ctx.now());
      return saved.replaced ? "اتحفظت الخطة الجديدة مكان القديمة" : "اتحفظت الخطة";
    }
    case "step_done":
      await setStepStatus(user, payload.stepId, "done", "user", ctx.now());
      return "اتعلمت الخطوة إنها اتعملت";
    case "reminder_set":
      await setReminder(user, payload.stepId, new Date(payload.at), ctx.now());
      return "اتظبط التذكير جوه التطبيق";
    case "reminder_cancel":
      await cancelReminder(user, payload.stepId);
      return "اتلغى التذكير";
    case "commitment_add":
      await createCashflow(user, payload.cashflow);
      return `اتسجل ${payload.cashflow.direction === "in" ? "الدخل الجاي" : "الالتزام"}: ${payload.cashflow.title}`;
    case "bank_confirm":
      return (await ctx.app.confirmBankSuggestion(ctx.identity, payload.suggestionId))
        ? "اتسجلت رسالة البنك"
        : "الرسالة دي اتسجلت أو اتشالت قبل كده";
    case "bank_dismiss":
      return (await ctx.app.dismissBankSuggestion(ctx.identity, payload.suggestionId))
        ? "اتشالت رسالة البنك من غير تسجيل"
        : "الرسالة دي اتسجلت أو اتشالت قبل كده";
    case "commitment_paid": {
      const done = await settle(user, { cashflowId: payload.cashflowId, dueDay: payload.dueDay, expenseId: payload.expenseId, amount: payload.amount });
      return `اتسجل إن ${spellAmount(done.amount, { exact: true }).text} اتدفعوا للميعاد ده`;
    }
  }
}
