/** Fee signals link only on an issuer-scoped bank reference and the exact declared EGP fee. Caller holds the owner lock. */
import { and, eq, gte, isNull, lte, ne } from "drizzle-orm";
import { captureEvents, expenses } from "../../../db/schema";
import { financialBucket } from "../../../contracts/ledger-movement";
import type { LedgerTx } from "../../services/ledger-writer";
import type { CaptureOwner } from "./devices";
import type { SignalReading } from "./intake";

type Event = typeof captureEvents.$inferSelect;
/** A row the model path wrote (sms-v4 or later), whose fee and principal it split itself. */
const modelWritten = (details: Record<string, unknown>) => details.promptVersion === "sms-v4" || details.promptVersion === "sms-v5";
const WINDOW = 24 * 3600_000;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function referenceScope(
  owner: CaptureOwner,
  reference: string,
  source: string,
  at: Date,
) {
  return and(
    eq(captureEvents.userId, owner.userId),
    eq(captureEvents.userType, owner.userType),
    eq(captureEvents.referenceHmac, reference),
    eq(captureEvents.sourceSlug, source),
    eq(captureEvents.status, "recorded"),
    gte(captureEvents.occurredAt, new Date(at.getTime() - WINDOW)),
    lte(captureEvents.occurredAt, new Date(at.getTime() + WINDOW)),
  );
}

/** A separately delivered fee already included in a recorded bundle. A deleted fee is not recreated. */
export async function declaredFeeParent(
  tx: LedgerTx,
  owner: CaptureOwner,
  reading: SignalReading,
): Promise<Event | null> {
  const posting = reading.modelRead?.posting;
  if (
    reading.kind !== "fee" ||
    posting?.status !== "ready" ||
    Number(posting.feeEgp) !== 0 ||
    !reading.referenceHmac ||
    !reading.sourceSlug
  )
    return null;
  const rows = await tx
    .select({ event: captureEvents, metadata: expenses.parsedMetadata })
    .from(captureEvents)
    .innerJoin(
      expenses,
      and(
        eq(expenses.id, captureEvents.expenseId),
        eq(expenses.userId, owner.userId),
        eq(expenses.userType, owner.userType),
      ),
    )
    .where(
      and(
        referenceScope(
          owner,
          reading.referenceHmac,
          reading.sourceSlug,
          new Date(reading.occurredAt),
        ),
        ne(captureEvents.kind, "fee"),
      ),
    )
    .limit(3);
  const matches = rows.filter((row) => {
    const details = object(object(object(row.metadata).capture).details);
    return (
      modelWritten(details) &&
      typeof details.feeEgp === "number" &&
      details.feeEgp > 0 &&
      details.feeEgp === Number(posting.principalEgp)
    );
  });
  return matches.length === 1 ? matches[0].event : null;
}

/** Fee arrived first: adopt the existing row, retaining amount/category/note edits, and give back its separate quota. */
export async function adoptEarlierFee(
  tx: LedgerTx,
  owner: CaptureOwner,
  parent: Event,
  reading: SignalReading,
  parentExpenseId: number,
  feeEgp: number,
): Promise<{ adopted: boolean; quotaPeriod: string | null }> {
  if (
    !reading.modelRead ||
    !parent.referenceHmac ||
    !parent.sourceSlug ||
    feeEgp <= 0
  )
    return { adopted: false, quotaPeriod: null };
  const rows = await tx
    .select({ event: captureEvents, row: expenses })
    .from(captureEvents)
    .innerJoin(
      expenses,
      and(
        eq(expenses.id, captureEvents.expenseId),
        eq(expenses.userId, owner.userId),
        eq(expenses.userType, owner.userType),
      ),
    )
    .where(
      and(
        referenceScope(
          owner,
          parent.referenceHmac,
          parent.sourceSlug,
          parent.occurredAt,
        ),
        eq(captureEvents.kind, "fee"),
        isNull(captureEvents.linkedEventId),
        eq(captureEvents.currency, "EGP"),
        eq(captureEvents.amount, String(feeEgp)),
      ),
    )
    .limit(3)
    .for("update");
  if (rows.length !== 1) return { adopted: false, quotaPeriod: null };
  const { event, row } = rows[0];
  const metadata = object(row.parsedMetadata),
    capture = object(metadata.capture),
    details = object(capture.details);
  if (
    !modelWritten(details) ||
    capture.eventId !== event.id ||
    financialBucket(row) !== "expense" ||
    Number(row.amount) < 0
  )
    return { adopted: false, quotaPeriod: null };
  await tx
    .update(expenses)
    .set({
      clientRequestId: `cap:e${parent.id}:fee`,
      parsedMetadata: {
        ...metadata,
        capture: { ...capture, feeOfEventId: parent.id, parentExpenseId },
      },
    })
    .where(
      and(
        eq(expenses.id, row.id),
        eq(expenses.userId, owner.userId),
        eq(expenses.userType, owner.userType),
      ),
    );
  await tx
    .update(captureEvents)
    .set({ linkedEventId: parent.id, quotaPeriod: null })
    .where(
      and(
        eq(captureEvents.id, event.id),
        eq(captureEvents.userId, owner.userId),
        eq(captureEvents.userType, owner.userType),
      ),
    );
  return { adopted: true, quotaPeriod: event.quotaPeriod };
}
