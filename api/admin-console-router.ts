import { and, count, desc, eq, gte, isNull, like, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  aiTokenLedgers,
  apiKeyErrors,
  captureDevices,
  expenses,
  localUsers,
  sessions,
  storePurchases,
  supportTickets,
  users,
} from "../db/schema";
import { ledgerTotalCostUsdSince } from "./lib/ai-ledger";
import { dailyAiCapUsd } from "./lib/feature-switches";
import { businessMonthRange, startOfBusinessDay } from "./lib/app-time";
import { getCacheRuntimeStatus } from "./lib/redis-client";
import { getSystemSettings } from "./lib/settings-cache";
import { adminProcedure, moderatorProcedure, router } from "./middleware";
import { db } from "./queries/connection";

const DAY_MS = 24 * 60 * 60 * 1000;

const personRef = z.object({ type: z.enum(["oauth", "local"]), id: z.number().int().positive() });

/** Which app a session came from, read from the user agent the app sends ("SmartSpend-Mobile (android; …)"). */
export function platformOf(userAgent: string | null | undefined): "android" | "ios" | "web" | "unknown" {
  const agent = (userAgent ?? "").toLowerCase();
  if (agent.startsWith("smartspend-mobile")) return agent.includes("ios") ? "ios" : agent.includes("android") ? "android" : "unknown";
  if (!agent) return "unknown";
  return "web";
}

/** A count that cannot break the page: a failed query reads as null, which the console shows as unknown, never as 0. */
async function countOrNull(run: () => Promise<{ count?: number | string | null }[]>): Promise<number | null> {
  try {
    const rows = await run();
    return Number(rows[0]?.count ?? 0);
  } catch {
    return null;
  }
}

const distinctRecorders = sql<number>`COUNT(DISTINCT CONCAT(${expenses.userType}, ':', ${expenses.userId}))`;

// The admin console (admin/): what its pages need that no other router answers, each shaped for one screen.
export const adminConsoleRouter = router({
  // Who is signed in to the console, and what they may open: moderators answer support only.
  session: moderatorProcedure.query(({ ctx }) => ({
    name: ctx.user.name ?? "",
    role: ctx.user.role,
  })),

  // The home page: today's numbers, what needs the admin, and whether the system is really up.
  today: adminProcedure.query(async () => {
    const now = new Date();
    const today = startOfBusinessDay();
    const yesterday = new Date(today.getTime() - DAY_MS);
    const weekAgo = new Date(today.getTime() - 7 * DAY_MS);
    const twoWeeksAgo = new Date(today.getTime() - 14 * DAY_MS);
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const settings = await getSystemSettings();

    const recorders = (from: Date, to?: Date) =>
      countOrNull(() =>
        db
          .select({ count: distinctRecorders })
          .from(expenses)
          .where(to ? and(gte(expenses.date, from), lt(expenses.date, to)) : gte(expenses.date, from)),
      );
    const signups = async (from: Date) => {
      const [g, l] = await Promise.all([
        countOrNull(() => db.select({ count: count() }).from(users).where(gte(users.createdAt, from))),
        countOrNull(() => db.select({ count: count() }).from(localUsers).where(gte(localUsers.createdAt, from))),
      ]);
      return g === null || l === null ? null : g + l;
    };

    const [recordedToday, recordedYesterday, recordedWeek, signupsWeek, lastWeek, returned] = await Promise.all([
      recorders(today),
      recorders(yesterday, today),
      recorders(weekAgo),
      signups(weekAgo),
      recorders(twoWeeksAgo, weekAgo),
      countOrNull(() =>
        db
          .select({ count: distinctRecorders })
          .from(expenses)
          .where(
            and(
              gte(expenses.date, twoWeeksAgo),
              lt(expenses.date, weekAgo),
              sql`EXISTS (SELECT 1 FROM expenses later WHERE later.user_id = ${expenses.userId} AND later.user_type = ${expenses.userType} AND later.date >= ${weekAgo})`,
            ),
          ),
      ),
    ]);

    let aiCostToday: number | null = null;
    try {
      aiCostToday = await ledgerTotalCostUsdSince(today);
    } catch {
      aiCostToday = null;
    }

    const [activeStoreSubs, openTickets, oldestTicket, failedCallsHour, callsHour, keyErrors] = await Promise.all([
      countOrNull(() => db.select({ count: count() }).from(storePurchases).where(eq(storePurchases.status, "active"))),
      countOrNull(() => db.select({ count: count() }).from(supportTickets).where(eq(supportTickets.status, "open"))),
      db
        .select({ createdAt: supportTickets.createdAt })
        .from(supportTickets)
        .where(eq(supportTickets.status, "open"))
        .orderBy(supportTickets.createdAt)
        .limit(1)
        .then((rows) => rows[0]?.createdAt ?? null)
        .catch(() => null),
      countOrNull(() =>
        db
          .select({ count: count() })
          .from(aiTokenLedgers)
          .where(and(gte(aiTokenLedgers.createdAt, hourAgo), gte(aiTokenLedgers.httpStatus, 400))),
      ),
      countOrNull(() => db.select({ count: count() }).from(aiTokenLedgers).where(gte(aiTokenLedgers.createdAt, hourAgo))),
      countOrNull(() => db.select({ count: count() }).from(apiKeyErrors).where(isNull(apiKeyErrors.resolvedAt))),
    ]);

    let database = false;
    try {
      await db.execute(sql`SELECT 1`);
      database = true;
    } catch {
      database = false;
    }
    const cache = getCacheRuntimeStatus();

    const latestCall = await db
      .select({ createdAt: aiTokenLedgers.createdAt })
      .from(aiTokenLedgers)
      .orderBy(desc(aiTokenLedgers.createdAt))
      .limit(1)
      .then((rows) => rows[0]?.createdAt ?? null)
      .catch(() => null);

    return {
      checkedAt: now.toISOString(),
      recordedToday,
      recordedYesterday,
      recordedWeek,
      signupsWeek,
      returnedPercent:
        lastWeek === null || returned === null || lastWeek === 0 ? null : Math.round((returned / lastWeek) * 100),
      aiCostToday,
      aiDailyCapUsd: dailyAiCapUsd(settings),
      activeStoreSubs,
      openTickets,
      oldestTicketAt: oldestTicket ? new Date(oldestTicket).toISOString() : null,
      failedCallsHour,
      callsHour,
      unresolvedKeyErrors: keyErrors,
      latestAiCallAt: latestCall ? new Date(latestCall).toISOString() : null,
      health: {
        database,
        redis: cache.redisConfigured ? cache.redisConnected : null,
      },
    };
  }),

  // Find a person by name, phone or email, across Google and phone accounts, newest first.
  searchPeople: adminProcedure
    .input(z.object({ query: z.string().trim().max(80).default(""), limit: z.number().int().min(1).max(100).default(30) }))
    .query(async ({ input }) => {
      const term = `%${input.query.replace(/[%_]/g, "")}%`;
      const [google, phone] = await Promise.all([
        db
          .select({ id: users.id, name: users.name, contact: users.email, plan: users.plan, role: users.role, createdAt: users.createdAt, lastSignInAt: users.lastSignInAt })
          .from(users)
          .where(input.query ? or(like(users.name, term), like(users.email, term)) : undefined)
          .orderBy(desc(users.createdAt))
          .limit(input.limit),
        db
          .select({ id: localUsers.id, name: localUsers.name, contact: localUsers.phone, plan: localUsers.plan, role: localUsers.role, createdAt: localUsers.createdAt, lastSignInAt: localUsers.lastSignInAt })
          .from(localUsers)
          .where(input.query ? or(like(localUsers.name, term), like(localUsers.phone, term), like(localUsers.email, term)) : undefined)
          .orderBy(desc(localUsers.createdAt))
          .limit(input.limit),
      ]);
      return [
        ...google.map((row) => ({ ...row, type: "oauth" as const })),
        ...phone.map((row) => ({ ...row, type: "local" as const })),
      ]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, input.limit);
    }),

  // Everything about one person on one page: who they are, what they recorded, what the AI cost for them, their
  // devices, subscriptions and tickets.
  person: adminProcedure.input(personRef).query(async ({ input }) => {
    const table = input.type === "oauth" ? users : localUsers;
    const [profile] = await db.select().from(table).where(eq(table.id, input.id)).limit(1);
    if (!profile) return null;
    const mine = <T extends { userId: unknown; userType: unknown }>(t: T) =>
      and(eq(t.userId as never, input.id), eq(t.userType as never, input.type));
    // The Cairo month (golden rule 6).
    const monthStart = businessMonthRange().start;

    const [recent, totals, monthCount, aiMonth, aiCalls, devices, captures, purchases, tickets] = await Promise.all([
      db
        .select({
          id: expenses.id,
          date: expenses.date,
          type: expenses.type,
          amount: expenses.amount,
          category: expenses.category,
          description: expenses.description,
          rawText: expenses.rawText,
          source: expenses.source,
          classificationLogId: expenses.classificationLogId,
        })
        .from(expenses)
        .where(mine(expenses))
        .orderBy(desc(expenses.date))
        .limit(20),
      db.select({ count: count(), last: sql<Date | null>`MAX(${expenses.date})` }).from(expenses).where(mine(expenses)),
      countOrNull(() => db.select({ count: count() }).from(expenses).where(and(mine(expenses), gte(expenses.date, monthStart)))),
      db
        .select({
          calls: count(),
          input: sql<number>`COALESCE(SUM(${aiTokenLedgers.promptTokens}), 0)`,
          output: sql<number>`COALESCE(SUM(${aiTokenLedgers.completionTokens}), 0)`,
          usd: sql<number>`COALESCE(SUM(${aiTokenLedgers.costUsd}), 0)`,
        })
        .from(aiTokenLedgers)
        .where(and(mine(aiTokenLedgers), gte(aiTokenLedgers.createdAt, monthStart))),
      db
        .select({
          id: aiTokenLedgers.id,
          createdAt: aiTokenLedgers.createdAt,
          channel: aiTokenLedgers.channel,
          provider: aiTokenLedgers.providerSlug,
          model: aiTokenLedgers.modelId,
          input: aiTokenLedgers.promptTokens,
          output: aiTokenLedgers.completionTokens,
          usd: aiTokenLedgers.costUsd,
          httpStatus: aiTokenLedgers.httpStatus,
        })
        .from(aiTokenLedgers)
        .where(mine(aiTokenLedgers))
        .orderBy(desc(aiTokenLedgers.createdAt))
        .limit(10),
      db
        .select({ id: sessions.id, userAgent: sessions.userAgent, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt })
        .from(sessions)
        .where(and(mine(sessions), gte(sessions.expiresAt, new Date())))
        .orderBy(desc(sessions.createdAt))
        .limit(20),
      db
        .select({ platform: captureDevices.platform, appVersion: captureDevices.appVersion, lastSeenAt: captureDevices.lastSeenAt, health: captureDevices.health })
        .from(captureDevices)
        .where(and(mine(captureDevices), isNull(captureDevices.revokedAt))),
      db
        .select({ store: storePurchases.store, product: storePurchases.storeProductId, status: storePurchases.status, expiresAt: storePurchases.expiresAt })
        .from(storePurchases)
        .where(mine(storePurchases))
        .orderBy(desc(storePurchases.createdAt)),
      db
        .select({ id: supportTickets.id, subject: supportTickets.subject, status: supportTickets.status, createdAt: supportTickets.createdAt, respondedAt: supportTickets.respondedAt })
        .from(supportTickets)
        .where(mine(supportTickets))
        .orderBy(desc(supportTickets.createdAt))
        .limit(10),
    ]);

    return {
      type: input.type,
      id: input.id,
      name: profile.name,
      contact: "phone" in profile ? profile.phone : profile.email,
      email: profile.email,
      plan: profile.plan,
      role: profile.role,
      createdAt: profile.createdAt,
      lastSignInAt: profile.lastSignInAt,
      currentStreak: profile.currentStreak,
      recordedTotal: Number(totals[0]?.count ?? 0),
      lastRecordedAt: totals[0]?.last ?? null,
      recordedThisMonth: monthCount,
      aiThisMonth: {
        calls: Number(aiMonth[0]?.calls ?? 0),
        input: Number(aiMonth[0]?.input ?? 0),
        output: Number(aiMonth[0]?.output ?? 0),
        usd: Number(aiMonth[0]?.usd ?? 0),
      },
      recent,
      aiCalls,
      devices: devices.map((device) => ({ ...device, platform: platformOf(device.userAgent) })),
      captureDevices: captures,
      purchases,
      tickets,
    };
  }),
});
