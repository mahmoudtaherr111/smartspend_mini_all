/**
 * Reminders of commitment due dates (docs/decisions/0051-commitments-ecosystem.md), run every five minutes by the
 * `commitment-reminders` job on the scheduler replica.
 *
 * Each open date has stages: some days before it (the commitment's own setting, else the admin's default of 3), the day
 * itself, the day after, then weekly follow-ups (the admin's count, 2 by default). A stage is due once its Cairo day has
 * come and its hour has passed. A row in `commitment_reminders` is written before anything is sent, under a unique key
 * of the date, stage and channel, so a retry, a restart or a second replica sends nothing twice. Several dates of one
 * user due at once become one notification. A date paid or skipped before its stage is never reminded.
 *
 * Channels: the in-app bell and push for every plan with `commitment_reminders`; WhatsApp only when the admin turned it
 * on with an approved template, the plan has `commitment_whatsapp`, the hour is inside the admin's window, the user's
 * daily cap is not reached, and the user agreed to WhatsApp reminders (the outbox checks that consent).
 * Notifications carry the commitment's name and amount, never a person's phone number.
 */
import Decimal from "decimal.js";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { cashflowSettlements, commitmentReminders, expenses, inAppNotifications, localUsers, scheduledCashflows, users } from "../../../db/schema";
import { notificationType } from "../../../contracts/notification-types";
import { isPlanFeatureEnabled } from "../../../contracts/plan-features";
import { businessTimeLabel } from "../../lib/app-time";
import { createLogger } from "../../lib/log";
import { getSystemSettings } from "../../lib/settings-cache";
import { db } from "../../queries/connection";
import { loadCommitments, matchSavedExpenses, type CommitmentRow } from "./commitments";
import { addDays, occurrences, type Occurrence } from "./schedule";

const log = createLogger("commitment-reminders");

export type ReminderStage = "before" | "due" | "after" | "week1" | "week2";

/** The day each stage of a date falls on; `before` only when reminding some days ahead. */
export function stageDays(dueDay: string, daysBefore: number, followups: number): Array<{ stage: ReminderStage; day: string }> {
  const out: Array<{ stage: ReminderStage; day: string }> = [];
  if (daysBefore > 0) out.push({ stage: "before", day: addDays(dueDay, -daysBefore) });
  out.push({ stage: "due", day: dueDay }, { stage: "after", day: addDays(dueDay, 1) });
  if (followups >= 1) out.push({ stage: "week1", day: addDays(dueDay, 8) });
  if (followups >= 2) out.push({ stage: "week2", day: addDays(dueDay, 15) });
  return out;
}

export interface DueReminder {
  occurrence: Occurrence;
  row: CommitmentRow;
  stage: ReminderStage;
}

/** The stages due now for one user's commitments: pure, so the rules are tested without a database. */
export function remindersDue(
  rows: CommitmentRow[],
  list: Occurrence[],
  now: { day: string; hour: number },
  defaults: { daysBefore: number; hour: number; followups: number },
): DueReminder[] {
  const out: DueReminder[] = [];
  for (const occurrence of list) {
    if (occurrence.undated || !["due", "overdue", "partial"].includes(occurrence.status)) continue;
    const row = rows.find((item) => item.id === occurrence.cashflowId);
    if (!row || row.status !== "active" || !row.remindersEnabled) continue;
    const hour = row.remindHour ?? defaults.hour;
    if (now.hour < hour) continue;
    const day = occurrence.effectiveDay ?? occurrence.dueDay;
    for (const stage of stageDays(day, row.remindDaysBefore ?? defaults.daysBefore, defaults.followups)) {
      if (stage.day === now.day) out.push({ occurrence, row, stage: stage.stage });
    }
  }
  return out;
}

const money = (value: number | null) => (value == null ? "" : `${new Decimal(value).toDecimalPlaces(2).toNumber().toLocaleString("en-US")} ج.م`);

/** The words of one notification for one or several dates due at once. */
export function reminderText(items: DueReminder[]): { title: string; body: string } {
  if (items.length > 1) {
    const total = items.reduce((sum, item) => sum.plus(item.occurrence.remaining ?? 0), new Decimal(0)).toNumber();
    const today = items.every((item) => item.stage === "due");
    return {
      title: today ? `عليك ${items.length} حاجات النهارده` : `عندك ${items.length} مواعيد دفع`,
      body: `${items.map((item) => item.row.title).slice(0, 3).join("، ")}${total ? ` · ${money(total)}` : ""}`,
    };
  }
  const [{ occurrence, row, stage }] = items;
  const amount = money(occurrence.remaining);
  const income = row.direction === "in";
  switch (stage) {
    case "before":
      return { title: `${row.title} قرّب`, body: `${amount ? `${amount} ` : ""}${income ? "المفروض توصل" : "ميعادها"} يوم ${occurrence.effectiveDay ?? occurrence.dueDay}.` };
    case "due":
      return { title: income ? `${row.title} النهارده` : `ميعاد ${row.title} النهارده`, body: income ? `${amount} المفروض توصل النهارده.` : `${amount} · لو دفعته دوس «دفعته».` };
    default:
      return { title: `${row.title} لسه مفتوح`, body: `${amount ? `${amount} ` : ""}من يوم ${occurrence.effectiveDay ?? occurrence.dueDay}. لو اتدفع سجّله، ولو اتأجل غيّر ميعاده.` };
  }
}

async function plansOf(owners: Array<{ userId: number; userType: string }>) {
  const local = owners.filter((owner) => owner.userType === "local").map((owner) => owner.userId);
  const oauth = owners.filter((owner) => owner.userType !== "local").map((owner) => owner.userId);
  const [a, b] = await Promise.all([
    local.length ? db.select({ id: localUsers.id, plan: localUsers.plan }).from(localUsers).where(inArray(localUsers.id, local)) : Promise.resolve([]),
    oauth.length ? db.select({ id: users.id, plan: users.plan }).from(users).where(inArray(users.id, oauth)) : Promise.resolve([]),
  ]);
  const plans = new Map<string, string>();
  for (const row of a) plans.set(`local:${row.id}`, row.plan);
  for (const row of b) plans.set(`oauth:${row.id}`, row.plan);
  return (owner: { userId: number; userType: string }) => plans.get(`${owner.userType === "local" ? "local" : "oauth"}:${owner.userId}`) ?? "free";
}

/** Claims a stage for a channel; false when it was sent before. */
async function claim(owner: { userId: number; userType: string }, item: DueReminder, channel: "push" | "whatsapp"): Promise<boolean> {
  // INSERT IGNORE: a stage sent before hits the unique key and inserts nothing (0 rows), whatever the driver's flags.
  const [result] = await db.insert(commitmentReminders).ignore().values({
    userId: owner.userId, userType: owner.userType, cashflowId: item.row.id, dueDay: item.occurrence.dueDay, stage: item.stage, channel,
  });
  return Number((result as { affectedRows?: number }).affectedRows ?? 0) === 1;
}

export async function deliverCommitmentReminders(now = new Date()): Promise<{ sent: number; whatsapp: number }> {
  const settings = await getSystemSettings().catch(() => ({} as Record<string, string>));
  const number = (key: string, fallback: number) => {
    const value = Number.parseInt(settings[key] ?? "", 10);
    return Number.isFinite(value) ? value : fallback;
  };
  const defaults = { daysBefore: number("commitments_remind_days_default", 3), hour: number("commitments_remind_hour_default", 10), followups: number("commitments_overdue_followups", 2) };
  const [today, clock] = businessTimeLabel(now).split(" ");
  const hour = Number(clock.slice(0, 2));
  const [fromHour, toHour] = (settings.commitments_whatsapp_hours ?? "9-21").split("-").map((part) => Number.parseInt(part, 10));
  const whatsappOn = settings.commitments_whatsapp_enabled === "true" && !!settings.commitments_whatsapp_template && hour >= (fromHour || 0) && hour < (toHour || 24);
  const owners = await db.selectDistinct({ userId: scheduledCashflows.userId, userType: scheduledCashflows.userType }).from(scheduledCashflows)
    .where(and(eq(scheduledCashflows.status, "active"), eq(scheduledCashflows.remindersEnabled, true))).limit(5000);
  const planOf = await plansOf(owners);
  let sent = 0;
  let whatsapp = 0;
  for (const owner of owners) {
    try {
      const plan = planOf(owner);
      if (!isPlanFeatureEnabled(settings, plan, "commitment_reminders")) continue;
      const rows = (await loadCommitments(owner)).filter((row) => row.status === "active" && row.remindersEnabled);
      if (!rows.length) continue;
      const settled = await db.select().from(cashflowSettlements).where(and(
        eq(cashflowSettlements.userId, owner.userId), eq(cashflowSettlements.userType, owner.userType), inArray(cashflowSettlements.cashflowId, rows.map((row) => row.id)),
      ));
      const list = occurrences(rows, settled, addDays(today, -20), addDays(today, 31), today);
      const due = remindersDue(rows, list, { day: today, hour }, defaults);
      const claimed: DueReminder[] = [];
      for (const item of due) if (await claim(owner, item, "push")) claimed.push(item);
      if (!claimed.length) continue;
      const text = reminderText(claimed);
      const type = "commitment_due";
      await db.insert(inAppNotifications).values({ userId: owner.userId, userType: owner.userType, title: text.title, body: text.body, actionUrl: notificationType(type).destination });
      const { sendPushToUser } = await import("../../notification-engine");
      await sendPushToUser(owner.userId, owner.userType, { title: text.title, body: text.body, actionUrl: notificationType(type).destination, type });
      sent += 1;
      if (whatsappOn && isPlanFeatureEnabled(settings, plan, "commitment_whatsapp")) {
        const cap = number("commitments_whatsapp_daily_cap", 3);
        const [{ count }] = await db.select({ count: sql<number>`COUNT(*)` }).from(commitmentReminders).where(and(
          eq(commitmentReminders.userId, owner.userId), eq(commitmentReminders.userType, owner.userType),
          eq(commitmentReminders.channel, "whatsapp"), gte(commitmentReminders.sentAt, new Date(now.getTime() - 24 * 3_600_000)),
        ));
        if (Number(count) >= cap) continue;
        const fresh: DueReminder[] = [];
        for (const item of claimed) if (await claim(owner, item, "whatsapp")) fresh.push(item);
        if (!fresh.length) continue;
        const words = reminderText(fresh);
        const { enqueueMessage } = await import("../../lib/whatsapp/outbox");
        const outcome = await enqueueMessage({
          owner: { userId: owner.userId, userType: owner.userType === "local" ? "local" : "oauth" },
          purpose: "reminder",
          message: { name: settings.commitments_whatsapp_template!, language: settings.commitments_whatsapp_template_lang || "ar", body: [words.title, words.body] },
        });
        if (outcome.enqueued) whatsapp += 1;
      }
    } catch (err) {
      log.warn({ err, event: "commitment_reminders.user_failed", userId: owner.userId }, "Commitment reminders failed for a user");
    }
  }
  return { sent, whatsapp };
}

/**
 * Payments recorded from bank and wallet messages in the last minutes, matched to commitments by the same strict
 * rules as typed ones (`commitment-match-sweep`). Already linked rows are skipped; a question is asked once.
 */
export async function sweepCapturedPayments(now = new Date(), windowMinutes = 20): Promise<{ checked: number }> {
  const settings = await getSystemSettings().catch(() => ({} as Record<string, string>));
  const since = new Date(now.getTime() - windowMinutes * 60_000);
  const rows = await db.select({ id: expenses.id, userId: expenses.userId, userType: expenses.userType }).from(expenses)
    .where(and(eq(expenses.source, "sms"), gte(expenses.createdAt, since))).limit(2000);
  if (!rows.length) return { checked: 0 };
  const byOwner = new Map<string, { userId: number; userType: string; ids: number[] }>();
  for (const row of rows) {
    const key = `${row.userType}:${row.userId}`;
    const entry = byOwner.get(key) ?? { userId: row.userId, userType: row.userType, ids: [] };
    entry.ids.push(row.id);
    byOwner.set(key, entry);
  }
  const owners = [...byOwner.values()];
  const planOf = await plansOf(owners);
  for (const owner of owners) {
    if (!isPlanFeatureEnabled(settings, planOf(owner), "commitment_capture_link")) continue;
    await matchSavedExpenses({ userId: owner.userId, userType: owner.userType }, owner.ids);
  }
  return { checked: rows.length };
}
