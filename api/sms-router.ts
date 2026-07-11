/**
 * SMS Ingestion Router — SmartSpend
 * Receives financial SMS from iOS Shortcuts (or any automation tool),
 * parses them via AI, and saves them as Transactions.
 *
 * Endpoints:
 *   POST /api/sms/ingest  — Main ingestion endpoint (uses Webhook Token auth)
 *   POST /api/sms/token/generate — Generate a new webhook token (requires user session)
 *   GET  /api/sms/token   — Get current token (requires user session)
 *   GET  /api/sms/logs    — Get SMS processing logs (requires user session)
 */
import { Hono } from "hono";
import { getDb } from "./queries/connection";
import {
  webhookTokens,
  rawSmsEvents,
  expenses,
  users,
  localUsers,
} from "../db/schema";
import { eq, and, desc, gte } from "drizzle-orm";
import {
  parseSmsFinancialData,
  mapSmsToExpenseCategory,
} from "./lib/sms-ai-parser";
import { parseSmsByRules } from "./lib/sms-rule-parser";
import { randomBytes } from "crypto";
import { verify } from "hono/jwt";
import { env } from "./lib/env";
import { getCookie } from "hono/cookie";

export const smsApp = new Hono();

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
async function getUserFromSession(c: any): Promise<{
  id: number;
  type: "local" | "oauth";
} | null> {
  // 1. Try Google OAuth cookie first
  const googleToken = getCookie(c, "google_session");
  if (googleToken) {
    try {
      const payload = (await verify(googleToken, env.JWT_SECRET, "HS256")) as any;
      if (payload?.userId) {
        return { id: Number(payload.userId), type: "oauth" };
      }
    } catch {
      // ignore and try header
    }
  }

  // 2. Try Bearer token in Authorization header
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token) {
      try {
        const payload = (await verify(token, env.JWT_SECRET, "HS256")) as any;
        if (payload?.userId && payload?.userType) {
          return { id: Number(payload.userId), type: payload.userType as "local" | "oauth" };
        }
      } catch {
        return null;
      }
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

  // Parse request body
  let body: {
    message?: string;
    sender?: string;
    timestamp?: string;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  const { message, sender, timestamp } = body;

  if (!message || typeof message !== "string" || message.trim().length < 5) {
    return c.json({ error: "Missing or too short 'message' field" }, 400);
  }

  const userId = tokenRecord.userId;
  const userType = tokenRecord.userType as "local" | "oauth";

  // ── Plan-based limits ──
  const userTable = userType === "oauth" ? users : localUsers;
  const [userRecord] = await db
    .select()
    .from(userTable)
    .where(eq(userTable.id, userId as any))
    .limit(1);
  const userPlan = (userRecord as any)?.plan || "free";

  // Get configurable limit from system_settings (admin dashboard), default: free=5, pro/ultra=unlimited
  let smsMonthlyLimit = userPlan === "free" ? 5 : 999999;
  try {
    const { systemSettings } = await import("../db/schema");
    const [setting] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, `sms_limit_${userPlan}`))
      .limit(1);
    if (setting?.value)
      smsMonthlyLimit = parseInt(setting.value) || smsMonthlyLimit;
  } catch {
    /* use default */
  }

  // Count processed SMS this month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const { sql: sqlFn } = await import("drizzle-orm");
  const [countResult] = await db
    .select({ count: sqlFn`COUNT(*)` })
    .from(rawSmsEvents)
    .where(
      and(
        eq(rawSmsEvents.userId, userId),
        eq(rawSmsEvents.userType, userType),
        eq(rawSmsEvents.status, "processed"),
        gte(rawSmsEvents.createdAt, monthStart),
      ),
    );
  const usedThisMonth = Number((countResult as any)?.count || 0);

  if (usedThisMonth >= smsMonthlyLimit) {
    return c.json(
      {
        error: `الحد الشهري للرسائل (${smsMonthlyLimit}) انتهى. قم بترقية خطتك لزيادة الحد.`,
        limit: smsMonthlyLimit,
        used: usedThisMonth,
        plan: userPlan,
      },
      403,
    );
  }

  // Prevent duplicate SMS submissions (same user, exact message within last 24h)
  const duplicateCheck = await db
    .select({ id: rawSmsEvents.id })
    .from(rawSmsEvents)
    .where(
      and(
        eq(rawSmsEvents.userId, userId),
        eq(rawSmsEvents.userType, userType),
        eq(rawSmsEvents.message, message.trim()),
        gte(rawSmsEvents.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      )
    )
    .limit(1);

  if (duplicateCheck.length > 0) {
    return c.json({ success: true, message: "Duplicate SMS detected, ignored." });
  }

  // ── Step 1: Store raw SMS event (Original raw text stored for admin visibility) ──
  const [insertedSms] = await db
    .insert(rawSmsEvents)
    .values({
      userId,
      userType,
      message: message.trim(),
      sender: sender || null,
      smsTimestamp: timestamp || new Date().toISOString(),
      status: "pending",
    })
    .$returningId();

  const smsId = insertedSms?.id;

  // ── Step 2: Try Rule-Based Parser first (zero cost) ──
  let parseResult: any = null;
  let parsedBy = "rules";

  const ruleResult = parseSmsByRules(message.trim(), sender?.trim());
  console.log(
    `[SMS Ingest] Rule parser: detected=${ruleResult.transaction_detected}, amount=${ruleResult.amount}, dir=${ruleResult.direction}, conf=${ruleResult.confidence.toFixed(2)}, rule=${ruleResult.matched_rule}`,
  );

  if (
    ruleResult.transaction_detected &&
    ruleResult.confidence >= 0.85 &&
    ruleResult.amount &&
    ruleResult.direction
  ) {
    // High confidence rule match (Amount & Direction detected by specific rule) — no AI needed
    parseResult = {
      transaction_detected: true,
      amount: ruleResult.amount,
      currency: ruleResult.currency,
      direction: ruleResult.direction,
      provider: ruleResult.provider,
      category: ruleResult.category,
      fee: ruleResult.fee,
      balance_after: ruleResult.balance_after,
      confidence: ruleResult.confidence,
    };
    parsedBy = "rules";
  } else {
    // Fallback to AI for edge cases or if direction is missing
    console.log(
      `[SMS Ingest] Rule confidence low or missing data (${ruleResult.confidence.toFixed(2)}, rule=${ruleResult.matched_rule}), falling back to AI...`,
    );
    try {
      const aiResult = await parseSmsFinancialData(message.trim());
      if (aiResult && aiResult.transaction_detected) {
        parseResult = aiResult;
        parsedBy = "ai";
      } else if (ruleResult.transaction_detected) {
        // If AI says no transaction but rules said yes (rare), trust AI but log it
        parseResult = aiResult;
      }
    } catch (aiErr) {
      console.error("[SMS Ingest] AI parsing error:", aiErr);
      // Absolute fallback if AI fails but rules had *something*
      if (ruleResult.transaction_detected && ruleResult.amount) {
        parseResult = ruleResult;
        parsedBy = "rules_fallback";
      }
    }
  }

  if (!parseResult) {
    if (smsId) {
      await db
        .update(rawSmsEvents)
        .set({
          status: "ignored",
          metadata: {
            reason: "AI returned null",
            rule_result: {
              transaction_detected: ruleResult.transaction_detected,
              amount: ruleResult.amount,
              direction: ruleResult.direction,
              confidence: ruleResult.confidence,
              matched_rule: ruleResult.matched_rule,
              provider: ruleResult.provider,
            },
          },
        })
        .where(eq(rawSmsEvents.id, smsId));
    }
    return c.json(
      {
        success: true,
        transaction_detected: false,
        reason: "Could not parse SMS",
      },
      200,
    );
  }

  // ── Step 3: Business Logic ──
  if (!parseResult.transaction_detected || parseResult.confidence < 0.6) {
    // Not financial or low confidence → ignore
    if (smsId) {
      await db
        .update(rawSmsEvents)
        .set({
          status: "ignored",
          metadata: {
            reason: !parseResult.transaction_detected
              ? "not_financial"
              : "low_confidence",
            confidence: parseResult.confidence,
            parsed_by: parsedBy,
            rule_result: {
              transaction_detected: ruleResult.transaction_detected,
              amount: ruleResult.amount,
              direction: ruleResult.direction,
              confidence: ruleResult.confidence,
              matched_rule: ruleResult.matched_rule,
              provider: ruleResult.provider,
            },
          },
        })
        .where(eq(rawSmsEvents.id, smsId));
    }
    return c.json(
      {
        success: true,
        transaction_detected: false,
        reason: !parseResult.transaction_detected
          ? "not_financial"
          : "low_confidence",
        confidence: parseResult.confidence,
        rule_result: {
          transaction_detected: ruleResult.transaction_detected,
          amount: ruleResult.amount,
          direction: ruleResult.direction,
          confidence: ruleResult.confidence,
          matched_rule: ruleResult.matched_rule,
          provider: ruleResult.provider,
        },
      },
      200,
    );
  }

  // ── Step 4: Save as Transaction ──
  const { category, subCategory, type } = mapSmsToExpenseCategory(parseResult);

  const descriptionParts = [
    parseResult.provider !== "Unknown" ? parseResult.provider : null,
    parseResult.merchant || null,
    sender ? `من: ${sender}` : null,
  ].filter(Boolean);

  const description = descriptionParts.join(" — ") || "SMS تلقائي";

  const transactionDate = timestamp ? new Date(timestamp) : new Date();

  await db.insert(expenses).values({
    userId,
    userType,
    type,
    amount: parseResult.amount!.toString(),
    category,
    subCategory,
    description,
    rawText: message.trim(),
    source: "sms",
    date: transactionDate,
    parsedMetadata: {
      sms_id: smsId,
      provider: parseResult.provider,
      direction: parseResult.direction,
      sms_category: parseResult.category,
      confidence: parseResult.confidence,
      fee: parseResult.fee,
      balance_after: parseResult.balance_after,
      parsed_by: parsedBy,
    },
  });

  // ── Step 5: Update SMS status ──
  if (smsId) {
    await db
      .update(rawSmsEvents)
      .set({
        status: "processed",
        metadata: {
          transaction_saved: true,
          amount: parseResult.amount,
          category,
          type,
          confidence: parseResult.confidence,
          parsed_by: parsedBy,
        },
      })
      .where(eq(rawSmsEvents.id, smsId));
  }

  console.log(
    `✅ [SMS Ingest] User ${userId} | ${type} | ${parseResult.amount} EGP | ${category} | ${parseResult.provider}`,
  );

  return c.json(
    {
      success: true,
      transaction_detected: true,
      saved: true,
      amount: parseResult.amount,
      currency: parseResult.currency,
      direction: parseResult.direction,
      provider: parseResult.provider,
      category,
      subCategory,
      type,
      confidence: parseResult.confidence,
    },
    200,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sms/token/generate
// Generates a new webhook token for the authenticated user.
// Requires standard JWT session (same as other tRPC endpoints).
// ─────────────────────────────────────────────────────────────────────────────
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
