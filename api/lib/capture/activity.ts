/** User-visible progress without exposing raw signals, private token maps, or pretending unresolved money was saved. */
import { and, desc, eq, inArray, isNull, ne, notInArray, or } from "drizzle-orm";
import { captureAiJobs, captureEvents, expenses } from "../../../db/schema";
import { ledgerBundle, ledgerBundleColumns, ledgerBundleJoin, linkedLedgerFee } from "../../services/ledger-bundles";
import { getDb } from "../../queries/connection";
import type { CaptureOwner } from "./devices";

export async function captureActivity(owner: CaptureOwner, limit = 30) {
  const size = Math.min(50, Math.max(1, limit));
  const [events, jobs] = await Promise.all([
    getDb()
      .select({
        id: captureEvents.id,
        expenseId: captureEvents.expenseId,
        status: captureEvents.status,
        autoRecorded: captureEvents.autoRecorded,
        kind: captureEvents.kind,
        source: captureEvents.sourceSlug,
        amountEgp: captureEvents.amountEgp,
        at: captureEvents.createdAt,
      })
      .from(captureEvents)
      .where(
        and(
          eq(captureEvents.userId, owner.userId),
          eq(captureEvents.userType, owner.userType),
          or(ne(captureEvents.kind, "fee"), isNull(captureEvents.linkedEventId)),
        ),
      )
      .orderBy(desc(captureEvents.id))
      .limit(size),
    getDb()
      .select({
        id: captureAiJobs.id,
        status: captureAiJobs.status,
        outcome: captureAiJobs.outcome,
        at: captureAiJobs.createdAt,
      })
      .from(captureAiJobs)
      .where(
        and(
          eq(captureAiJobs.userId, owner.userId),
          eq(captureAiJobs.userType, owner.userType),
          isNull(captureAiJobs.eventId),
          or(
            eq(captureAiJobs.status, "queued"),
            eq(captureAiJobs.status, "running"),
            and(
              eq(captureAiJobs.status, "done"),
              notInArray(captureAiJobs.outcome, [
                "not_transaction",
                "gone",
                "read",
              ]),
            ),
          ),
        ),
      )
      .orderBy(desc(captureAiJobs.id))
      .limit(size),
  ]);
  const ids = events.filter((event) => event.status === "recorded" && event.expenseId !== null).map((event) => event.expenseId!);
  const entries = ids.length ? await getDb().select(ledgerBundleColumns).from(expenses).leftJoin(linkedLedgerFee, ledgerBundleJoin)
    .where(and(eq(expenses.userId, owner.userId), eq(expenses.userType, owner.userType), inArray(expenses.id, ids))) : [];
  const current = new Map(entries.map(({ entry, fee }) => [entry.id, ledgerBundle(entry, fee)]));
  return [
    ...events.map((event) => ({
      key: `event:${event.id}`,
      eventId: event.id,
      expenseId: event.expenseId,
      canUndo: event.status === "recorded" && event.autoRecorded && current.has(event.expenseId ?? 0),
      title: current.get(event.expenseId ?? 0)?.description ?? null,
      state:
        event.status === "recorded"
          ? ("recorded" as const)
          : event.status === "held"
            ? ("held" as const)
            : event.status === "waiting"
              ? ("waiting" as const)
              : ["deleted", "dismissed"].includes(event.status)
                ? ("removed" as const)
                : ("review" as const),
      reason: event.status === "waiting" ? "duplicate_evidence" : null,
      source: event.source,
      kind: event.kind,
      amountEgp: current.has(event.expenseId ?? 0) ? Math.abs(Number(current.get(event.expenseId!)!.bundle?.totalAmount ?? current.get(event.expenseId!)!.amount)) : event.amountEgp === null ? null : Number(event.amountEgp),
      at: event.at,
    })),
    ...jobs
      .filter(
        (job) =>
          job.status !== "done" ||
          (job.outcome !== "not_transaction" && job.outcome !== "gone"),
      )
      .map((job) => ({
        key: `job:${job.id}`,
        eventId: null,
        expenseId: null,
        canUndo: false,
        title: null,
        state:
          job.status === "done"
            ? ("waiting" as const)
            : ("processing" as const),
        reason: job.outcome,
        source: null,
        kind: null,
        amountEgp: null,
        at: job.at,
      })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, size);
}
