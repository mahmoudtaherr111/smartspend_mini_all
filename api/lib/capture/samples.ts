/**
 * Redacted messages kept to build a reader that needs no model (plan v7 §8). Written in the transaction that finishes
 * the model's reading, only when the admin switch `capture_samples_enabled` is on and the user gave the
 * `message_samples` consent. The text is the exact numbered-marker text the model saw: no name, phone, card or code.
 */
import { and, eq } from "drizzle-orm";
import { captureSamples } from "../../../db/schema";
import { businessDateKey } from "../app-time";
import { getSystemSettings } from "../settings-cache";
import type { LedgerTx } from "../../services/ledger-writer";
import { captureConsentsOf } from "./consent";
import { optionalCaptureTables } from "./schema-state";

export interface CaptureSampleInput {
  signalId: number;
  eventId: number | null;
  sourceSlug: string | null;
  channel: string;
  /** The prepared text sent to the model, numbered markers only. */
  text: string;
  textHmac: string;
  promptVersion: string;
  provider: string | null;
  model: string | null;
  reply: unknown;
  posting: unknown;
  receivedAt: Date;
}

export async function keepCaptureSample(tx: LedgerTx, owner: { userId: number; userType: string }, input: CaptureSampleInput): Promise<boolean> {
  const settings = await getSystemSettings();
  if (settings.capture_samples_enabled !== "true") return false;
  // An expand-first deploy can switch this on before the table exists: skip rather than fail the reading.
  if (!(await optionalCaptureTables(tx)).has("capture_samples")) return false;
  const consent = await captureConsentsOf(owner, tx);
  if (!consent.samples) return false;
  await tx.insert(captureSamples).values({
    userId: owner.userId, userType: owner.userType, signalId: input.signalId, eventId: input.eventId, sourceSlug: input.sourceSlug,
    channel: input.channel.slice(0, 16), textRedacted: input.text, textHmac: input.textHmac, promptVersion: input.promptVersion,
    provider: input.provider, model: input.model, modelReply: input.reply, posting: input.posting,
    receivedMonth: businessDateKey(input.receivedAt).slice(0, 7),
  }).onDuplicateKeyUpdate({ set: { eventId: input.eventId } });
  return true;
}

/** The user's samples, for the account's own export and tests. */
export async function captureSamplesOf(tx: Pick<LedgerTx, "select">, owner: { userId: number; userType: string }) {
  return tx.select().from(captureSamples).where(and(eq(captureSamples.userId, owner.userId), eq(captureSamples.userType, owner.userType)));
}
