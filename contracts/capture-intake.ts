/**
 * What a phone sends when it captures a bank, wallet or payment notification, and what the server answers
 * (decision 0028). The routes live under `/api/capture/v1` and are called by native code (Kotlin, Swift) with a
 * device token, never a session, so a capture keeps working while the app is closed and after the session expires.
 *
 * Native code cannot import this file: `contracts/capture-fixtures/` holds the cases both sides test against (the
 * phone's filter with the word lists `/config` sends), so they stay in step.
 */
import { z } from "zod";

export const CAPTURE_API_VERSION = 1;
/** The device token's header. Not `Authorization: Bearer`: the session code reads every Bearer token as a session. */
export const CAPTURE_DEVICE_HEADER = "x-capture-device";
export const CAPTURE_DEVICE_TOKEN_PREFIX = "cap_";

export const CAPTURE_BATCH_MAX = 20;
export const CAPTURE_TEXT_MAX = 2_000;
export const CAPTURE_TITLE_MAX = 200;
export const CAPTURE_BODY_MAX_BYTES = 64 * 1024;
/** A signal older than this is refused: the phone's queue gives up on it. */
export const CAPTURE_SIGNAL_MAX_AGE_DAYS = 30;

/** Where the phone saw the money move. */
export const CAPTURE_CHANNELS = ["notification", "sms", "shortcut", "share"] as const;
export type CaptureChannel = (typeof CAPTURE_CHANNELS)[number];

/** The phone's own id for a signal: it sends the same id again after a lost answer, and the server keeps one. */
const signalId = z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const captureSignalSchema = z.object({
  id: signalId,
  channel: z.enum(CAPTURE_CHANNELS),
  /** The Android package that posted the notification. */
  app: z.string().max(128).nullish(),
  /** The SMS sender or conversation title, as the messaging app showed it. */
  sender: z.string().max(64).nullish(),
  title: z.string().max(CAPTURE_TITLE_MAX).nullish(),
  text: z.string().min(1).max(CAPTURE_TEXT_MAX),
  /** When the phone received it (ISO instant). */
  postedAt: z.string().datetime({ offset: true }),
});
export type CaptureSignal = z.infer<typeof captureSignalSchema>;

export const captureSignalsRequestSchema = z.object({
  signals: z.array(captureSignalSchema).min(1).max(CAPTURE_BATCH_MAX),
  /** The phone's interface language, for the notice the server writes. */
  lang: z.enum(["ar", "en"]).default("ar"),
});
export type CaptureSignalsRequest = z.infer<typeof captureSignalsRequestSchema>;

/**
 * What became of one signal. Every result is final: the phone deletes the text, and a result it does not know is
 * treated the same way.
 * - review: a transaction waiting for the user to confirm it (the notice asks).
 * - merged: another signal of the same payment is already waiting for the user's answer (decision 0029).
 * - held: over the plan's monthly limit: kept two months without a question, recorded if the user upgrades.
 * - recorded / dismissed: the payment was already answered (a retry, or a late signal of an answered payment).
 * - ignored: not a transaction (a code, an offer, a balance, a personal message): nothing is stored.
 * - rejected: the signal is not acceptable (too old, an app the catalog does not list).
 * - queued: the reader was unsure, and the admin's model reads it next (decision 0031); its question, if any, comes
 *   from `GET /api/capture/v1/notices` a few seconds later.
 */
export const CAPTURE_RESULTS = ["review", "merged", "held", "recorded", "dismissed", "ignored", "rejected", "queued"] as const;
export type CaptureResult = (typeof CAPTURE_RESULTS)[number];

/** What the user can answer from the notification without opening the app; "undo" takes back one recorded on its own. */
export const CAPTURE_ACTIONS = ["record", "dismiss", "undo"] as const;
export type CaptureAction = (typeof CAPTURE_ACTIONS)[number];

/** The local notification the phone shows for a signal, written by the server in the phone's language. */
export interface CaptureNotice {
  title: string;
  body: string;
  /** The buttons to show; empty when the user has to open the app (an amount to confirm, a foreign currency). */
  actions: CaptureAction[];
}

export interface CaptureSignalResult {
  id: string;
  result: CaptureResult;
  /** The payment's id (one per payment, whatever number of signals), for the notification's buttons and its id. */
  eventId?: number;
  /** Why it was ignored or rejected, as an id ("otp", "personal_sender", "too_old"). */
  reason?: string;
  notice?: CaptureNotice;
}

export interface CaptureSignalsResponse {
  results: CaptureSignalResult[];
}

/** `GET /api/capture/v1/notices`: the notices of this phone's queued signals read since it last asked. */
export interface CaptureNoticesResponse {
  notices: Array<{ eventId: number; notice: CaptureNotice }>;
  /** This phone's signals still waiting for the model: ask again later when it is more than zero. */
  pending: number;
}

export const captureActionRequestSchema = z.object({
  /** The phone's id for this tap: repeating it changes nothing. */
  actionId: signalId,
  eventId: z.number().int().positive(),
  action: z.enum(CAPTURE_ACTIONS),
});
export type CaptureActionRequest = z.infer<typeof captureActionRequestSchema>;

export interface CaptureActionResponse {
  result: "recorded" | "dismissed";
  expenseId?: number;
}

/** The phone's first filter. Fixed code on the phone reads these lists; the server never sends a pattern. */
export interface CaptureGateConfig {
  schema: 1;
  /** Words that mark a one-time code. With a 4–8 digit number and no currency word, the phone drops the message. */
  otpWords: string[];
  /** Words that mark money. */
  currencyWords: string[];
}

export interface CaptureConfig {
  apiVersion: number;
  /** The admin's switch (`capture_enabled`): when false the phone stops capturing. */
  enabled: boolean;
  consent: { capture: boolean; aiReading: boolean };
  /** Builds older than this stop and ask for an update. */
  minClientVersion: string;
  catalogVersion: string;
  sources: Array<{
    slug: string;
    kind: string;
    nameAr: string;
    nameEn: string;
    androidPackages: string[];
    senderIds: string[];
  }>;
  gate: CaptureGateConfig;
  batchMax: number;
  textMax: number;
}

/** Errors the routes answer with, as `{ error }`. */
export const CAPTURE_ERRORS = [
  "invalid_device",
  "capture_disabled",
  "consent_required",
  "invalid_request",
  "rate_limited",
  "not_found",
  // The build is older than `minClientVersion`: the phone stops sending and asks for an update (HTTP 426).
  "update_required",
] as const;
export type CaptureError = (typeof CAPTURE_ERRORS)[number];

/** Consents a user gives for capture, each with the version of the text they agreed to. */
export const CAPTURE_CONSENT_SCOPES = ["capture", "ai_reading"] as const;
export type CaptureConsentScope = (typeof CAPTURE_CONSENT_SCOPES)[number];
