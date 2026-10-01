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
import { slotMeta } from "../../ai-memory/slots";
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

/**
 * What the call knows about the user from earlier calls and chats, grouped the way it should be used: what they told
 * us (with the day, since it may have changed), what was left open, offers they declined (not to push again), and the
 * last call. Memories whose slot has expired (api/services/ai-memory/slots.ts) are left out. Exported for its test.
 */
export async function memoryBrief(identity: CallIdentity, now = new Date()): Promise<string[]> {
  const rows = await db
    .select({
      type: aiMemoryItems.memoryType,
      content: aiMemoryItems.content,
      importance: aiMemoryItems.importance,
      metadata: aiMemoryItems.metadata,
      updatedAt: aiMemoryItems.updatedAt,
    })
    .from(aiMemoryItems)
    .where(and(
      eq(aiMemoryItems.userId, identity.userId),
      eq(aiMemoryItems.userType, identity.userType),
      eq(aiMemoryItems.status, "active"),
      inArray(aiMemoryItems.memoryType, ["plan", "agreement", "preference", "fact", "summary", "refusal", "followup"]),
    ))
    .orderBy(desc(aiMemoryItems.updatedAt))
    .limit(60);
  const live = rows
    .map((row) => ({ ...row, meta: slotMeta(row.metadata) }))
    .filter((row) => !row.meta.validUntil || row.meta.validUntil.getTime() > now.getTime());
  const said = (row: (typeof live)[number]) => {
    const day = row.meta.day ?? (row.updatedAt ? businessDateKey(new Date(row.updatedAt)) : null);
    const [, month, date] = day ? day.split("-") : [];
    const text = String(row.content).replace(/\s+/g, " ").trim().slice(0, 140);
    return day ? `${text} (${Number(date)}/${Number(month)})` : text;
  };
  const known = live
    .filter((row) => ["plan", "agreement", "preference", "fact"].includes(row.type))
    // A slotted memory is the current value of something; then the most important.
    .sort((a, b) => Number(Boolean(b.meta.slot)) - Number(Boolean(a.meta.slot)) || b.importance - a.importance)
    .slice(0, 5);
  const open = live.filter((row) => row.type === "followup").slice(0, 2);
  const declined = live.filter((row) => row.type === "refusal").slice(0, 2);
  const last = live.find((row) => row.type === "summary");
  const lines: string[] = [];
  if (known.length) lines.push("اللي قاله قبل كده (ممكن يكون اتغير، اتأكد قبل ما تبني عليه قرار):", ...known.map((row) => `- ${said(row)}`));
  if (open.length) lines.push("مفتوح من قبل كده (افتحه لو جه في سياقه):", ...open.map((row) => `- ${said(row)}`));
  if (declined.length) lines.push("رفض قبل كده (متقترحهوش تاني إلا لو هو فتح الموضوع):", ...declined.map((row) => `- ${said(row)}`));
  if (last) lines.push(`آخر مكالمة: ${String(last.content).replace(/\s+/g, " ").trim().slice(0, 200)}`);
  return lines;
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

export async function loadCallSnapshot(
  identity: CallIdentity,
  ledger: FactLedger,
  now = new Date(),
  options: { refs?: boolean } = {},
): Promise<CallSnapshot> {
  // The coach call computes from facts by ref ("[f2]"); the standard call has no calculator and must not read refs aloud.
  const tag = (fact: { ref: string }) => (options.refs ? ` [${fact.ref}]` : "");
  const base = { userId: identity.userId, userType: identity.userType };
  const profileSnapshot = await capture(() => getProfileSnapshot(base));
  const ctx = { ...base, salaryDay: profileSnapshot?.salaryDay };
  const [firstName, profile, today, cycle, memory, lastDay, insights, askedAt] = await Promise.all([
    capture(() => firstNameOf(identity)),
    capture(() => getSmartProfile(identity.userId, identity.userType)),
    capture(() => getFinanceSummary(ctx, { period: "today" })),
    capture(() => getFinanceSummary(ctx, { period: "salary_cycle" })),
    capture(() => memoryBrief(identity, now)),
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
    lines.push(`مصروف النهارده المسجّل: ${fact.say}${tag(fact)} (${today.expenseCount} عملية).`);
  }
  if (cycle) {
    const fact = ledger.add({ id: "snapshot_cycle", label: "مصروف الدورة", value: cycle.totalExpense, source: "snapshot" });
    const daysLeft = Math.max(0, cycle.period.daysTotal - cycle.period.daysElapsed);
    const left = ledger.add({
      id: "snapshot_days_left", label: cycle.period.isSalaryCycle ? "أيام فاضلة على المرتب" : "أيام فاضلة على آخر الشهر",
      value: daysLeft, unit: "days", source: "snapshot", say: spellDays(daysLeft),
    });
    lines.push(
      cycle.period.isSalaryCycle
        ? `المصروف من يوم المرتب (${cycle.period.salaryDay}): ${fact.say}${tag(fact)}، وفاضل ${spellDays(daysLeft)}${tag(left)} على المرتب الجاي.`
        : `مصروف الشهر ده: ${fact.say}${tag(fact)}، وفاضل ${spellDays(daysLeft)}${tag(left)} على آخر الشهر.`,
    );
    if (cycle.totalIncome > 0) {
      const income = ledger.add({ id: "snapshot_cycle_income", label: "دخل الدورة", value: cycle.totalIncome, source: "snapshot" });
      lines.push(`الدخل المسجّل في نفس الفترة: ${income.say}${tag(income)}.`);
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
    for (const line of memory) {
      lines.push(line);
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
