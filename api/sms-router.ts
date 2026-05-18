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
import { eq, and, desc } from "drizzle-orm";
import { parseSmsFinancialData, mapSmsToExpenseCategory } from "./lib/sms-ai-parser";
import { parseSmsByRules } from "./lib/sms-rule-parser";
import { randomBytes } from "crypto";
import { verify } from "hono/jwt";
import { env } from "./lib/env";

export const smsApp = new Hono();

// ─── Rate limit: simple in-memory per-token tracker ───
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 30; // max 30 SMS per hour per token

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

// ─── Helper: resolve user from session JWT (for protected endpoints) ───
async function getUserFromSession(authHeader: string | undefined): Promise<{
  id: number | string;
  type: "local" | "oauth";
} | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const payload = await verify(token, env.JWT_SECRET) as any;
    if (!payload?.userId || !payload?.userType) return null;
    return { id: payload.userId, type: payload.userType as "local" | "oauth" };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sms/ingest
// Called by iOS Shortcut. Authenticates via Bearer token in Authorization header.
// ─────────────────────────────────────────────────────────────────────────────
smsApp.post("/ingest", async (c) => {
  const db = getDb();
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(7).trim();

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
  const [userRecord] = await db.select().from(userTable).where(eq(userTable.id, userId as any)).limit(1);
  const userPlan = (userRecord as any)?.plan || "free";

  // Get configurable limit from system_settings (admin dashboard), default: free=5, pro/ultra=unlimited
  let smsMonthlyLimit = userPlan === "free" ? 5 : 999999;
  try {
    const { systemSettings } = await import("../db/schema");
    const [setting] = await db.select().from(systemSettings).where(eq(systemSettings.key, `sms_limit_${userPlan}`)).limit(1);
    if (setting?.value) smsMonthlyLimit = parseInt(setting.value) || smsMonthlyLimit;
  } catch { /* use default */ }

  // Count processed SMS this month
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const { sql: sqlFn } = await import("drizzle-orm");
  const [countResult] = await db.select({ count: sqlFn`COUNT(*)` })
    .from(rawSmsEvents)
    .where(and(
      eq(rawSmsEvents.userId, userId),
      eq(rawSmsEvents.userType, userType),
      eq(rawSmsEvents.status, "processed"),
    ));
  const usedThisMonth = Number((countResult as any)?.count || 0);

  if (usedThisMonth >= smsMonthlyLimit) {
    return c.json({
      error: `الحد الشهري للرسائل (${smsMonthlyLimit}) انتهى. قم بترقية خطتك لزيادة الحد.`,
      limit: smsMonthlyLimit,
      used: usedThisMonth,
      plan: userPlan,
    }, 403);
  }

  // ── Step 1: Store raw SMS event ──
  const [insertedSms] = await db.insert(rawSmsEvents).values({
    userId,
    userType,
    message: message.trim(),
    sender: sender || null,
    smsTimestamp: timestamp || new Date().toISOString(),
    status: "pending",
  }).$returningId();

  const smsId = insertedSms?.id;

  // ── Step 2: Try Rule-Based Parser first (zero cost) ──
  let parseResult: any = null;
  let parsedBy = "rules";

  const ruleResult = parseSmsByRules(message.trim());
  console.log(`[SMS Ingest] Rule parser: detected=${ruleResult.transaction_detected}, amount=${ruleResult.amount}, conf=${ruleResult.confidence.toFixed(2)}, rule=${ruleResult.matched_rule}`);

  if (ruleResult.transaction_detected && ruleResult.confidence >= 0.75 && ruleResult.amount) {
    // High confidence rule match — no AI needed (saves cost)
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
    // Fallback to AI for edge cases
    console.log(`[SMS Ingest] Rule confidence low (${ruleResult.confidence.toFixed(2)}), falling back to AI...`);
    try {
      const aiResult = await parseSmsFinancialData(message.trim());
      if (aiResult) {
        parseResult = aiResult;
        parsedBy = "ai";
      }
    } catch (aiErr) {
      console.error("[SMS Ingest] AI parsing error:", aiErr);
    }
  }

  if (!parseResult) {
    if (smsId) {
      await db.update(rawSmsEvents)
        .set({ status: "ignored", metadata: { reason: "AI returned null" } })
        .where(eq(rawSmsEvents.id, smsId));
    }
    return c.json({ success: true, transaction_detected: false, reason: "Could not parse SMS" }, 200);
  }

  // ── Step 3: Business Logic ──
  if (!parseResult.transaction_detected || parseResult.confidence < 0.6) {
    // Not financial or low confidence → ignore
    if (smsId) {
      await db.update(rawSmsEvents)
        .set({
          status: "ignored",
          metadata: {
            reason: !parseResult.transaction_detected ? "not_financial" : "low_confidence",
            confidence: parseResult.confidence,
          },
        })
        .where(eq(rawSmsEvents.id, smsId));
    }
    return c.json({
      success: true,
      transaction_detected: false,
      reason: !parseResult.transaction_detected ? "not_financial" : "low_confidence",
      confidence: parseResult.confidence,
    }, 200);
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
    await db.update(rawSmsEvents)
      .set({
        status: "processed",
        metadata: {
          transaction_saved: true,
          amount: parseResult.amount,
          category,
          type,
          confidence: parseResult.confidence,
        },
      })
      .where(eq(rawSmsEvents.id, smsId));
  }

  console.log(`✅ [SMS Ingest] User ${userId} | ${type} | ${parseResult.amount} EGP | ${category} | ${parseResult.provider}`);

  return c.json({
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
  }, 200);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sms/token/generate
// Generates a new webhook token for the authenticated user.
// Requires standard JWT session (same as other tRPC endpoints).
// ─────────────────────────────────────────────────────────────────────────────
smsApp.post("/token/generate", async (c) => {
  const db = getDb();
  const user = await getUserFromSession(c.req.header("Authorization"));

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // Delete old token if any
  await db.delete(webhookTokens).where(
    and(
      eq(webhookTokens.userId, user.id as number),
      eq(webhookTokens.userType, user.type)
    )
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
  const user = await getUserFromSession(c.req.header("Authorization"));

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const [record] = await db
    .select()
    .from(webhookTokens)
    .where(
      and(
        eq(webhookTokens.userId, user.id as number),
        eq(webhookTokens.userType, user.type)
      )
    )
    .limit(1);

  if (!record) {
    return c.json({ token: null, hasToken: false }, 200);
  }

  return c.json({ token: record.token, hasToken: true, createdAt: record.createdAt }, 200);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sms/logs
// Returns last 50 SMS processing logs for the authenticated user.
// ─────────────────────────────────────────────────────────────────────────────
smsApp.get("/logs", async (c) => {
  const db = getDb();
  const user = await getUserFromSession(c.req.header("Authorization"));

  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const logs = await db
    .select()
    .from(rawSmsEvents)
    .where(
      and(
        eq(rawSmsEvents.userId, user.id as number),
        eq(rawSmsEvents.userType, user.type)
      )
    )
    .orderBy(desc(rawSmsEvents.createdAt))
    .limit(50);

  return c.json({ logs }, 200);
});
