/**
 * Coaching plans the user agreed to, their steps, and the in-app reminders the user asked for separately.
 *
 * - A plan becomes `active` only by the user's acceptance (a confirmed draft in a call, a tap in the app); a newer
 *   accepted plan replaces the active one, which ends as `replaced`.
 * - A step is done by the user's word (`user`) or by what the records show (`ledger`); never inferred from a balance.
 * - A reminder is its own consent: scheduling, moving or cancelling it raises the step's reminder revision, and the
 *   job delivers one notification per (step, revision), in the same transaction that marks it sent. The notification
 *   says a step is due, never an amount.
 */
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { coachingPlans, coachingSteps, inAppNotifications } from "../../../db/schema";
import { businessDateKey } from "../../lib/app-time";
import { db } from "../../queries/connection";
import type { CoachUser } from "./cashflows";

export const STEP_KINDS = ["spending_limit", "save", "pay", "record", "review", "other"] as const;
export type StepKind = (typeof STEP_KINDS)[number];

export interface StepInput {
  title: string;
  kind: StepKind;
  target?: Record<string, unknown> | null;
  dueDay?: string | null;
}

export interface PlanInput {
  title: string;
  goal?: string | null;
  steps: StepInput[];
  reviewDay?: string | null;
  source: "voice" | "chat" | "app";
  callId?: string | null;
  /** The figures the plan rests on, as the user heard them: small, labelled, with their period. */
  evidence?: Array<{ label: string; value: number; period?: string }>;
}

export interface PlanView {
  id: number;
  title: string;
  goal: string | null;
  status: string;
  revision: number;
  reviewDay: string | null;
  acceptedAt: string | null;
  evidence: Array<{ label: string; value: number; period?: string }>;
  steps: Array<{
    id: number;
    title: string;
    kind: string;
    target: Record<string, unknown> | null;
    status: string;
    dueDay: string | null;
    doneAt: string | null;
    doneEvidence: string | null;
    remindAt: string | null;
    reminderStatus: string;
  }>;
}

const planScope = (user: CoachUser) => and(eq(coachingPlans.userId, user.userId), eq(coachingPlans.userType, user.userType));
const stepScope = (user: CoachUser) => and(eq(coachingSteps.userId, user.userId), eq(coachingSteps.userType, user.userType));

const iso = (value: Date | null) => (value ? value.toISOString() : null);

/**
 * Saves a plan the user accepted, with its steps, as the active one; the plan it replaces ends. One transaction:
 * the user never has two active plans, nor a plan without its steps.
 */
export async function acceptPlan(user: CoachUser, input: PlanInput, now = new Date()): Promise<{ id: number; replaced: number | null }> {
  if (!input.steps.length) throw new TRPCError({ code: "BAD_REQUEST", message: "الخطة محتاجة خطوة واحدة على الأقل." });
  return db.transaction(async (tx) => {
    const [current] = await tx.select({ id: coachingPlans.id }).from(coachingPlans)
      .where(and(planScope(user), eq(coachingPlans.status, "active"))).limit(1).for("update");
    if (current) {
      await tx.update(coachingPlans).set({ status: "replaced", endedAt: now }).where(eq(coachingPlans.id, current.id));
      await tx.update(coachingSteps).set({ reminderStatus: "cancelled" })
        .where(and(eq(coachingSteps.planId, current.id), eq(coachingSteps.reminderStatus, "scheduled")));
    }
    const [inserted] = await tx.insert(coachingPlans).values({
      userId: user.userId,
      userType: user.userType,
      title: input.title,
      goal: input.goal ?? null,
      status: "active",
      reviewDay: input.reviewDay ?? null,
      source: input.source,
      callId: input.callId ?? null,
      evidence: input.evidence ?? [],
      acceptedAt: now,
    });
    const planId = Number(inserted.insertId);
    await tx.insert(coachingSteps).values(input.steps.slice(0, 8).map((step, position) => ({
      planId,
      userId: user.userId,
      userType: user.userType,
      position,
      title: step.title,
      kind: step.kind,
      target: step.target ?? null,
      dueDay: step.dueDay ?? null,
    })));
    return { id: planId, replaced: current?.id ?? null };
  });
}

async function loadPlan(user: CoachUser, where: ReturnType<typeof and>): Promise<PlanView | null> {
  const [plan] = await db.select().from(coachingPlans).where(and(planScope(user), where)).orderBy(desc(coachingPlans.acceptedAt)).limit(1);
  if (!plan) return null;
  const steps = await db.select().from(coachingSteps).where(and(stepScope(user), eq(coachingSteps.planId, plan.id))).orderBy(asc(coachingSteps.position));
  return {
    id: plan.id,
    title: plan.title,
    goal: plan.goal,
    status: plan.status,
    revision: plan.revision,
    reviewDay: plan.reviewDay,
    acceptedAt: iso(plan.acceptedAt),
    evidence: Array.isArray(plan.evidence) ? (plan.evidence as PlanView["evidence"]) : [],
    steps: steps.map((step) => ({
      id: step.id,
      title: step.title,
      kind: step.kind,
      target: (step.target ?? null) as Record<string, unknown> | null,
      status: step.status,
      dueDay: step.dueDay,
      doneAt: iso(step.doneAt),
      doneEvidence: step.doneEvidence,
      remindAt: iso(step.remindAt),
      reminderStatus: step.reminderStatus,
    })),
  };
}

export function activePlan(user: CoachUser): Promise<PlanView | null> {
  return loadPlan(user, eq(coachingPlans.status, "active"));
}

async function ownedStep(user: CoachUser, stepId: number) {
  const [step] = await db.select().from(coachingSteps).where(and(stepScope(user), eq(coachingSteps.id, stepId))).limit(1);
  if (!step) throw new TRPCError({ code: "NOT_FOUND", message: "الخطوة دي مش موجودة." });
  const [plan] = await db.select({ status: coachingPlans.status }).from(coachingPlans).where(and(planScope(user), eq(coachingPlans.id, step.planId))).limit(1);
  if (plan?.status !== "active") throw new TRPCError({ code: "CONFLICT", message: "الخطة دي مابقتش شغالة." });
  return step;
}

export async function setStepStatus(user: CoachUser, stepId: number, status: "pending" | "done" | "skipped", evidence: "user" | "ledger" = "user", now = new Date()): Promise<void> {
  await ownedStep(user, stepId);
  await db.update(coachingSteps).set({
    status,
    doneAt: status === "done" ? now : null,
    doneEvidence: status === "done" ? evidence : null,
  }).where(and(stepScope(user), eq(coachingSteps.id, stepId)));
}

/** Schedules (or moves) a step's reminder; only a future time. The revision makes any earlier one stale. */
export async function setReminder(user: CoachUser, stepId: number, at: Date, now = new Date()): Promise<{ revision: number }> {
  if (at.getTime() <= now.getTime()) throw new TRPCError({ code: "BAD_REQUEST", message: "ميعاد التذكير لازم يكون بعد دلوقتي." });
  const step = await ownedStep(user, stepId);
  const revision = step.reminderRevision + 1;
  await db.update(coachingSteps).set({ remindAt: at, reminderStatus: "scheduled", reminderRevision: revision })
    .where(and(stepScope(user), eq(coachingSteps.id, stepId)));
  return { revision };
}

export async function cancelReminder(user: CoachUser, stepId: number): Promise<void> {
  const step = await ownedStep(user, stepId);
  await db.update(coachingSteps).set({ reminderStatus: "cancelled", reminderRevision: step.reminderRevision + 1 })
    .where(and(stepScope(user), eq(coachingSteps.id, stepId)));
}

/** Ends the active plan by the user's choice; its reminders stop. */
export async function endPlan(user: CoachUser, planId: number, status: "completed" | "cancelled", now = new Date()): Promise<void> {
  const [result] = await db.update(coachingPlans).set({ status, endedAt: now })
    .where(and(planScope(user), eq(coachingPlans.id, planId), eq(coachingPlans.status, "active")));
  if (!(result as { affectedRows?: number }).affectedRows) throw new TRPCError({ code: "NOT_FOUND", message: "مفيش خطة شغالة بالرقم ده." });
  await db.update(coachingSteps).set({ reminderStatus: "cancelled" })
    .where(and(stepScope(user), eq(coachingSteps.planId, planId), eq(coachingSteps.reminderStatus, "scheduled")));
}

/**
 * Delivers the reminders now due, each once: the step moves from `scheduled` to `sent` for its current revision and
 * the in-app notification is written in one transaction, so a restart, a retry or a second server delivers nothing
 * twice, and a moved or cancelled reminder (a newer revision) never fires the old one.
 */
export async function deliverDueReminders(now = new Date(), limit = 200): Promise<{ sent: number }> {
  const due = await db.select({
    id: coachingSteps.id, userId: coachingSteps.userId, userType: coachingSteps.userType, revision: coachingSteps.reminderRevision,
  }).from(coachingSteps).where(and(eq(coachingSteps.reminderStatus, "scheduled"), lte(coachingSteps.remindAt, now))).limit(limit);
  let sent = 0;
  for (const step of due) {
    const delivered = await db.transaction(async (tx) => {
      const [claim] = await tx.update(coachingSteps).set({ reminderStatus: "sent" }).where(and(
        eq(coachingSteps.id, step.id), eq(coachingSteps.reminderStatus, "scheduled"), eq(coachingSteps.reminderRevision, step.revision),
      ));
      if (!(claim as { affectedRows?: number }).affectedRows) return false;
      await tx.insert(inAppNotifications).values({
        userId: step.userId,
        userType: step.userType,
        // No amount and no detail in the notification itself: the step is read in the app.
        title: "تذكير بخطتك",
        body: "عندك خطوة في خطتك النهارده. افتحها تشوف التفاصيل.",
        actionUrl: "/plan",
      });
      return true;
    });
    if (delivered) sent += 1;
  }
  return { sent };
}

/** The steps whose reminders are waiting, for a user: what the plan screen lists and can cancel. */
export async function scheduledReminders(user: CoachUser) {
  return db.select({ id: coachingSteps.id, remindAt: coachingSteps.remindAt }).from(coachingSteps)
    .where(and(stepScope(user), inArray(coachingSteps.reminderStatus, ["scheduled"])));
}

export function todayKey(now = new Date()): string {
  return businessDateKey(now);
}
