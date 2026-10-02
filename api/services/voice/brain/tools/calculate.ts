/**
 * calculate: every sum the coach call says is worked out here, in code, never by a model. The model names its
 * inputs — facts a tool already answered ("f12"), an earlier step, or a number the user said — and the operations;
 * this tool does the arithmetic in Decimal with units, refuses a number nobody gave, and hands back each result as a
 * fact the call may say, with how it was made.
 *
 * Units keep the meaning: pounds add to pounds; pounds times a count of days or months is pounds; pounds divided by
 * days is pounds a day; pounds times pounds is refused. A result built on a figure that went out of date during the
 * call is out of date too, and says so.
 */
import Decimal from "decimal.js";
import type { VoiceFactCard } from "../../../../../contracts/voice-protocol";
import type { ToolRunOutcome } from "../../gateway/call-session";
import { isRecordedMoneyFact, type CallFact, type FactUnit } from "../facts";
import { spellAmount } from "../spoken";
import { str, type ToolContext, type VoiceTool } from "./types";

export const CALC_OPS = ["add", "sub", "mul", "div", "sum", "min", "max", "pct", "round"] as const;
type Op = (typeof CALC_OPS)[number];

const MAX_STEPS = 8;
const LITERAL_UNITS: ReadonlyArray<FactUnit> = ["EGP", "days", "months", "count", "percent"];
/** How large a counted literal may be: a year and a bit of days, fifty years of months, a thousand of anything. */
const LITERAL_LIMITS: Partial<Record<FactUnit, number>> = { days: 400, months: 600, count: 1000, percent: 100 };

interface Operand {
  value: Decimal;
  unit: FactUnit;
  /** The fact or step it came from, for the explanation. */
  from: string;
  stale: boolean;
  recordBacked: boolean;
}

export class CalcError extends Error {
  constructor(readonly code: string, readonly say: string) {
    super(code);
  }
}

const isMoney = (unit: FactUnit) => unit === "EGP" || unit === "EGP/day" || unit === "EGP/month";

/** The unit of `op` over operands of these units, or an error when the combination means nothing. */
export function resultUnit(op: Op, units: FactUnit[]): FactUnit {
  const [a, b] = units;
  switch (op) {
    case "add":
    case "sub":
    case "sum":
    case "min":
    case "max":
      if (units.some((unit) => unit !== a)) {
        throw new CalcError("unit_mismatch", `مينفعش تجمع أو تطرح ${a} مع ${units.find((u) => u !== a)}.`);
      }
      return a;
    case "round":
      return a;
    case "pct":
      if (a !== b) throw new CalcError("unit_mismatch", "النسبة بتبقى بين حاجتين من نفس النوع.");
      return "percent";
    case "mul": {
      const money = units.filter(isMoney);
      if (money.length > 1) throw new CalcError("unit_mismatch", "مينفعش تضرب فلوس في فلوس.");
      if (money.length === 0) return units.includes("percent") ? units.find((u) => u !== "percent") ?? "count" : a;
      const other = units.find((unit) => !isMoney(unit)) ?? "count";
      const m = money[0];
      if (m === "EGP/day" && other === "days") return "EGP";
      if (m === "EGP/month" && other === "months") return "EGP";
      if (m === "EGP/day" && other === "months") throw new CalcError("unit_mismatch", "مبلغ اليوم يتضرب في أيام، مش شهور.");
      if (m === "EGP/month" && other === "days") throw new CalcError("unit_mismatch", "مبلغ الشهر يتضرب في شهور، مش أيام.");
      return m;
    }
    case "div":
      if (a === "EGP" && b === "days") return "EGP/day";
      if (a === "EGP" && b === "months") return "EGP/month";
      if (isMoney(a) && (b === "count" || b === "percent")) return a;
      if (a === "EGP" && b === "EGP/day") return "days";
      if (a === "EGP" && b === "EGP/month") return "months";
      if (a === b) return "ratio";
      if (!isMoney(a) && !isMoney(b)) return "ratio";
      throw new CalcError("unit_mismatch", `مينفعش تقسم ${a} على ${b}.`);
  }
}

function apply(op: Op, values: Decimal[], units: FactUnit[]): Decimal {
  const [a, b] = values;
  switch (op) {
    case "add":
    case "sum":
      return values.reduce((total, value) => total.plus(value), new Decimal(0));
    case "sub":
      return values.slice(1).reduce((total, value) => total.minus(value), a);
    case "min":
      return Decimal.min(...values);
    case "max":
      return Decimal.max(...values);
    case "round":
      return a.toDecimalPlaces(b ? b.toNumber() : 0, Decimal.ROUND_HALF_UP);
    case "pct":
      if (b.isZero()) throw new CalcError("divide_by_zero", "مينفعش نسبة من صفر.");
      return a.div(b).times(100);
    case "mul": {
      // A percent multiplies as its fraction: 20% of 5,000 is 1,000.
      return values.reduce((total, value, index) => total.times(units[index] === "percent" ? value.div(100) : value), new Decimal(1));
    }
    case "div":
      if (b.isZero()) throw new CalcError("divide_by_zero", "القسمة على صفر: الرقم التاني صفر.");
      return units[1] === "percent" ? a.div(b.div(100)) : a.div(b);
  }
}

const LITERAL = /^(-?\d+(?:\.\d+)?)\s*(EGP|days|months|count|percent)?$/i;
const UNIT_NAMES: Record<string, FactUnit> = { egp: "EGP", days: "days", months: "months", count: "count", percent: "percent" };

/** One operand: a fact the call holds, an earlier step, or a number with its unit. */
function operand(raw: unknown, steps: Map<string, Operand>, ctx: ToolContext): Operand {
  const text = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  if (!text) throw new CalcError("bad_operand", "فيه رقم فاضي في الحسبة.");
  const step = steps.get(text);
  if (step) return step;
  if (/^f\d+$/.test(text)) {
    const fact: CallFact | undefined = ctx.ledger.byRef(text);
    if (!fact) throw new CalcError("unknown_fact", `مفيش حقيقة اسمها ${text} في المكالمة. هات الرقم بـ money_query الأول.`);
    return { value: new Decimal(fact.value), unit: fact.unit, from: `${fact.label} (${fact.ref})`, stale: Boolean(fact.stale),
      recordBacked: !isMoney(fact.unit) || isRecordedMoneyFact(fact) };
  }
  const literal = text.match(LITERAL);
  if (!literal) throw new CalcError("bad_operand", `«${text}» مش رقم ولا اسم خطوة ولا حقيقة.`);
  const value = new Decimal(literal[1]);
  const given = literal[2] ? UNIT_NAMES[literal[2].toLowerCase()] : undefined;
  // A bare small whole number is a count ("2" people, "3" payments); anything else bare is money.
  const unit: FactUnit = given ?? (value.abs().lte(31) && value.isInteger() ? "count" : "EGP");
  if (!LITERAL_UNITS.includes(unit)) throw new CalcError("bad_operand", `وحدة غير معروفة: ${literal[2]}.`);
  if (unit === "EGP") {
    // An amount of money enters a sum only from the records (a fact the call read or computed, typed as a number) or
    // from the user's own words; any other amount is refused.
    if (ctx.ledger.heardFromUser(value.toNumber())) return { value, unit, from: "من كلام المستخدم", stale: false, recordBacked: false };
    const fact = ctx.ledger.all().find((known) => known.unit === "EGP" && Math.abs(known.value - value.toNumber()) < 0.005);
    if (fact) return { value, unit, from: `${fact.label} (${fact.ref})`, stale: Boolean(fact.stale), recordBacked: isRecordedMoneyFact(fact) };
    throw new CalcError(
      "unknown_amount",
      `مبلغ ${value.toString()} مش من كلام المستخدم ولا من أي رقم قريته. استخدم ref الحقيقة (زي f12) من نتيجة الأداة، أو اسأل المستخدم عنه.`,
    );
  }
  const limit = LITERAL_LIMITS[unit];
  if (limit !== undefined && value.abs().gt(limit)) throw new CalcError("bad_operand", `${value.toString()} ${unit} رقم كبير أوي.`);
  return { value, unit, from: `${value.toString()} ${unit}`, stale: false, recordBacked: !isMoney(unit) };
}

interface StepInput {
  name?: unknown;
  op?: unknown;
  of?: unknown;
  label?: unknown;
}

function say(value: number, unit: FactUnit): string {
  if (isMoney(unit)) {
    // A computed figure is said as computed; the assistant may round it aloud ("حوالي"), which the number check allows.
    const amount = spellAmount(Math.abs(value), { exact: true }).text;
    const per = unit === "EGP/day" ? " في اليوم" : unit === "EGP/month" ? " في الشهر" : "";
    return `${value < 0 ? "سالب " : ""}${amount}${per}`;
  }
  if (unit === "percent") return `${Math.round(value)}%`;
  if (unit === "days") return `${Math.round(value * 10) / 10} يوم`;
  if (unit === "months") return `${Math.round(value * 10) / 10} شهر`;
  return String(Math.round(value * 100) / 100);
}

export function runCalculation(stepsInput: unknown, ctx: ToolContext): {
  results: Array<{ name: string; ref: string; label: string; value: number; unit: FactUnit; say: string; how: string; stale: boolean }>;
} {
  if (!Array.isArray(stepsInput) || stepsInput.length === 0) throw new CalcError("no_steps", "ابعت الخطوات: كل خطوة ليها اسم وعملية وأرقام.");
  if (stepsInput.length > MAX_STEPS) throw new CalcError("too_many_steps", `أقصى حاجة ${MAX_STEPS} خطوات في المرة.`);
  const steps = new Map<string, Operand>();
  const out: Array<{ name: string; label: string; value: Decimal; unit: FactUnit; how: string; stale: boolean; recordBacked: boolean }> = [];
  for (const [index, raw] of (stepsInput as StepInput[]).entries()) {
    const name = str(raw?.name, 30) ?? `s${index + 1}`;
    if (!/^[a-z_][a-z0-9_]*$/i.test(name) || /^f\d+$/.test(name)) throw new CalcError("bad_name", `اسم الخطوة «${name}» مش مسموح.`);
    if (steps.has(name)) throw new CalcError("bad_name", `الاسم «${name}» اتكرر.`);
    const op = String(raw?.op ?? "") as Op;
    if (!CALC_OPS.includes(op)) throw new CalcError("bad_op", `العملية «${op}» مش معروفة.`);
    const operands = (Array.isArray(raw?.of) ? raw.of : []).map((item: unknown) => operand(item, steps, ctx));
    const arity = op === "round" ? [1, 2] : op === "div" || op === "pct" ? [2, 2] : [2, 12];
    if (operands.length < arity[0] || operands.length > arity[1]) {
      throw new CalcError("bad_arity", `الخطوة «${name}» محتاجة ${arity[0]}${arity[1] > arity[0] ? " أو أكتر" : ""} أرقام.`);
    }
    const units = op === "round" ? [operands[0].unit] : operands.map((item) => item.unit);
    const unit = resultUnit(op, units);
    const value = apply(op, operands.map((item) => item.value), operands.map((item) => item.unit));
    const stale = operands.some((item) => item.stale);
    const recordBacked = operands.every((item) => item.recordBacked);
    const label = str(raw?.label, 80) ?? name;
    const how = `${op}(${operands.map((item) => item.from).join("، ")})`;
    steps.set(name, { value, unit, from: `${label} (${name})`, stale, recordBacked });
    out.push({ name, label, value, unit, how, stale, recordBacked });
  }
  ctx.ledger.nextBatch();
  return {
    results: out.map((step) => {
      const value = step.value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
      const fact = ctx.ledger.add({
        id: `calc_${step.name}`,
        label: step.label,
        value,
        unit: step.unit,
        source: "computed",
        say: say(value, step.unit),
        stale: step.stale,
        recordBacked: step.recordBacked,
      });
      return { name: step.name, ref: fact.ref, label: step.label, value, unit: step.unit, say: fact.say, how: step.how, stale: step.stale };
    }),
  };
}

async function run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolRunOutcome> {
  try {
    const { results } = runCalculation(args.steps, ctx);
    const stale = results.some((result) => result.stale);
    const card: VoiceFactCard = {
      kind: "fact",
      id: `calc_${results[results.length - 1].ref}`,
      title: str(args.title, 80) ?? "الحسبة",
      items: results.filter((result) => isMoney(result.unit)).slice(-6).map((result) => ({ label: result.label, value: result.value, unit: "EGP" })),
      ...(stale ? { coverage: "فيها رقم اتقرا قبل ما السجل يتغير في المكالمة." } : {}),
    };
    return {
      response: {
        ok: true,
        results: results.map(({ name, ref, label, value, unit, say: spoken, stale: old }) => ({ name, ref, label, value, unit, say: spoken, ...(old ? { stale: true } : {}) })),
        ...(stale ? { note: "في رقم من دول اتقرا قبل ما السجل يتغير؛ هات الرقم تاني بـ money_query قبل ما تعتمد عليه." } : {}),
      },
      ...(card.items.length ? { card } : {}),
    };
  } catch (error) {
    if (error instanceof CalcError) return { response: { ok: false, error: error.code, say: error.say } };
    throw error;
  }
}

export const calculateTool: VoiceTool = {
  declaration: {
    name: "calculate",
    description:
      "Do any arithmetic on the user's money (what is left, per day, months to a goal, a what-if), in steps. Each step: " +
      "a name, an op (add, sub, mul, div, sum, min, max, pct, round) and its inputs in `of`: a fact ref from a tool " +
      "answer (\"f12\"), an earlier step's name, or a number with its unit (\"12 months\", \"30 days\", \"2 count\", " +
      "\"20 percent\"; an amount \"1500 EGP\" only if the user said it). Say the results' say forms.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "What the sum answers, in Arabic, for the screen" },
        steps: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              op: { type: "string", enum: [...CALC_OPS] },
              of: { type: "array", items: { type: "string" } },
              label: { type: "string", description: "Arabic label of the result" },
            },
            required: ["name", "op", "of"],
          },
        },
      },
      required: ["steps"],
    },
  },
  run,
};
