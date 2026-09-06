/**
 * SMS Ingestion Router — SmartSpend
 * Receives financial SMS from iOS Shortcuts (or any automation tool),
 * extracts source evidence and persists owner-scoped review drafts.
 * A separate authenticated confirmation saves validated financial records.
 *
 * Endpoints:
 *   POST /api/sms/ingest  — Main ingestion endpoint (uses Webhook Token auth)
 *   POST /api/sms/token/generate — Generate a new webhook token (requires user session)
 *   GET  /api/sms/token   — Get current token (requires user session)
 *   GET  /api/sms/logs    — Get SMS processing logs (requires user session)
 */
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getDb } from "./queries/connection";
import {
  webhookTokens,
  rawSmsEvents,
  financialCaptures,
  users,
  localUsers,
} from "../db/schema";
import { eq, and, desc, gte, lt, sql } from "drizzle-orm";
import {
  notificationInputSchema,
  notificationToDraft,
} from "./lib/notification-evidence";
import {
  createCapture,
  captureHash,
  findCaptureForRequest,
} from "./services/financial-capture-store";
import { getSystemSettings } from "./lib/settings-cache";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { validateActiveSessionToken } from "./lib/session-validation";
import { getCookie } from "hono/cookie";
import { businessMonthRange } from "./lib/app-time";

export const smsApp = new Hono();
smsApp.onError((_error, c) => {
  // Database errors can include a webhook credential in bound query parameters.
  console.warn("[SMS] Request could not be completed; retry is required");
  return c.json(
    { error: "تعذر إكمال الطلب. احتفظ بالإشعار وأعد المحاولة." },
    503,
  );
});
smsApp.use(
  "/ingest",
  bodyLimit({
    maxSize: 80_000,
    onError: (c) => c.json({ error: "Notification body too large" }, 413),
  }),
);

// ─── Rate limit: simple in-memory per-token tracker ───
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // max 30 SMS per hour per token

// Auto-cleanup expired rate limiter entries every 5 minutes to prevent memory leak
setInterval(
  () => {
    const now = Date.now();
    for (const [token, entry] of rateLimitMap) {
      if (entry.resetAt < now) {
        rateLimitMap.delete(token);
      }
    }
  },
  5 * 60 * 1000,
);

function checkRateLimit(token: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(token);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(token, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ─── Magic Code Store (for zero-config iOS Shortcut setup) ───
const magicCodes = new Map<
  string,
  {
    webhookToken: string;
    userId: number;
    userType: string;
    expiresAt: number;
  }
>();

// Auto-cleanup expired codes every 2 minutes
setInterval(
  () => {
    const now = Date.now();
    for (const [code, entry] of magicCodes) {
      if (entry.expiresAt < now) magicCodes.delete(code);
    }
  },
  2 * 60 * 1000,
);

/** Generate a short, human-friendly 6-char code (no confusing chars like 0/O, 1/I/L) */
function generateShortCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

/** Store a magic code tied to a user's webhook token. Returns the 6-char code. */
export function storeMagicCode(
  webhookToken: string,
  userId: number,
  userType: string,
): string {
  // Revoke any existing codes for this user first
  for (const [code, entry] of magicCodes) {
    if (entry.userId === userId && entry.userType === userType) {
      magicCodes.delete(code);
    }
  }
  const code = generateShortCode();
  magicCodes.set(code, {
    webhookToken,
    userId,
    userType,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  });
  return code;
}

/** Exchange a magic code for the real webhook token. One-time use. */
function exchangeMagicCode(code: string): { token: string } | null {
  const normalized = code.toUpperCase().trim();
  const entry = magicCodes.get(normalized);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    magicCodes.delete(normalized);
    return null;
  }
  // One-time use: delete after successful exchange
  magicCodes.delete(normalized);
  return { token: entry.webhookToken };
}

// ─── Helper: resolve user from session JWT (for protected endpoints) ───
async function getUserFromSession(c: Context): Promise<{
  id: number;
  type: "local" | "oauth";
} | null> {
  // 1. Try Google OAuth cookie first
  const googleToken = getCookie(c, "google_session");
  if (googleToken) {
    const activeSession = await validateActiveSessionToken(
      googleToken,
      "oauth",
    );
    if (activeSession)
      return { id: activeSession.userId, type: activeSession.userType };
  }

  // 2. Try Bearer token in Authorization header
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      const activeSession = await validateActiveSessionToken(token);
      if (activeSession)
        return { id: activeSession.userId, type: activeSession.userType };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sms/ingest
// Called by iOS Shortcut. Authenticates via Bearer token in Authorization header
// or via ?token=... query parameter.
// ─────────────────────────────────────────────────────────────────────────────
smsApp.post("/ingest", async (c) => {
  const db = getDb();
  let token = "";

  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  } else {
    token = c.req.query("token")?.trim() || "";
  }

  if (!token) {
    return c.json({ error: "Missing webhook token (Header or Query)" }, 401);
  }

  // Validate token against DB
  const [tokenRecord] = await db
    .select()
    .from(webhookTokens)
    .where(eq(webhookTokens.token, token))
    .limit(1);

  if (!tokenRecord) {
    return c.json({ error: "Invalid webhook token" }, 403);
  }

  // Rate limit check
  if (!checkRateLimit(token)) {
    return c.json({ error: "Rate limit exceeded. Max 30 SMS per hour." }, 429);
  }

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const validated = notificationInputSchema.safeParse(rawBody);
  if (!validated.success)
    return c.json({ error: "Invalid notification fields" }, 400);
  const input = validated.data;
  const owner = {
    id: tokenRecord.userId,
    type: tokenRecord.userType as "local" | "oauth",
  };
  if (!["local", "oauth"].includes(owner.type))
    return c.json({ error: "Invalid owner" }, 403);
  const table = owner.type === "oauth" ? users : localUsers;
  const [ownerRow] = await db
    .select({ id: table.id, plan: table.plan })
    .from(table)
    .where(eq(table.id, owner.id))
    .limit(1);
  if (!ownerRow) return c.json({ error: "Account unavailable" }, 403);
  const draft = notificationToDraft(input);
  // OTP is discarded before durable storage, telemetry or provider calls.
  if (draft.ignoredReason === "sensitive_authentication")
    return c.json({ received: true, saved: false, status: "ignored" });
  const key =
    input.eventId ||
    captureHash([input.sender || "", input.message, input.timestamp || ""]);
  try {
    const fingerprint = captureHash([
      input.sender || "",
      input.message,
      input.timestamp || "",
    ]);
    const existing = await findCaptureForRequest(owner, key, fingerprint);
    if (!existing && !draft.ignoredReason) {
      const plan = ownerRow.plan || "free";
      const settings = await getSystemSettings();
      const configured = Number(settings[`sms_limit_${plan}`]);
      const limit =
        Number.isFinite(configured) &&
        configured >= 0 &&
        settings[`sms_limit_${plan}`] !== undefined
          ? configured
          : plan === "free"
            ? 5
            : 999999;
      const month = businessMonthRange();
      const [used] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(financialCaptures)
        .where(
          and(
            eq(financialCaptures.userId, owner.id),
            eq(financialCaptures.userType, owner.type),
            gte(financialCaptures.createdAt, month.start),
            lt(financialCaptures.createdAt, month.endExclusive),
            sql`${financialCaptures.state} != 'ignored'`,
            sql`JSON_UNQUOTE(JSON_EXTRACT(${financialCaptures.draft}, '$.channel')) IN ('sms','android_notification','ios_shortcut')`,
          ),
        );
      const [legacyUsed] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(rawSmsEvents)
        .where(
          and(
            eq(rawSmsEvents.userId, owner.id),
            eq(rawSmsEvents.userType, owner.type),
            eq(rawSmsEvents.status, "processed"),
            gte(rawSmsEvents.createdAt, month.start),
            lt(rawSmsEvents.createdAt, month.endExclusive),
          ),
        );
      if (Number(used.count) + Number(legacyUsed.count) >= limit)
        return c.json(
          {
            error:
              "وصلت للحد الشهري للإشعارات. احتفظ بالرسالة وأعد المحاولة بعد تجديد الحد.",
            limit,
          },
          429,
        );
    }
    const capture =
      existing || (await createCapture(owner, key, draft, fingerprint));
    return c.json(
      {
        received: true,
        saved: capture.state === "saved",
        status: capture.state,
        captureId: capture.id,
        version: capture.version,
        reviewUrl: "/dashboard",
        questions: capture.questions,
        receipt: capture.receipt,
      },
      capture.state === "review" ? 202 : 200,
    );
  } catch (error) {
    if (error instanceof TRPCError && error.code === "CONFLICT")
      return c.json({ error: error.message }, 409);
    // Client keeps the same request key and retries; never acknowledge a lost draft.
    return c.json(
      { error: "Unable to retain notification. Retry with the same eventId." },
      503,
    );
  }
});

smsApp.post("/token/generate", async (c) => {
  const db = getDb();
  const user = await getUserFromSession(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Delete old token if any
  await db
    .delete(webhookTokens)
    .where(
      and(
        eq(webhookTokens.userId, user.id as number),
        eq(webhookTokens.userType, user.type),
      ),
    );

  // Generate new secure token
  const newToken = `sms_${randomBytes(32).toString("hex")}`;

  await db.insert(webhookTokens).values({
    userId: user.id as number,
    userType: user.type,
    token: newToken,
    name: "iOS Shortcut Token",
  });

  return c.json({ success: true, token: newToken }, 200);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sms/token
// Returns the current webhook token for the authenticated user.
// ─────────────────────────────────────────────────────────────────────────────
smsApp.get("/token", async (c) => {
  const db = getDb();
  const user = await getUserFromSession(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const [record] = await db
    .select()
    .from(webhookTokens)
    .where(
      and(
        eq(webhookTokens.userId, user.id as number),
        eq(webhookTokens.userType, user.type),
      ),
    )
    .limit(1);

  if (!record) {
    return c.json({ token: null, hasToken: false }, 200);
  }

  return c.json(
    { token: record.token, hasToken: true, createdAt: record.createdAt },
    200,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sms/exchange
// Public endpoint — iOS Shortcut sends its magic code here to get the real
// webhook token + ingest URL. No session auth required.
// ─────────────────────────────────────────────────────────────────────────────
smsApp.post("/exchange", async (c) => {
  let body: { code?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const code = body?.code?.toString().trim();
  if (!code) {
    return c.json({ error: "Missing 'code' field" }, 400);
  }

  const result = exchangeMagicCode(code);
  if (!result) {
    return c.json(
      {
        error: "Invalid or expired code. Generate a new one from the website.",
      },
      401,
    );
  }

  // Build the ingest URL from the request origin (works with any tunnel)
  const origin = new URL(c.req.url).origin;
  return c.json({
    success: true,
    token: result.token,
    ingestUrl: `${origin}/api/sms/ingest`,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sms/shortcut-download?code=XXXXXX
// Public endpoint — generates a personalized .shortcut file with the user's
// token embedded. Uses magic code for auth so no session header is needed.
// ─────────────────────────────────────────────────────────────────────────────
smsApp.get("/shortcut-download", async (c) => {
  const code = c.req.query("code")?.trim();
  if (!code) {
    return c.json({ error: "Missing 'code' parameter" }, 400);
  }

  const result = exchangeMagicCode(code);
  if (!result) {
    return c.json(
      {
        error:
          "Invalid or expired code. Go back to SmartSpend and click Connect iPhone again.",
      },
      401,
    );
  }

  // Build ingest URL from the request origin (works with any tunnel)
  const origin = new URL(c.req.url).origin;
  const ingestUrl = `${origin}/api/sms/ingest`;

  const { generateShortcutFile } = await import("./lib/shortcut-generator");
  const fileBuffer = generateShortcutFile(result.token, ingestUrl);

  return new Response(new Uint8Array(fileBuffer), {
    headers: {
      "Content-Type": "application/x-apple-shortcut",
      "Content-Disposition": 'attachment; filename="SmartSpend SMS.shortcut"',
      "Cache-Control": "no-store",
    },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sms/logs
// Returns last 50 SMS processing logs for the authenticated user.
// ─────────────────────────────────────────────────────────────────────────────
smsApp.get("/logs", async (c) => {
  const db = getDb();
  const user = await getUserFromSession(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const logs = await db
    .select()
    .from(rawSmsEvents)
    .where(
      and(
        eq(rawSmsEvents.userId, user.id as number),
        eq(rawSmsEvents.userType, user.type),
      ),
    )
    .orderBy(desc(rawSmsEvents.createdAt))
    .limit(50);

  return c.json({ logs }, 200);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sms/android-connect
// Called from the web when user taps "Connect Android".
// Generates/fetches token, then returns a deep-link URL the browser opens.
// The deep link opens SmartSpend Sync APK with token pre-filled (no copy/paste).
// ─────────────────────────────────────────────────────────────────────────────
smsApp.get("/android-connect", async (c) => {
  const db = getDb();
  const user = await getUserFromSession(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Fetch existing token or create one
  let [record] = await db
    .select()
    .from(webhookTokens)
    .where(
      and(
        eq(webhookTokens.userId, user.id as number),
        eq(webhookTokens.userType, user.type),
      ),
    )
    .limit(1);

  if (!record) {
    const newToken = `sms_${randomBytes(32).toString("hex")}`;
    await db.insert(webhookTokens).values({
      userId: user.id as number,
      userType: user.type,
      token: newToken,
      name: "Android Sync Token",
    });
    [record] = await db
      .select()
      .from(webhookTokens)
      .where(
        and(
          eq(webhookTokens.userId, user.id as number),
          eq(webhookTokens.userType, user.type),
        ),
      )
      .limit(1);
  }

  const origin = new URL(c.req.url).origin;
  const ingestUrl = `${origin}/api/sms/ingest`;

  // Deep link format: smartspend://connect?token=TOKEN&url=INGEST_URL
  const deepLink = `smartspend://connect?token=${encodeURIComponent(record.token)}&url=${encodeURIComponent(ingestUrl)}`;

  return c.json({
    success: true,
    deepLink,
    token: record.token,
    ingestUrl,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sms/android-status
// Called by the Android APK on startup to confirm it's alive.
// Authenticated via Bearer token (same webhook token).
// ─────────────────────────────────────────────────────────────────────────────
smsApp.post("/android-status", async (c) => {
  const db = getDb();
  let token = "";
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) token = authHeader.slice(7).trim();
  else token = c.req.query("token")?.trim() || "";

  if (!token) return c.json({ error: "Missing token" }, 401);

  const [tokenRecord] = await db
    .select()
    .from(webhookTokens)
    .where(eq(webhookTokens.token, token))
    .limit(1);

  if (!tokenRecord) return c.json({ error: "Invalid token" }, 403);

  let body: {
    appVersion?: string;
    androidVersion?: string;
    deviceModel?: string;
  } = {};
  try {
    body = await c.req.json();
  } catch {
    /* optional body */
  }

  console.log(
    `[Android Status] User ${tokenRecord.userId} | App v${body.appVersion || "?"} | Android ${body.androidVersion || "?"} | ${body.deviceModel || "?"}`,
  );

  return c.json({
    success: true,
    status: "connected",
    message: "SmartSpend Sync is active ✅",
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sms/metrics
// Returns transaction parsing statistics, success rates, and provider metrics
// ─────────────────────────────────────────────────────────────────────────────
smsApp.get("/metrics", async (c) => {
  const db = getDb();
  const user = await getUserFromSession(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const events = await db
    .select()
    .from(rawSmsEvents)
    .where(
      and(
        eq(rawSmsEvents.userId, user.id as number),
        eq(rawSmsEvents.userType, user.type),
      ),
    )
    .orderBy(desc(rawSmsEvents.createdAt))
    .limit(1000);

  const total = events.length;
  let processed = 0;
  let ignored = 0;
  let error = 0;

  let rulesCount = 0;
  let aiCount = 0;
  let fallbackCount = 0;

  const providerStats: Record<string, { total: number; failed: number }> = {};

  for (const e of events) {
    if (e.status === "processed") processed++;
    else if (e.status === "ignored") ignored++;
    else if (e.status === "error") error++;

    const meta = e.metadata as any;
    const parsedBy = meta?.parsed_by || "unknown";
    if (parsedBy === "rules") rulesCount++;
    else if (parsedBy === "ai") aiCount++;
    else if (parsedBy === "rules_fallback") fallbackCount++;

    const provider = meta?.provider || meta?.rule_result?.provider || "Unknown";
    if (!providerStats[provider]) {
      providerStats[provider] = { total: 0, failed: 0 };
    }
    providerStats[provider].total++;
    if (e.status === "ignored" && meta?.reason === "low_confidence") {
      providerStats[provider].failed++;
    }
  }

  const failCount =
    error +
    events.filter((e) => (e.metadata as any)?.reason === "low_confidence")
      .length;
  const accuracyRate =
    processed + failCount > 0 ? processed / (processed + failCount) : 1.0;

  return c.json(
    {
      success: true,
      metrics: {
        totalReceived: total,
        statusBreakdown: { processed, ignored, error },
        parserBreakdown: {
          rules: rulesCount,
          ai: aiCount,
          fallback: fallbackCount,
        },
        accuracyRate: Math.round(accuracyRate * 100) / 100,
        providerBreakdown: providerStats,
      },
    },
    200,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sms/unparsed
// Returns the 50 most recent failed/ignored bank transactions for review/audit
// ─────────────────────────────────────────────────────────────────────────────
smsApp.get("/unparsed", async (c) => {
  const db = getDb();
  const user = await getUserFromSession(c);

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const unparsedEvents = await db
    .select()
    .from(rawSmsEvents)
    .where(
      and(
        eq(rawSmsEvents.userId, user.id as number),
        eq(rawSmsEvents.userType, user.type),
        eq(rawSmsEvents.status, "ignored"),
      ),
    )
    .orderBy(desc(rawSmsEvents.createdAt))
    .limit(100);

  const filtered = unparsedEvents
    .filter((e) => {
      const meta = e.metadata as any;
      return (
        meta?.reason === "low_confidence" || meta?.reason === "AI returned null"
      );
    })
    .slice(0, 50);

  return c.json(
    {
      success: true,
      unparsed: filtered.map((e) => ({
        id: e.id,
        sender: e.sender,
        message: e.message,
        redactedMessage: e.message, // raw text since database is unredacted
        timestamp: e.smsTimestamp,
        reason: (e.metadata as any)?.reason,
        ruleResult: (e.metadata as any)?.rule_result,
        createdAt: e.createdAt,
      })),
    },
    200,
  );
});
