import { and, count, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import {
  aiTokenLedgers,
  apiKeyErrors,
  expenses,
  localUsers,
  storePurchases,
  supportTickets,
  users,
} from "../db/schema";
import { ledgerTotalCostUsdSince } from "./lib/ai-ledger";
import { dailyAiCapUsd } from "./lib/feature-switches";
import { startOfBusinessDay } from "./lib/app-time";
import { getCacheRuntimeStatus } from "./lib/redis-client";
import { getSystemSettings } from "./lib/settings-cache";
import { adminProcedure, moderatorProcedure, router } from "./middleware";
import { db } from "./queries/connection";

const DAY_MS = 24 * 60 * 60 * 1000;

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
});
