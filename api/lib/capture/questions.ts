/** Optional classification AFTER saving. Owner locks serialize display limits and first-answer-wins across devices. */
import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { captureQuestions, expenses } from "../../../db/schema";
import { CATEGORIES } from "../../../contracts/categories";
import {
  financialMovement,
  movementOf,
  type MovementKind,
} from "../../../contracts/ledger-movement";
import { getDb } from "../../queries/connection";
import {
  afterLedgerWrite,
  lockLedgerOwner,
  updateLedgerEntryInTx,
  type LedgerRow,
  type LedgerTx,
} from "../../services/ledger-writer";
import { businessDateKey } from "../app-time";
import { classifyText } from "../classify-text";
import { getSystemSettings } from "../settings-cache";
import { idsOfNames, rememberFiling } from "./memory";
import { CAPTURE_CONSENT_TEXT_VERSION, captureConsentsOf } from "./consent";
import type { CaptureOwner } from "./devices";
import type { LedgerSuggestion, SignalReading } from "./intake";

const scope = (owner: CaptureOwner) =>
  and(
    eq(captureQuestions.userId, owner.userId),
    eq(captureQuestions.userType, owner.userType),
  );
const rowScope = (owner: CaptureOwner, id: number) =>
  and(
    eq(expenses.id, id),
    eq(expenses.userId, owner.userId),
    eq(expenses.userType, owner.userType),
  );
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const detailsOf = (row: LedgerRow) =>
  object(object(object(row.parsedMetadata).capture).details);

export function needsPurposeQuestion(
  reading: SignalReading,
  filing: LedgerSuggestion,
): boolean {
  if (
    !reading.modelRead ||
    filing.from === "memory" ||
    filing.from === "catalog" ||
    reading.modelRead.facts?.ownMove === true ||
    [
      "atm_withdrawal",
      "cash_out",
      "cash_in",
      "cash_deposit",
      "card_payment",
      "fee",
    ].includes(reading.kind)
  )
    return false;
  return (
    filing.categoryId === "miscellaneous" ||
    (filing.categoryId === "other_income" &&
      filing.subCategoryId === "general_other_income") ||
    (filing.categoryId === "bills" &&
      filing.subCategoryId === "general_bills") ||
    (filing.categoryId === "transfer" &&
      !["debt", "gam3eya", "savings"].includes(filing.subCategoryId))
  );
}

export async function enqueuePurposeQuestion(
  tx: LedgerTx,
  owner: CaptureOwner,
  eventId: number,
  expenseId: number,
  category: string,
  subCategory: string,
): Promise<void> {
  if (
    (
      await getSystemSettings(tx, {
        keys: ["capture_questions_enabled"],
        lock: true,
      })
    ).capture_questions_enabled === "false"
  )
    return;
  // Each user turns the questions on for themselves in capture's settings (decision 0049).
  if (!(await captureConsentsOf(owner, tx, CAPTURE_CONSENT_TEXT_VERSION)).questions) return;
  const [{ waiting }] = await tx
    .select({ waiting: count() })
    .from(captureQuestions)
    .where(
      and(scope(owner), inArray(captureQuestions.status, ["pending", "shown"])),
    );
  if (waiting >= 200) return;
  await tx
    .insert(captureQuestions)
    .values({
      ...owner,
      eventId,
      expenseId,
      expectedCategory: category,
      expectedSubCategory: subCategory,
    })
    .onDuplicateKeyUpdate({ set: { eventId } });
}

export async function nextPurposeQuestion(
  owner: CaptureOwner,
  now = new Date(),
) {
  if ((await getSystemSettings()).capture_questions_enabled === "false")
    return null;
  if (!(await captureConsentsOf(owner, undefined, CAPTURE_CONSENT_TEXT_VERSION)).questions) return null;
  return getDb().transaction(async (tx) => {
    await lockLedgerOwner(tx, owner, "NOT_FOUND");
    const day = businessDateKey(now);
    // Bounded stale cleanup: later edits/deletion close obsolete questions without changing the ledger again.
    for (let n = 0; n < 10; n++) {
      const [shown] = await tx
        .select()
        .from(captureQuestions)
        .where(and(scope(owner), eq(captureQuestions.status, "shown")))
        .orderBy(asc(captureQuestions.id))
        .limit(1)
        .for("update");
      const [candidate] = shown
        ? [shown]
        : await tx
            .select()
            .from(captureQuestions)
            .where(and(scope(owner), eq(captureQuestions.status, "pending")))
            .orderBy(asc(captureQuestions.id))
            .limit(1)
            .for("update");
      if (!candidate) return null;
      const [row] = await tx
        .select()
        .from(expenses)
        .where(rowScope(owner, candidate.expenseId))
        .for("update");
      if (
        !row ||
        row.category !== candidate.expectedCategory ||
        (row.subCategory ?? "عام") !== candidate.expectedSubCategory ||
        detailsOf(row).categoryPending === false
      ) {
        await tx
          .update(captureQuestions)
          .set({ status: "superseded", resolvedAt: now })
          .where(and(scope(owner), eq(captureQuestions.id, candidate.id)));
        continue;
      }
      if (!shown) {
        const [{ used }] = await tx
          .select({ used: count() })
          .from(captureQuestions)
          .where(and(scope(owner), eq(captureQuestions.shownDay, day)));
        if (used >= 3) return null;
        await tx
          .update(captureQuestions)
          .set({ status: "shown", shownDay: day, shownAt: now })
          .where(and(scope(owner), eq(captureQuestions.id, candidate.id)));
      }
      const [fee] = await tx
        .select({ amount: expenses.amount })
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, owner.userId),
            eq(expenses.userType, owner.userType),
            eq(expenses.clientRequestId, `cap:e${candidate.eventId}:fee`),
          ),
        );
      const incoming = movementOf(row) === "in";
      return {
        questionId: candidate.id,
        eventId: candidate.eventId,
        expenseId: row.id,
        title: row.description || row.category,
        amountEgp: Math.abs(Number(row.amount)),
        feeEgp: fee ? Math.abs(Number(fee.amount)) : 0,
        direction: incoming ? ("in" as const) : ("out" as const),
        category: row.category,
        subCategory: row.subCategory,
        categories: CATEGORIES.filter((category) =>
          [incoming ? "income" : "expense", "transfer", "investment"].includes(
            category.type,
          ),
        ).map((category) => ({
          id: category.id,
          name: category.name_ar,
          subcategories: category.subcategories.map((sub) => ({
            id: sub.id,
            name: sub.name_ar,
          })),
        })),
      };
    }
    return null;
  });
}

export interface PurposeAnswer {
  action: "set" | "keep" | "skip";
  categoryId?: string;
  subCategoryId?: string;
  purpose?: string;
  movementKind?: MovementKind;
  contactId?: number | null;
}
export async function answerPurposeQuestion(
  owner: CaptureOwner,
  id: number,
  answer: PurposeAnswer,
  now = new Date(),
) {
  if ((await getSystemSettings()).capture_questions_enabled === "false")
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "تعديل التصنيف لسه بيتجهز.",
    });
  // Local classification only; its direction/amount are discarded. Never hold a transaction over a model call.
  const purpose =
    answer.action === "set" ? answer.purpose?.trim().slice(0, 200) : undefined;
  const classified =
    purpose && !answer.categoryId
      ? await classifyText(purpose, { amount: 1 })
      : null;
  let wrote = false;
  const result = await getDb().transaction(async (tx) => {
    await lockLedgerOwner(tx, owner, "NOT_FOUND");
    const ownQuestion = and(scope(owner), eq(captureQuestions.id, id));
    const [question] = await tx
      .select()
      .from(captureQuestions)
      .where(ownQuestion)
      .for("update");
    if (!question)
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "السؤال ده مش موجود.",
      });
    if (question.status !== "shown")
      return { result: question.status, expenseId: question.expenseId };
    const [row] = await tx
      .select()
      .from(expenses)
      .where(rowScope(owner, question.expenseId))
      .for("update");
    if (
      !row ||
      row.category !== question.expectedCategory ||
      (row.subCategory ?? "عام") !== question.expectedSubCategory ||
      detailsOf(row).categoryPending === false
    ) {
      await tx
        .update(captureQuestions)
        .set({ status: "superseded", resolvedAt: now })
        .where(ownQuestion);
      return { result: "superseded", expenseId: question.expenseId };
    }
    if (answer.action === "set") {
      const inferred =
        classified && classified.confidence >= 0.8
          ? idsOfNames(classified.category, classified.subCategory)
          : null;
      const transferKind =
        answer.movementKind &&
        [
          "own_transfer",
          "cash_transfer",
          "card_payment",
          "personal_transfer",
          "loan",
          "gam3eya",
        ].includes(answer.movementKind);
      const intentCategory = transferKind
        ? "transfer"
        : answer.movementKind === "investment"
          ? "investment"
          : undefined;
      const categoryId =
        answer.categoryId ?? intentCategory ?? inferred?.categoryId;
      const category = categoryId
        ? CATEGORIES.find((item) => item.id === categoryId)
        : null;
      const incoming = movementOf(row) === "in";
      const fits =
        category &&
        [incoming ? "income" : "expense", "transfer", "investment"].includes(
          category.type,
        );
      if (answer.categoryId && !fits)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "اختار فئة مناسبة لاتجاه العملية.",
        });
      const intentSub =
        answer.movementKind === "loan"
          ? "debt"
          : answer.movementKind === "gam3eya"
            ? "gam3eya"
            : answer.movementKind === "cash_transfer"
              ? "cash_transfer"
              : transferKind
                ? "bank_transfer"
                : undefined;
      const subId =
        answer.subCategoryId ?? intentSub ?? inferred?.subCategoryId;
      const sub = fits
        ? category.subcategories.find((item) => item.id === subId)
        : null;
      if (fits && answer.subCategoryId && !sub)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "اختار فئة فرعية من نفس الفئة.",
        });
      const current = financialMovement(row);
      const kind =
        answer.movementKind ??
        (fits && category.id === "investment"
          ? "investment"
          : fits && (sub?.id === "atm" || sub?.id === "cash_transfer")
            ? "cash_transfer"
            : fits && sub?.id === "savings"
              ? "own_transfer"
              : fits && sub?.id === "debt"
                ? "loan"
                : fits && sub?.id === "gam3eya"
                  ? "gam3eya"
                  : current?.kind === "personal_transfer" &&
                      fits &&
                      category.type !== "transfer"
                    ? incoming
                      ? "income"
                      : "spending"
                    : undefined);
      await updateLedgerEntryInTx(tx, owner, row.id, {
        ...(fits
          ? { category: category.name_ar, subCategory: sub?.name_ar ?? "عام" }
          : {}),
        movementKind: kind,
        capturePurpose: purpose,
        captureCategoryResolved: true,
        contactId: answer.contactId,
      });
      const memoryKey = detailsOf(row).memoryKey;
      if (
        fits &&
        typeof memoryKey === "string" &&
        /^[mp]:.{1,138}$/.test(memoryKey)
      )
        await rememberFiling(tx, owner, memoryKey, {
          categoryId: category.id,
          subCategoryId: sub?.id ?? "",
        });
      wrote = true;
    } else {
      await updateLedgerEntryInTx(tx, owner, row.id, {
        captureCategoryResolved: true,
      });
      wrote = true;
    }
    const status =
      answer.action === "skip"
        ? "skipped"
        : answer.action === "keep"
          ? "kept"
          : "answered";
    await tx
      .update(captureQuestions)
      .set({ status, resolvedAt: now })
      .where(ownQuestion);
    return { result: status, expenseId: row.id };
  });
  if (wrote) await afterLedgerWrite(owner);
  return result;
}
