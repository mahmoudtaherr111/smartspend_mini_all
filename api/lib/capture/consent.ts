/**
 * What a user agreed to for capture (decisions 0028, 0049): reading their bank and wallet messages (`capture`),
 * letting the model read every one of them with numbers that identify anyone hidden (`ai_reading`), keeping redacted
 * samples (`message_samples`), and being asked what a payment was for after it is saved (`purpose_questions`, a
 * preference kept the same way). Financial data is sensitive under Law 151/2020, so each grant is a row with the
 * version of the text the user read, and taking it back keeps the row.
 */
import { and, eq, isNull } from "drizzle-orm";
import { captureConsents, captureSamples, localUsers, users } from "../../../db/schema";
import type { CaptureConsentScope } from "../../../contracts/capture-intake";
import { getDb } from "../../queries/connection";
import type { CaptureOwner } from "./devices";

/**
 * The version of the consent text the app shows; a new text gets a new version and older grants stop counting.
 * 2026-11-05: every message is read by the model with names in it and recorded on its own (decision 0049).
 */
export const CAPTURE_CONSENT_TEXT_VERSION = "2026-11-05";
/** One text since decision 0049; the name stays for the callers that check the automatic grant. */
export const CAPTURE_AUTOMATIC_CONSENT_TEXT_VERSION = CAPTURE_CONSENT_TEXT_VERSION;

export async function captureConsentsOf(owner: CaptureOwner, reader: Pick<ReturnType<typeof getDb>, "select"> = getDb(), version?: string): Promise<{ capture: boolean; aiReading: boolean; samples: boolean; questions: boolean }> {
  const rows = await reader
    .select({ scope: captureConsents.scope })
    .from(captureConsents)
    .where(and(eq(captureConsents.userId, owner.userId), eq(captureConsents.userType, owner.userType), isNull(captureConsents.revokedAt), ...(version ? [eq(captureConsents.textVersion, version)] : [])));
  const scopes = new Set(rows.map((row) => row.scope));
  return { capture: scopes.has("capture"), aiReading: scopes.has("ai_reading"), samples: scopes.has("message_samples"), questions: scopes.has("purpose_questions") };
}

/** Gives or takes back one consent. Giving it twice keeps the first grant. */
export async function setCaptureConsent(owner: CaptureOwner, scope: CaptureConsentScope, granted: boolean, textVersion: string): Promise<void> {
  await getDb().transaction(async (db) => {
  const account = owner.userType === "oauth" ? users : localUsers;
  const [alive] = await db.select({ id: account.id }).from(account).where(eq(account.id, owner.userId)).for("update");
  if (!alive) return;
  const active = and(
    eq(captureConsents.userId, owner.userId),
    eq(captureConsents.userType, owner.userType),
    eq(captureConsents.scope, scope),
    isNull(captureConsents.revokedAt),
  );
  if (!granted) {
    await db.update(captureConsents).set({ revokedAt: new Date() }).where(active);
    // Taking back the samples consent takes back the samples kept under it.
    if (scope === "message_samples") await db.delete(captureSamples).where(and(eq(captureSamples.userId, owner.userId), eq(captureSamples.userType, owner.userType)));
    return;
  }
  const [existing] = await db.select({ id: captureConsents.id, textVersion: captureConsents.textVersion }).from(captureConsents).where(active).limit(1);
  if (!existing || existing.textVersion !== textVersion) {
    if (existing) await db.update(captureConsents).set({ revokedAt: new Date() }).where(active);
    await db.insert(captureConsents).values({ userId: owner.userId, userType: owner.userType, scope, textVersion });
  }
  });
}
