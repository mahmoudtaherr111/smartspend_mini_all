/**
 * The routes phones call with a device token to send captured bank and wallet notifications (decision 0028):
 * `POST /api/capture/v1/signals`, `GET /api/capture/v1/config`, `POST /api/capture/v1/actions` (a notification's
 * button), `GET /api/capture/v1/notices` (the questions the model's readings left, decision 0031) and
 * `POST /api/capture/v1/heartbeat` (the phone's health, decision 0034). They are plain HTTP, not tRPC, because native code calls them while the app is closed: real status codes,
 * `Retry-After`, a body limit and a contract (`contracts/capture-intake.ts`) Kotlin and Swift test against.
 *
 * Every request must send `Content-Type: application/json`: the CSRF check refuses a POST without it. A phone sends its
 * build in `X-Client-Version`; one older than `CAPTURE_MIN_CLIENT_VERSION` is answered 426 (decision 0033).
 */
import type { Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import {
  CAPTURE_API_VERSION,
  CAPTURE_BATCH_MAX,
  CAPTURE_BODY_MAX_BYTES,
  CAPTURE_DEVICE_HEADER,
  CAPTURE_TEXT_MAX,
  captureActionRequestSchema,
  captureHeartbeatSchema,
  captureSignalsRequestSchema,
  type CaptureConfig,
  type CaptureError,
} from "../contracts/capture-intake";
import { captureOpenFor, olderThan, secondsToNextBusinessDay, takeDailySignals } from "./lib/capture/access";
import { takeCaptureNotices, wakeCaptureModel } from "./lib/capture/ai-queue";
import { recordHeartbeat } from "./lib/capture/care";
import { getCaptureCatalog, sourcesForPhones } from "./lib/capture/catalog";
import { captureConsentsOf } from "./lib/capture/consent";
import { resolveCaptureDevice, touchCaptureDevice, type CaptureDevice } from "./lib/capture/devices";
import { CAPTURE_GATE, answerEvent, ingestSignals } from "./lib/capture/intake";
import { createLogger } from "./lib/log";
import { createRateLimiter } from "./lib/rate-limit";
import { getSystemSettings } from "./lib/settings-cache";

const log = createLogger("capture-routes");

/** Builds older than this are told to update. */
export const CAPTURE_MIN_CLIENT_VERSION = "1.0.0";

// A phone sends a batch when it comes back online and a few a minute at most; a notification's button is one tap.
const signalBatches = createRateLimiter(6, 60_000);
const actionTaps = createRateLimiter(30, 60_000);
// The phone asks a few times after a batch with queued signals.
const noticeReads = createRateLimiter(20, 60_000);
// A phone reports its health every few hours.
const heartbeats = createRateLimiter(12, 3_600_000);

const fail = (c: Context, status: 400 | 401 | 403 | 404 | 413 | 426 | 429 | 503, error: CaptureError) => c.json({ error }, status);

/** Open to this device's user and platform: the switch, the platforms and the beta list (decision 0033). */
async function captureOpen(device: CaptureDevice): Promise<boolean> {
  return captureOpenFor(await getSystemSettings(), device, device.platform);
}

async function deviceOf(c: Context): Promise<CaptureDevice | null> {
  return resolveCaptureDevice(c.req.header(CAPTURE_DEVICE_HEADER));
}

/** A build older than the oldest allowed; a phone that sends no version is not refused. */
function tooOld(c: Context): boolean {
  const version = c.req.header("x-client-version");
  return Boolean(version && olderThan(version, CAPTURE_MIN_CLIENT_VERSION));
}

async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}

async function underLimit(limiter: ReturnType<typeof createRateLimiter>, key: string): Promise<boolean> {
  try {
    await limiter.hit(key);
    return true;
  } catch {
    return false;
  }
}

export function registerCaptureRoutes(app: Hono): void {
  const limit = bodyLimit({ maxSize: CAPTURE_BODY_MAX_BYTES, onError: (c) => fail(c, 413, "invalid_request") });

  app.post("/api/capture/v1/signals", limit, async (c) => {
    const device = await deviceOf(c);
    if (!device) return fail(c, 401, "invalid_device");
    if (tooOld(c)) return fail(c, 426, "update_required");
    if (!(await captureOpen(device))) return fail(c, 503, "capture_disabled");
    if (!(await underLimit(signalBatches, `capture:signals:${device.deviceId}`))) {
      c.header("Retry-After", "15");
      return fail(c, 429, "rate_limited");
    }
    const parsed = captureSignalsRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, 400, "invalid_request");
    if (!(await captureConsentsOf(device)).capture) return fail(c, 403, "consent_required");
    // The day's signals of all the user's phones: past the cap, the batch waits until Cairo midnight.
    const dailyLimit = Number.parseInt((await getSystemSettings()).capture_daily_signal_limit ?? "1000", 10) || 0;
    if (!(await takeDailySignals(device, parsed.data.signals.length, dailyLimit))) {
      c.header("Retry-After", String(secondsToNextBusinessDay()));
      return fail(c, 429, "rate_limited");
    }

    const results = await ingestSignals(device, parsed.data);
    await touchCaptureDevice(device.deviceId, true);
    if (results.some((result) => result.result === "queued")) wakeCaptureModel();
    return c.json({ results });
  });

  app.post("/api/capture/v1/heartbeat", limit, async (c) => {
    const device = await deviceOf(c);
    if (!device) return fail(c, 401, "invalid_device");
    if (!(await underLimit(heartbeats, `capture:heartbeat:${device.deviceId}`))) {
      c.header("Retry-After", "3600");
      return fail(c, 429, "rate_limited");
    }
    const parsed = captureHeartbeatSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, 400, "invalid_request");
    await recordHeartbeat(device, parsed.data);
    return c.json({ ok: true });
  });

  app.get("/api/capture/v1/notices", async (c) => {
    const device = await deviceOf(c);
    if (!device) return fail(c, 401, "invalid_device");
    if (!(await underLimit(noticeReads, `capture:notices:${device.deviceId}`))) {
      c.header("Retry-After", "15");
      return fail(c, 429, "rate_limited");
    }
    return c.json(await takeCaptureNotices(device));
  });

  app.get("/api/capture/v1/config", async (c) => {
    const device = await deviceOf(c);
    if (!device) return fail(c, 401, "invalid_device");
    const [enabled, consent, catalog] = await Promise.all([captureOpen(device), captureConsentsOf(device), getCaptureCatalog()]);
    await touchCaptureDevice(device.deviceId, false);
    const config: CaptureConfig = {
      apiVersion: CAPTURE_API_VERSION,
      enabled,
      consent,
      minClientVersion: CAPTURE_MIN_CLIENT_VERSION,
      catalogVersion: catalog.version,
      sources: sourcesForPhones(catalog),
      gate: CAPTURE_GATE,
      batchMax: CAPTURE_BATCH_MAX,
      textMax: CAPTURE_TEXT_MAX,
    };
    return c.json(config);
  });

  app.post("/api/capture/v1/actions", limit, async (c) => {
    const device = await deviceOf(c);
    if (!device) return fail(c, 401, "invalid_device");
    if (tooOld(c)) return fail(c, 426, "update_required");
    if (!(await underLimit(actionTaps, `capture:actions:${device.deviceId}`))) {
      c.header("Retry-After", "15");
      return fail(c, 429, "rate_limited");
    }
    const parsed = captureActionRequestSchema.safeParse(await readJson(c));
    if (!parsed.success) return fail(c, 400, "invalid_request");
    try {
      const outcome = await answerEvent(device, parsed.data.eventId, { action: parsed.data.action }, device.deviceId);
      return c.json(outcome);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "NOT_FOUND") return fail(c, 404, "not_found");
      if (code === "BAD_REQUEST") return fail(c, 400, "invalid_request");
      log.error({ err, event: "capture.action.failed", deviceId: device.deviceId }, "Capture action failed");
      throw err;
    }
  });
}
