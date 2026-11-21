/** Only a complete private phone identity can reuse an explicitly chosen owned contact. Names alone never link people. */
import { and, eq, like } from "drizzle-orm";
import { captureMarkers, userContacts } from "../../../db/schema";
import type { LedgerOwner, LedgerTx } from "../../services/ledger-writer";

function phoneKey(memoryKey: unknown, identityKind: unknown): string | null {
  return identityKind === "phone" && typeof memoryKey === "string" && /^p:[a-f0-9]{64}$/.test(memoryKey) ? memoryKey.slice(2) : null;
}
export async function rememberIdentityContact(tx: LedgerTx, owner: LedgerOwner, memoryKey: unknown, identityKind: unknown, contactId: number | null): Promise<void> {
  const key = phoneKey(memoryKey, identityKind);
  if (!key) return;
  await tx.delete(captureMarkers).where(and(eq(captureMarkers.userId, owner.userId), eq(captureMarkers.userType, owner.userType), eq(captureMarkers.kind, "person_contact"), like(captureMarkers.value, `${key}:%`)));
  if (contactId) await tx.insert(captureMarkers).values({ ...owner, kind: "person_contact", value: `${key}:${contactId}` });
}
export async function contactFromIdentity(tx: LedgerTx, owner: LedgerOwner, memoryKey: unknown, identityKind: unknown): Promise<number | null> {
  const key = phoneKey(memoryKey, identityKind);
  if (!key) return null;
  const rows = await tx.select({ value: captureMarkers.value }).from(captureMarkers).where(and(eq(captureMarkers.userId, owner.userId), eq(captureMarkers.userType, owner.userType), eq(captureMarkers.kind, "person_contact"), like(captureMarkers.value, `${key}:%`)));
  if (rows.length !== 1) return null;
  const id = Number(rows[0].value.slice(key.length + 1));
  if (!Number.isSafeInteger(id) || id < 1) return null;
  const [contact] = await tx.select({ id: userContacts.id }).from(userContacts).where(and(eq(userContacts.id, id), eq(userContacts.userId, owner.userId), eq(userContacts.userType, owner.userType)));
  return contact?.id ?? null;
}

export async function removeIdentityContact(tx: LedgerTx, owner: LedgerOwner, contactId: number): Promise<void> {
  await tx.delete(captureMarkers).where(and(eq(captureMarkers.userId, owner.userId), eq(captureMarkers.userType, owner.userType), eq(captureMarkers.kind, "person_contact"), like(captureMarkers.value, `%:${contactId}`)));
}

export async function mergeIdentityContact(tx: LedgerTx, owner: LedgerOwner, from: number, to: number): Promise<void> {
  const rows = await tx.select({ value: captureMarkers.value }).from(captureMarkers).where(and(eq(captureMarkers.userId, owner.userId), eq(captureMarkers.userType, owner.userType), eq(captureMarkers.kind, "person_contact"), like(captureMarkers.value, `%:${from}`)));
  for (const row of rows) {
    const key = row.value.split(":")[0];
    if (!/^[a-f0-9]{64}$/.test(key)) continue;
    await rememberIdentityContact(tx, owner, `p:${key}`, "phone", to);
  }
}
