/**
 * think: the heavy questions ("أقدر أشتري…؟", a plan, a what-if) go to a text model with the user's real numbers,
 * outside the live call, while the live model says a short line of its own. The text model may only use numbers
 * from the data and from what the user said, or ones computed from two of them; any other number it returns is
 * dropped before the live model can say it.
 */
import { executeAiGateway } from "../../../../lib/ai-gateway";
import {
  getFinanceBreakdown,
  getFinanceSummary,
  getGoalProgress,
  getWalletSummary,
} from "../../../finance-semantic-layer/resolvers";
import type { ToolRunOutcome } from "../../gateway/call-session";
import { spellAmount } from "../spoken";
import { extractSpokenNumbers } from "../validator";
import { str, type ToolContext, type VoiceTool } from "./types";

interface DataPoint {
  label: string;
  value: number;
}

const SYSTEM = `You help a voice assistant answer one money question for a user in Egypt.
Use ONLY numbers from DATA and USER_SAID, or results of adding, subtracting, multiplying or dividing two of them.
Think it through, then answer with JSON only:
{"verdict": "one plain opinion in Egyptian Arabic, no numbers",
 "reasons": ["at most two short reasons in Egyptian Arabic, each with its number in digits"],
 "numbers": [{"label": "Egyptian Arabic label", "value": 0}],
 "alternative": "one alternative in Egyptian Arabic, or null",
 "missing": "the single fact that would change the answer, in Egyptian Arabic, or null"}
If a number the answer depends on is unknown (for a purchase: how much money they have now, or what is still due before
payday), put it in "missing" and keep the verdict conditional. Never invent a balance, a price or an income.
No disclaimers, no investment advice about markets; opinions only about the user's own spending choices.`;

/** Every number the text model is allowed to state: the data, what the user said, and one step of arithmetic on them. */
export function derivable(values: number[]): (candidate: number) => boolean {
  const known = [...new Set(values.filter((v) => Number.isFinite(v) && v !== 0).map((v) => Math.abs(v)))].slice(0, 60);
  const results = new Set<number>(known.map((v) => Math.round(v)));
  for (const a of known) {
    for (const b of known) {
      results.add(Math.round(a + b));
      results.add(Math.round(Math.abs(a - b)));
      results.add(Math.round(a * b));
      if (b !== 0) results.add(Math.round(a / b));
    }
  }
  // Within a pound, for rounding a division; any wider and a made-up number near a real one would pass.
  return (candidate: number) => {
    const target = Math.round(Math.abs(candidate));
    return results.has(target) || results.has(target - 1) || results.has(target + 1);
  };
}

async function gather(ctx: ToolContext): Promise<DataPoint[]> {
  const finance = { userId: ctx.identity.userId, userType: ctx.identity.userType, salaryDay: await ctx.salaryDay() };
  const [cycle, breakdown, wallets, goals, budgets] = await Promise.all([
    getFinanceSummary(finance, { period: "salary_cycle" }).catch(() => null),
    getFinanceBreakdown(finance, { period: "salary_cycle", granularity: "category", limit: 6 }).catch(() => null),
    getWalletSummary(finance).catch(() => null),
    getGoalProgress(finance).catch(() => null),
    ctx.app.listBudgets(ctx.identity).catch(() => []),
  ]);
  const data: DataPoint[] = [];
  if (cycle) {
    data.push(
      { label: "مصروف الدورة لحد النهارده", value: cycle.totalExpense },
      { label: "دخل الدورة المسجّل", value: cycle.totalIncome },
      { label: "أيام فاتت من الدورة", value: cycle.period.daysElapsed },
      { label: "أيام فاضلة على المرتب", value: Math.max(0, cycle.period.daysTotal - cycle.period.daysElapsed) },
      { label: "متوسط المصروف في اليوم", value: Math.round(cycle.dailyAverageExpense) },
    );
  }
  for (const item of breakdown?.items ?? []) data.push({ label: `مصروف ${item.name} في الدورة`, value: item.amount });
  if (wallets && wallets.walletCount > 0) data.push({ label: "إجمالي أرصدة المحافظ المسجّلة (ممكن تكون قديمة)", value: wallets.totalBalance });
  for (const goal of goals?.goals.filter((g) => g.status === "active").slice(0, 3) ?? []) {
    data.push({ label: `هدف ${goal.title}`, value: goal.targetAmount });
  }
  for (const budget of budgets.slice(0, 4)) {
    data.push({ label: `ميزانية ${budget.title}`, value: budget.limit }, { label: `المصروف من ميزانية ${budget.title}`, value: budget.spent });
  }
  for (const fact of ctx.ledger.all().slice(-12)) data.push({ label: fact.label, value: fact.value });
  return data.filter((point) => Number.isFinite(point.value));
}

function parseJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolRunOutcome> {
  const question = str(args.question, 400);
  if (!question) return { response: { ok: false, error: "missing_question" } };
  const data = await gather(ctx);
  const userSaid = extractSpokenNumbers(ctx.drafts.wordsSince(ctx.now().getTime() - 5 * 60_000)).map((n) => n.value);
  const result = await executeAiGateway({
    user: { id: ctx.identity.userId, type: ctx.identity.userType, plan: ctx.identity.plan },
    purpose: "report",
    channel: "voice",
    systemPrompt: SYSTEM,
    messages: [{
      role: "user",
      content: `QUESTION: ${question}\nDATA:\n${data.map((p) => `- ${p.label}: ${p.value}`).join("\n")}\nUSER_SAID: ${userSaid.join(", ") || "none"}`,
    }],
    responseFormat: { type: "json_object" },
    maxTokens: 700,
    temperature: 0.2,
  });
  const answer = parseJson(result.text);
  if (!answer) return { response: { ok: false, error: "no_answer", say: "قول إنك محتاج تبص عليها تاني، واسأل سؤال يوضح المطلوب." } };

  const allowed = derivable([...data.map((p) => p.value), ...userSaid]);
  ctx.ledger.nextBatch();
  const numbers = (Array.isArray(answer.numbers) ? answer.numbers : [])
    .map((entry) => entry as { label?: unknown; value?: unknown })
    .filter((entry) => typeof entry.value === "number" && allowed(entry.value as number))
    .slice(0, 4)
    .map((entry, index) => {
      const fact = ctx.ledger.add({ id: `think_${index}`, label: String(entry.label ?? "رقم"), value: entry.value as number, source: "computed" });
      return { label: fact.label, say: fact.say };
    });
  // A reason may only carry numbers that survived the check.
  const reasons = (Array.isArray(answer.reasons) ? answer.reasons : [])
    .map((reason) => String(reason))
    .filter((reason) => extractSpokenNumbers(reason).every((n) => !n.money || allowed(n.value)))
    .slice(0, 2)
    .map((reason) => reason.replace(/\d+(?:\.\d+)?/g, (digits) => spellAmount(Number(digits)).text));

  return {
    response: {
      ok: true,
      verdict: typeof answer.verdict === "string" ? answer.verdict : null,
      reasons,
      numbers,
      alternative: typeof answer.alternative === "string" ? answer.alternative : null,
      missing: typeof answer.missing === "string" ? answer.missing : null,
      say: "لو فيه missing اسأل عنه الأول. غير كده قول رأيك بكلامك: الحكم وسبب واحد والبديل، من غير تحفظات في الآخر.",
    },
  };
}

export const thinkTool: VoiceTool = {
  declaration: {
    name: "think",
    description:
      "Work out a hard money question (can I afford X, a plan until payday, a what-if) from the user's real numbers. " +
      "Say a short line of your own first; it takes a few seconds.",
    parameters: { type: "object", properties: { question: { type: "string", description: "The question with every detail the user gave" } }, required: ["question"] },
  },
  run,
};
