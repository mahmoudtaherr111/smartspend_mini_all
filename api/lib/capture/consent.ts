/**
 * What a user agreed to for capture (decision 0028): reading their bank and wallet notifications (`capture`), and
 * letting the admin's model read the ones the code is unsure of (`ai_reading`). Financial data is sensitive under Law
 * 151/2020, so each grant is a row with the version of the text the user read, and taking it back keeps the row.
 */
import { and, eq, isNull } from "drizzle-orm";
import { captureConsents, localUsers, users } from "../../../db/schema";
import type { CaptureConsentScope } from "../../../contracts/capture-intake";
import { getDb } from "../../queries/connection";
import type { CaptureOwner } from "./devices";

/** The version of the consent text the app shows; a new text gets a new version. */
export const CAPTURE_CONSENT_TEXT_VERSION = "2026-10-27";
/** Broader scope: every redacted financial message, with automatic filing. Legacy grants never imply this grant. */
export const CAPTURE_AUTOMATIC_CONSENT_TEXT_VERSION = "2026-11-04";

export async function captureConsentsOf(owner: CaptureOwner, reader: Pick<ReturnType<typeof getDb>, "select"> = getDb(), version?: string): Promise<{ capture: boolean; aiReading: boolean }> {
  const rows = await reader
    .select({ scope: captureConsents.scope })
    .from(captureConsents)
    .where(and(eq(captureConsents.userId, owner.userId), eq(captureConsents.userType, owner.userType), isNull(captureConsents.revokedAt), ...(version ? [eq(captureConsents.textVersion, version)] : [])));
  const scopes = new Set(rows.map((row) => row.scope));
  return { capture: scopes.has("capture"), aiReading: scopes.has("ai_reading") };
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
    return;
  }
  const [existing] = await db.select({ id: captureConsents.id, textVersion: captureConsents.textVersion }).from(captureConsents).where(active).limit(1);
  if (!existing || existing.textVersion !== textVersion) {
    if (existing) await db.update(captureConsents).set({ revokedAt: new Date() }).where(active);
    await db.insert(captureConsents).values({ userId: owner.userId, userType: owner.userType, scope, textVersion });
  }
  });
}
