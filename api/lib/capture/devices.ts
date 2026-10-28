/**
 * The phones that send captured notifications (decision 0028). A device token is separate from the session: a capture
 * has to keep working while the app is closed and after the seven-day session ends, and the token can do nothing but
 * send signals, read the capture config and answer its own notifications.
 *
 * The token is shown once, when the app registers the installation, and stored only as its SHA-256. Registering the
 * same installation again replaces it. A resolved token is cached for five minutes with the user's auth version: when
 * that moves (sign-out everywhere, a password change, a plan change, account deletion) the next request reads the
 * device row again, so a revoked device stops at once.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, count, eq, isNull, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { captureDevices } from "../../../db/schema";
import { CAPTURE_DEVICE_TOKEN_PREFIX } from "../../../contracts/capture-intake";
import { getDb } from "../../queries/connection";
import { cacheDel, cacheGet, cacheSet } from "../redis-client";
import { getAuthVersion } from "../session-validation";

export interface CaptureOwner {
  userId: number;
  userType: string;
}

export interface CaptureDevice extends CaptureOwner {
  deviceId: number;
}

/** Active installations one user may have at a time. */
export const CAPTURE_DEVICES_MAX = 5;
const CACHE_SECONDS = 300;
const cacheKey = (hash: string) => `capdev:${hash}`;

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newDeviceToken(): string {
  return CAPTURE_DEVICE_TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export interface RegisterDeviceInput {
  platform: "android" | "ios";
  installationId: string;
  label?: string | null;
  appVersion?: string | null;
  osVersion?: string | null;
}

/**
 * Registers an installation, or gives it a new token when it registered before (the old token stops working).
 * Returns the token; it is never shown again.
 */
export async function registerCaptureDevice(owner: CaptureOwner, input: RegisterDeviceInput): Promise<{ deviceId: number; token: string }> {
  const db = getDb();
  const token = newDeviceToken();
  const tokenHash = hashDeviceToken(token);
  const mine = and(eq(captureDevices.userId, owner.userId), eq(captureDevices.userType, owner.userType));

  const [existing] = await db
    .select()
    .from(captureDevices)
    .where(and(mine, eq(captureDevices.installationId, input.installationId)))
    .limit(1);

  if (!existing) {
    const [{ active }] = await db.select({ active: count() }).from(captureDevices).where(and(mine, isNull(captureDevices.revokedAt)));
    if (active >= CAPTURE_DEVICES_MAX) {
      throw new TRPCError({ code: "FORBIDDEN", message: `وصلت لأقصى عدد أجهزة (${CAPTURE_DEVICES_MAX}). شيل جهاز قديم الأول.` });
    }
  }

  const values = {
    platform: input.platform,
    tokenHash,
    label: input.label ?? null,
    appVersion: input.appVersion ?? null,
    osVersion: input.osVersion ?? null,
    revokedAt: null,
    lastSeenAt: new Date(),
  };
  if (existing) {
    await db.update(captureDevices).set(values).where(eq(captureDevices.id, existing.id));
    await cacheDel(cacheKey(existing.tokenHash));
    return { deviceId: existing.id, token };
  }
  const [result] = await db.insert(captureDevices).values({ ...values, userId: owner.userId, userType: owner.userType, installationId: input.installationId });
  return { deviceId: Number((result as { insertId?: number }).insertId), token };
}

/** The device a token belongs to, or null for an unknown or revoked token. */
export async function resolveCaptureDevice(token: string | null | undefined): Promise<CaptureDevice | null> {
  if (!token || !token.startsWith(CAPTURE_DEVICE_TOKEN_PREFIX) || token.length > 100) return null;
  const hash = hashDeviceToken(token);

  const cached = await cacheGet(cacheKey(hash));
  if (cached) {
    try {
      const entry = JSON.parse(cached) as CaptureDevice & { authver: number };
      if (entry.authver === (await getAuthVersion(entry.userType, entry.userId))) {
        return { deviceId: entry.deviceId, userId: entry.userId, userType: entry.userType };
      }
    } catch {
      // A cache entry that does not parse is read again from the database.
    }
  }

  const [row] = await getDb()
    .select({ id: captureDevices.id, userId: captureDevices.userId, userType: captureDevices.userType })
    .from(captureDevices)
    .where(and(eq(captureDevices.tokenHash, hash), isNull(captureDevices.revokedAt)))
    .limit(1);
  if (!row) {
    await cacheDel(cacheKey(hash));
    return null;
  }
  const device = { deviceId: row.id, userId: row.userId, userType: row.userType };
  const authver = await getAuthVersion(row.userType, row.userId);
  await cacheSet(cacheKey(hash), CACHE_SECONDS, JSON.stringify({ ...device, authver }));
  return device;
}

/** The user's installations, newest first, without their tokens. */
export async function listCaptureDevices(owner: CaptureOwner) {
  return getDb()
    .select({
      id: captureDevices.id,
      platform: captureDevices.platform,
      label: captureDevices.label,
      appVersion: captureDevices.appVersion,
      createdAt: captureDevices.createdAt,
      lastSeenAt: captureDevices.lastSeenAt,
      lastSignalAt: captureDevices.lastSignalAt,
      revokedAt: captureDevices.revokedAt,
    })
    .from(captureDevices)
    .where(and(eq(captureDevices.userId, owner.userId), eq(captureDevices.userType, owner.userType)))
    .orderBy(captureDevices.createdAt);
}

/** Stops one of the user's devices. Returns false when it is not theirs. */
export async function revokeCaptureDevice(owner: CaptureOwner, deviceId: number): Promise<boolean> {
  const db = getDb();
  const own = and(eq(captureDevices.id, deviceId), eq(captureDevices.userId, owner.userId), eq(captureDevices.userType, owner.userType));
  const [row] = await db.select({ tokenHash: captureDevices.tokenHash }).from(captureDevices).where(own).limit(1);
  if (!row) return false;
  await db.update(captureDevices).set({ revokedAt: new Date() }).where(and(own, isNull(captureDevices.revokedAt)));
  await cacheDel(cacheKey(row.tokenHash));
  return true;
}

/**
 * Stops every device of a user (sign-out everywhere, a password change). The caller bumps the auth version, which
 * makes every cached token be read again.
 */
export async function revokeAllCaptureDevices(owner: CaptureOwner, exceptDeviceId?: number): Promise<void> {
  await getDb()
    .update(captureDevices)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(captureDevices.userId, owner.userId),
        eq(captureDevices.userType, owner.userType),
        isNull(captureDevices.revokedAt),
        exceptDeviceId ? ne(captureDevices.id, exceptDeviceId) : undefined,
      ),
    );
}

/** Notes that a device was heard from. */
export async function touchCaptureDevice(deviceId: number, withSignal: boolean): Promise<void> {
  const now = new Date();
  await getDb()
    .update(captureDevices)
    .set(withSignal ? { lastSeenAt: now, lastSignalAt: now } : { lastSeenAt: now })
    .where(eq(captureDevices.id, deviceId));
}
