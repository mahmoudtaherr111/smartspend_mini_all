/**
 * What a user agreed to for capture (decision 0028): reading their bank and wallet notifications (`capture`), and
 * letting the admin's model read the ones the code is unsure of (`ai_reading`). Financial data is sensitive under Law
 * 151/2020, so each grant is a row with the version of the text the user read, and taking it back keeps the row.
 */
import { and, eq, isNull } from "drizzle-orm";
import { captureConsents } from "../../../db/schema";
import type { CaptureConsentScope } from "../../../contracts/capture-intake";
import { getDb } from "../../queries/connection";
import type { CaptureOwner } from "./devices";

/** The version of the consent text the app shows; a new text gets a new version. */
export const CAPTURE_CONSENT_TEXT_VERSION = "2026-10-27";

export async function captureConsentsOf(owner: CaptureOwner): Promise<{ capture: boolean; aiReading: boolean }> {
  const rows = await getDb()
    .select({ scope: captureConsents.scope })
    .from(captureConsents)
    .where(and(eq(captureConsents.userId, owner.userId), eq(captureConsents.userType, owner.userType), isNull(captureConsents.revokedAt)));
  const scopes = new Set(rows.map((row) => row.scope));
  return { capture: scopes.has("capture"), aiReading: scopes.has("ai_reading") };
}

/** Gives or takes back one consent. Giving it twice keeps the first grant. */
export async function setCaptureConsent(owner: CaptureOwner, scope: CaptureConsentScope, granted: boolean, textVersion: string): Promise<void> {
  const db = getDb();
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
  const [existing] = await db.select({ id: captureConsents.id }).from(captureConsents).where(active).limit(1);
  if (!existing) {
    await db.insert(captureConsents).values({ userId: owner.userId, userType: owner.userType, scope, textVersion });
  }
}
