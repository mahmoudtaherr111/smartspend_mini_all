import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../queries/connection";
import { financialCaptures, expenses, userBusinesses } from "../../db/schema";
import {
  captureDraftSchema,
  captureReceiptSchema,
  type CaptureDraft,
  type CaptureReceipt,
  type captureAnswerSchema,
} from "../../contracts/financial-capture";
import type { z } from "zod";
import {
  applyCaptureAnswer,
  assertCaptureReady,
  captureQuestions,
} from "../lib/financial-capture-state";
import {
  applyExpenseRollupDelta,
  expenseToRollupDelta,
  syncExpenseDetails,
} from "./expense-rollups";

export type CaptureOwner = { id: number; type: "local" | "oauth" };
const ttl = 30 * 24 * 60 * 60 * 1000;
export const captureHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function ownerWhere(owner: CaptureOwner) {
  return and(
    eq(financialCaptures.userId, owner.id),
    eq(financialCaptures.userType, owner.type),
  );
}
function view(row: typeof financialCaptures.$inferSelect) {
  const draft = captureDraftSchema.parse(row.draft);
  return {
    id: row.id,
    version: row.version,
    state: row.state,
    draft,
    questions: captureQuestions(draft),
    receipt: row.receipt ? captureReceiptSchema.parse(row.receipt) : null,
    expiresAt: row.expiresAt.toISOString(),
  };
}
export async function findCaptureForRequest(
  owner: CaptureOwner,
  requestKey: string,
  sourceFingerprint: string,
) {
  const row = await db.query.financialCaptures.findFirst({
    where: and(
      ownerWhere(owner),
      eq(financialCaptures.requestKey, captureHash(requestKey)),
    ),
  });
  if (!row) return null;
  if (row.sourceHash !== captureHash(sourceFingerprint))
    throw new TRPCError({
      code: "CONFLICT",
      message: "مفتاح الإرسال مستخدم لمحتوى مختلف.",
    });
  return view(row);
}
export async function createCapture(
  owner: CaptureOwner,
  requestKey: string,
  input: CaptureDraft,
  sourceFingerprint?: string,
) {
  const draft = captureDraftSchema.parse(input);
  const key = captureHash(requestKey);
  const sourceHash = sourceFingerprint
    ? captureHash(sourceFingerprint)
    : captureHash({
        channel: draft.channel,
        source: draft.sourceText,
        businessId: draft.businessId,
        metadata: draft.sourceMetadata,
      });
  const lookup = async () =>
    db.query.financialCaptures.findFirst({
      where: and(ownerWhere(owner), eq(financialCaptures.requestKey, key)),
    });
  const existing = await lookup();
  if (existing) {
    if (existing.sourceHash !== sourceHash)
      throw new TRPCError({
        code: "CONFLICT",
        message: "مفتاح الإرسال مستخدم لمحتوى مختلف.",
      });
    return view(existing);
  }
  const id = randomUUID();
  try {
    await db
      .insert(financialCaptures)
      .values({
        id,
        userId: owner.id,
        userType: owner.type,
        requestKey: key,
        sourceHash,
        draft,
        state: draft.ignoredReason ? "ignored" : "review",
        expiresAt: new Date(Date.now() + ttl),
      });
  } catch (error) {
    // A competing insert is allowed only if it represents the same source.
    const winner = await lookup();
    if (!winner) throw error;
    if (winner.sourceHash !== sourceHash)
      throw new TRPCError({
        code: "CONFLICT",
        message: "مفتاح الإرسال مستخدم لمحتوى مختلف.",
      });
    return view(winner);
  }
  const row = await lookup();
  if (!row) throw new Error("CAPTURE_INSERT_MISSING");
  return view(row);
}
export async function listCaptures(owner: CaptureOwner) {
  return (
    await db.query.financialCaptures.findMany({
      where: and(
        ownerWhere(owner),
        eq(financialCaptures.state, "review"),
        gt(financialCaptures.expiresAt, new Date()),
      ),
      orderBy: [desc(financialCaptures.createdAt)],
      limit: 100,
    })
  ).map(view);
}
export async function getCapture(owner: CaptureOwner, id: string) {
  const row = await db.query.financialCaptures.findFirst({
    where: and(ownerWhere(owner), eq(financialCaptures.id, id)),
  });
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: "المسودة غير موجودة." });
  return view(row);
}
function assertMutable(
  row: typeof financialCaptures.$inferSelect,
  version: number,
) {
  if (row.state !== "review" || row.version !== version)
    throw new TRPCError({
      code: "CONFLICT",
      message: "المسودة اتغيرت. راجع أحدث نسخة قبل التأكيد.",
    });
  if (row.expiresAt.getTime() <= Date.now())
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "انتهت صلاحية المسودة. أعد إدخال المصدر.",
    });
}
export async function answerCapture(
  owner: CaptureOwner,
  answer: z.infer<typeof captureAnswerSchema>,
) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(financialCaptures)
      .where(and(ownerWhere(owner), eq(financialCaptures.id, answer.captureId)))
      .for("update");
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    assertMutable(row, answer.version);
    let draft: CaptureDraft;
    try {
      draft = applyCaptureAnswer(captureDraftSchema.parse(row.draft), answer);
    } catch {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "الإجابة لا تناسب الحقل أو حالة العملية.",
      });
    }
    await tx
      .update(financialCaptures)
      .set({ draft, version: row.version + 1, updatedAt: new Date() })
      .where(eq(financialCaptures.id, row.id));
  });
  return getCapture(owner, answer.captureId);
}
export async function dismissCapture(
  owner: CaptureOwner,
  id: string,
  version: number,
) {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(financialCaptures)
      .where(and(ownerWhere(owner), eq(financialCaptures.id, id)))
      .for("update");
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    assertMutable(row, version);
    await tx
      .update(financialCaptures)
      .set({ state: "dismissed", version: version + 1, updatedAt: new Date() })
      .where(eq(financialCaptures.id, id));
  });
  return { dismissed: true };
}
/** Lock + validate + save all rows + rollups + consume draft in ONE transaction. */
export async function confirmCapture(
  owner: CaptureOwner,
  id: string,
  version: number,
): Promise<CaptureReceipt> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(financialCaptures)
      .where(and(ownerWhere(owner), eq(financialCaptures.id, id)))
      .for("update");
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    if (row.state === "saved" && row.receipt)
      return captureReceiptSchema.parse(row.receipt);
    assertMutable(row, version);
    const draft = captureDraftSchema.parse(row.draft);
    try {
      assertCaptureReady(draft);
    } catch {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "راجع الأسئلة والتفاصيل الناقصة قبل الحفظ.",
      });
    }
    if (draft.businessId) {
      const [business] = await tx
        .select({ id: userBusinesses.id })
        .from(userBusinesses)
        .where(
          and(
            eq(userBusinesses.id, draft.businessId),
            eq(userBusinesses.userId, owner.id),
            eq(userBusinesses.userType, owner.type),
          ),
        )
        .for("update");
      if (!business)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "نطاق العمل لا يخص هذا الحساب.",
        });
    }
    const receipt: CaptureReceipt = { captureId: id, version, events: [] };
    for (const event of draft.events) {
      const source =
        draft.channel === "image"
          ? "image"
          : draft.channel === "voice"
            ? "voice"
            : draft.channel === "text"
              ? "ai_parsed"
              : "sms";
      const date = new Date(event.occurredAt!);
      const metadata = {
        captureId: id,
        eventId: event.id,
        version,
        currency: event.currency,
        merchant: event.merchant,
        billingContext: event.billingContext,
        sourceEvidence: event.evidence,
        confirmedByUser: true,
      };
      const [inserted] = await tx
        .insert(expenses)
        .values({
          userId: owner.id,
          userType: owner.type,
          amount: event.amount!.toFixed(2),
          type: event.kind,
          category: event.category!,
          subCategory: event.subCategory || "عام",
          description: event.description,
          source,
          rawText: draft.sourceText,
          date,
          businessId: draft.businessId,
          clientRequestId: captureHash([id, event.id]),
          parsedMetadata: metadata,
        });
      const expenseId = inserted.insertId;
      if (!expenseId) throw new Error("CAPTURE_EXPENSE_INSERT_MISSING");
      await syncExpenseDetails(tx, expenseId, draft.sourceText, metadata);
      await applyExpenseRollupDelta(
        tx,
        expenseToRollupDelta(
          {
            userId: owner.id,
            userType: owner.type,
            businessId: draft.businessId,
            date,
            amount: event.amount!,
            type: event.kind,
            source,
          },
          1,
        ),
      );
      receipt.events.push({
        eventId: event.id,
        expenseId,
        amount: event.amount!,
        currency: "EGP",
        category: event.category!,
        type: event.kind,
        occurredAt: event.occurredAt!,
      });
    }
    await tx
      .update(financialCaptures)
      .set({ state: "saved", receipt, updatedAt: new Date() })
      .where(eq(financialCaptures.id, id));
    return receipt;
  });
}
