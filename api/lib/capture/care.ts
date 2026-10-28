/**
 * Looking after a user's capture (decision 0034): the health each phone reports and the notice when one stops
 * capturing, the wallet suggested for a card seen in messages, and deleting what capture keeps about the user.
 */
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import {
  captureAiJobs,
  captureConsents,
  captureDevices,
  captureEvents,
  captureMarkers,
  captureMemory,
  captureSignals,
  captureUserPairs,
  inAppNotifications,
  userWallets,
} from "../../../db/schema";
import type { CaptureHeartbeat } from "../../../contracts/capture-intake";
import { getDb } from "../../queries/connection";
import { createLogger } from "../log";
import { getCaptureCatalog } from "./catalog";
import { captureConsentsOf } from "./consent";
import type { CaptureDevice, CaptureOwner } from "./devices";

const log = createLogger("capture-care");
const DAY_MS = 24 * 3600 * 1000;
/** A phone silent this long, or one that lost notification access, is told about once. */
export const SILENT_AFTER_MS = 2 * DAY_MS;

const STOPPED_NOTICE = {
  title: "تسجيل رسايل البنك واقف",
  body: "موبايلك بطّل يبعت رسايل البنك. افتح التطبيق من الموبايل ده ورجّع صلاحية قراية الإشعارات من كارت رسايل البنك.",
};

/** Keeps a phone's report; a phone that lost access tells its user once, until it reports access again. */
export async function recordHeartbeat(device: CaptureDevice, report: CaptureHeartbeat, now = new Date()): Promise<void> {
  const db = getDb();
  const [row] = await db
    .select({ silentNoticeAt: captureDevices.silentNoticeAt })
    .from(captureDevices)
    .where(and(eq(captureDevices.id, device.deviceId), eq(captureDevices.userId, device.userId), eq(captureDevices.userType, device.userType)));
  if (!row) return;
  const tell = !report.access && !row.silentNoticeAt;
  await db
    .update(captureDevices)
    .set({
      lastHeartbeatAt: now,
      lastSeenAt: now,
      health: report,
      silentNoticeAt: report.access ? null : tell ? now : row.silentNoticeAt,
      ...(report.appVersion ? { appVersion: report.appVersion } : {}),
    })
    .where(eq(captureDevices.id, device.deviceId));
  if (tell) await db.insert(inAppNotifications).values({ userId: device.userId, userType: device.userType, ...STOPPED_NOTICE });
}

/**
 * Tells the user once about each active Android phone that has not reported for two days (the app was removed, or the
 * system stopped it), while they still consent to capture. Returns how many were told.
 */
export async function runSilentDevices(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - SILENT_AFTER_MS);
  const silent = await getDb()
    .select({ id: captureDevices.id, userId: captureDevices.userId, userType: captureDevices.userType })
    .from(captureDevices)
    .where(
      and(
        isNull(captureDevices.revokedAt),
        isNull(captureDevices.silentNoticeAt),
        eq(captureDevices.platform, "android"),
        sql`COALESCE(${captureDevices.lastHeartbeatAt}, ${captureDevices.lastSeenAt}, ${captureDevices.createdAt}) < ${before}`,
      ),
    )
    .limit(500);
  let told = 0;
  for (const device of silent) {
    const owner = { userId: device.userId, userType: device.userType };
    await getDb().update(captureDevices).set({ silentNoticeAt: now }).where(eq(captureDevices.id, device.id));
    if (!(await captureConsentsOf(owner)).capture) continue;
    await getDb().insert(inAppNotifications).values({ ...owner, ...STOPPED_NOTICE });
    told++;
  }
  if (told > 0) log.info({ event: "capture.silent_devices", told }, "Users told their phone stopped capturing");
  return told;
}

/** A card or account seen in the user's messages with no wallet yet, at least twice in 60 days. */
export interface WalletOffer {
  sourceSlug: string;
  sourceName: { ar: string; en: string };
  suffix: string;
  payments: number;
}

const offerKey = (sourceSlug: string, suffix: string) => `${sourceSlug}:${suffix}`;

export async function walletOffers(owner: CaptureOwner, now = new Date()): Promise<WalletOffer[]> {
  const db = getDb();
  const mine = and(eq(captureEvents.userId, owner.userId), eq(captureEvents.userType, owner.userType));
  const suffix = sql<string>`RIGHT(COALESCE(${captureEvents.cardSuffix}, ${captureEvents.accountSuffix}), 3)`;
  const seen = await db
    .select({ sourceSlug: captureEvents.sourceSlug, suffix, payments: count() })
    .from(captureEvents)
    .where(
      and(
        mine,
        isNotNull(captureEvents.sourceSlug),
        or(isNotNull(captureEvents.cardSuffix), isNotNull(captureEvents.accountSuffix)),
        inArray(captureEvents.status, ["review", "recorded"]),
        gte(captureEvents.createdAt, new Date(now.getTime() - 60 * DAY_MS)),
      ),
    )
    .groupBy(captureEvents.sourceSlug, suffix)
    .orderBy(desc(count()));
  if (seen.length === 0) return [];
  const wallets = await db
    .select({ lastFourDigits: userWallets.lastFourDigits })
    .from(userWallets)
    .where(and(eq(userWallets.userId, owner.userId), eq(userWallets.userType, owner.userType)));
  const held = new Set(wallets.flatMap((wallet) => (wallet.lastFourDigits ? [wallet.lastFourDigits.slice(-3)] : [])));
  const declined = await db
    .select({ value: captureMarkers.value })
    .from(captureMarkers)
    .where(and(eq(captureMarkers.userId, owner.userId), eq(captureMarkers.userType, owner.userType), inArray(captureMarkers.kind, ["no_wallet", "ignore_card"])));
  const no = new Set(declined.map((row) => row.value));
  const catalog = await getCaptureCatalog();
  return seen
    .filter((row) => Number(row.payments) >= 2 && !held.has(row.suffix) && !no.has(offerKey(row.sourceSlug!, row.suffix)) && !no.has(row.suffix))
    .slice(0, 3)
    .flatMap((row) => {
      const source = catalog.sources.find((item) => item.slug === row.sourceSlug);
      return source ? [{ sourceSlug: source.slug, sourceName: { ar: source.nameAr, en: source.nameEn }, suffix: row.suffix, payments: Number(row.payments) }] : [];
    });
}

/** Adds the wallet the user accepted: the bank's name and the digits, so future payments of that card land on it. */
export async function acceptWalletOffer(owner: CaptureOwner, sourceSlug: string, suffix: string): Promise<{ walletId: number } | null> {
  const offer = (await walletOffers(owner)).find((item) => item.sourceSlug === sourceSlug && item.suffix === suffix);
  if (!offer) return null;
  const [inserted] = await getDb()
    .insert(userWallets)
    .values({
      userId: owner.userId,
      userType: owner.userType,
      name: `${offer.sourceName.ar} ••${suffix}`.slice(0, 100),
      provider: offer.sourceName.en.slice(0, 50),
      lastFourDigits: suffix,
    });
  return { walletId: Number((inserted as { insertId?: number }).insertId) };
}

export async function declineWalletOffer(owner: CaptureOwner, sourceSlug: string, suffix: string): Promise<void> {
  await getDb()
    .insert(captureMarkers)
    .ignore()
    .values({ userId: owner.userId, userType: owner.userType, kind: "no_wallet", value: offerKey(sourceSlug, suffix) });
}

/**
 * Deletes what capture keeps about the user and stops it on every phone: the signals and their texts, the model's
 * queue, the memory, the pairs, the ignore lists and the payments still waiting. Answered payments stay as tombstones
 * without card, account, merchant or balance, so a late message does not bring one back, and the month's count stays.
 * The ledger is the user's and is not touched. Phones stop at their next request: the consent is gone (403).
 */
export async function deleteMyCaptureData(owner: CaptureOwner): Promise<{ signals: number; waiting: number }> {
  const scope = <T extends { userId: unknown; userType: unknown }>(table: T) =>
    and(eq(table.userId as never, owner.userId), eq(table.userType as never, owner.userType));
  let signals = 0;
  let waiting = 0;
  await getDb().transaction(async (tx) => {
    await tx.delete(captureAiJobs).where(scope(captureAiJobs));
    const [removed] = await tx.delete(captureSignals).where(scope(captureSignals));
    signals = Number((removed as { affectedRows?: number }).affectedRows ?? 0);
    const [open] = await tx.delete(captureEvents).where(and(scope(captureEvents), inArray(captureEvents.status, ["review", "held"])));
    waiting = Number((open as { affectedRows?: number }).affectedRows ?? 0);
    await tx
      .update(captureEvents)
      .set({ cardSuffix: null, accountSuffix: null, merchantKey: null, balanceAfter: null, reading: null })
      .where(scope(captureEvents));
    await tx.delete(captureMemory).where(scope(captureMemory));
    await tx.delete(captureUserPairs).where(scope(captureUserPairs));
    await tx.delete(captureMarkers).where(scope(captureMarkers));
    const now = new Date();
    await tx.update(captureDevices).set({ revokedAt: now }).where(and(scope(captureDevices), isNull(captureDevices.revokedAt)));
    await tx.update(captureConsents).set({ revokedAt: now }).where(and(scope(captureConsents), isNull(captureConsents.revokedAt)));
  });
  log.info({ event: "capture.my_data_deleted", userId: owner.userId, signals, waiting }, "A user deleted their capture data");
  return { signals, waiting };
}

