/**
 * What the assistant knows about the caller before the first word: who they are, where they are in their salary
 * cycle, today's and the cycle's spending, what is missing from the data, a few remembered things, and one
 * observation worth raising. It is small on purpose (the whole context is billed again on every turn), and every
 * number in it goes into the call's fact ledger so the assistant may say it.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { aiMemoryItems, expenses, localUsers, users } from "../../../../db/schema";
import { businessDateKey } from "../../../lib/app-time";
import { db } from "../../../queries/connection";
import { getFinanceSummary, getProactiveInsights, getProfileSnapshot } from "../../finance-semantic-layer";
import { getSmartProfile } from "../../user-profile-service";
import type { CallIdentity } from "../gateway/call-session";
import type { FactLedger } from "./facts";
import { honorificFor } from "./honorific";
import { lastAskedAt, nextCallQuestion, questionLine } from "./profile-questions";
import type { AdaptiveQuestion } from "../../adaptive-question-engine";
import { spellDays, spellRelativeDay } from "./spoken";
import { extractSpokenNumbers } from "./validator";

export interface CallSnapshot {
  firstName: string | null;
  title: string | null;
  text: string;
  /** The profile question the call may ask once, if any. */
  question: AdaptiveQuestion | null;
}

const WEEKDAYS = ["الأحد", "الاتنين", "التلات", "الأربع", "الخميس", "الجمعة", "السبت"];

async function capture<T>(work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch {
    return null;
  }
}

async function firstNameOf(identity: CallIdentity): Promise<string | null> {
  const table = identity.userType === "oauth" ? users : localUsers;
  const [row] = await db.select({ name: table.name }).from(table).where(eq(table.id, identity.userId)).limit(1);
  const first = String(row?.name ?? "").trim().split(/\s+/)[0];
  return first && first.length <= 30 ? first : null;
}

async function rememberedLines(identity: CallIdentity): Promise<string[]> {
  const rows = await db
    .select({ type: aiMemoryItems.memoryType, content: aiMemoryItems.content, importance: aiMemoryItems.importance })
    .from(aiMemoryItems)
    .where(and(
      eq(aiMemoryItems.userId, identity.userId),
      eq(aiMemoryItems.userType, identity.userType),
      eq(aiMemoryItems.status, "active"),
      inArray(aiMemoryItems.memoryType, ["plan", "agreement", "preference", "fact", "summary"]),
    ))
    .orderBy(desc(aiMemoryItems.updatedAt))
    .limit(20);
  // Open agreements first, then the most important facts, then the last call's summary.
  const rank = (type: string) => (type === "plan" || type === "agreement" ? 0 : type === "summary" ? 2 : 1);
  return rows
    .sort((a, b) => rank(a.type) - rank(b.type) || b.importance - a.importance)
    .slice(0, 5)
    .map((row) => String(row.content).replace(/\s+/g, " ").trim().slice(0, 140));
}

async function lastRecordedDay(identity: CallIdentity): Promise<string | null> {
  const [row] = await db
    .select({ date: expenses.date })
    .from(expenses)
    .where(and(eq(expenses.userId, identity.userId), eq(expenses.userType, identity.userType)))
    .orderBy(desc(expenses.date))
    .limit(1);
  return row?.date ? businessDateKey(new Date(row.date)) : null;
}

export async function loadCallSnapshot(identity: CallIdentity, ledger: FactLedger, now = new Date()): Promise<CallSnapshot> {
  const base = { userId: identity.userId, userType: identity.userType };
  const profileSnapshot = await capture(() => getProfileSnapshot(base));
  const ctx = { ...base, salaryDay: profileSnapshot?.salaryDay };
  const [firstName, profile, today, cycle, memory, lastDay, insights, askedAt] = await Promise.all([
    capture(() => firstNameOf(identity)),
    capture(() => getSmartProfile(identity.userId, identity.userType)),
    capture(() => getFinanceSummary(ctx, { period: "today" })),
    capture(() => getFinanceSummary(ctx, { period: "salary_cycle" })),
    capture(() => rememberedLines(identity)),
    capture(() => lastRecordedDay(identity)),
    capture(() => getProactiveInsights({ ...base, limit: 3 })),
    capture(() => lastAskedAt(identity.userId, identity.userType)),
  ]);

  const todayKey = businessDateKey(now);
  const weekday = WEEKDAYS[new Date(`${todayKey}T12:00:00Z`).getUTCDay()];
  const title = honorificFor(profile?.basicInfo?.profession as string | undefined);
  const lines: string[] = [`النهارده ${weekday} ${todayKey} بتوقيت القاهرة.`];
  if (firstName) lines.push(`اسم المستخدم: ${firstName}.${title ? ` اللقب المناسب: ${title}.` : ""}`);

  ledger.nextBatch();
  if (today) {
    const fact = ledger.add({ id: "snapshot_today", label: "مصروف النهارده", value: today.totalExpense, source: "snapshot" });
    lines.push(`مصروف النهارده المسجّل: ${fact.say} (${today.expenseCount} عملية).`);
  }
  if (cycle) {
    const fact = ledger.add({ id: "snapshot_cycle", label: "مصروف الدورة", value: cycle.totalExpense, source: "snapshot" });
    const daysLeft = Math.max(0, cycle.period.daysTotal - cycle.period.daysElapsed);
    lines.push(
      cycle.period.isSalaryCycle
        ? `المصروف من يوم المرتب (${cycle.period.salaryDay}): ${fact.say}، وفاضل ${spellDays(daysLeft)} على المرتب الجاي.`
        : `مصروف الشهر ده: ${fact.say}، وفاضل ${spellDays(daysLeft)} على آخر الشهر.`,
    );
    if (cycle.totalIncome > 0) {
      const income = ledger.add({ id: "snapshot_cycle_income", label: "دخل الدورة", value: cycle.totalIncome, source: "snapshot" });
      lines.push(`الدخل المسجّل في نفس الفترة: ${income.say}.`);
    }
  }
  if (lastDay && lastDay !== todayKey) {
    lines.push(`آخر مصروف متسجل كان ${spellRelativeDay(lastDay, todayKey)}؛ ممكن يكون فيه صرف ماتسجلش.`);
  } else if (!lastDay) {
    lines.push("لسه مفيش ولا مصروف متسجل.");
  }
  const insight = insights?.[0];
  if (insight) {
    for (const fact of insight.facts ?? []) {
      if (typeof fact.value === "number") ledger.add({ id: `insight_${fact.id}`, label: fact.label, value: fact.value, source: "snapshot" });
    }
    lines.push(`ملاحظة تستاهل تتقال لو جت مناسبة: ${insight.title}.`);
  }
  if (memory?.length) {
    lines.push("من المكالمات والمحادثات اللي فاتت:");
    for (const line of memory) {
      lines.push(`- ${line}`);
      // What the user told us before may be said back ("بتحوش خمس آلاف كل شهر"); it is theirs, not a wrong number.
      for (const number of extractSpokenNumbers(line)) ledger.noteUserValue(number.value);
    }
  }
  const question = profile ? nextCallQuestion(profile.onboardingAnswers ?? {}, askedAt ?? null, now) : null;
  if (question) {
    lines.push(`حاجة لسه التطبيق مايعرفهاش (اسألها مرة واحدة بس، لما يخلص اللي كلّمك عشانه): ${questionLine(question)}.`);
  }
  return { firstName, title, text: lines.join("\n"), question };
}
