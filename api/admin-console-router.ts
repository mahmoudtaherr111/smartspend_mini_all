import { and, count, desc, eq, gte, inArray, isNull, like, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { BILLING_PLANS } from "../contracts/plans";
import {
  aiTokenLedgers,
  apiKeyErrors,
  captureDevices,
  classificationLogs,
  expenses,
  localUsers,
  sessions,
  storePurchases,
  supportTickets,
  userAnalytics,
  users,
} from "../db/schema";
import { ledgerTotalCostUsdSince } from "./lib/ai-ledger";
import { readClient } from "./lib/client-platform";
import { dailyAiCapUsd } from "./lib/feature-switches";
import { businessMonthRange, startOfBusinessDay } from "./lib/app-time";
import { getCacheRuntimeStatus } from "./lib/redis-client";
import { getSystemSettings } from "./lib/settings-cache";
import { adminProcedure, moderatorProcedure, router } from "./middleware";
import { db } from "./queries/connection";

const DAY_MS = 24 * 60 * 60 * 1000;

const personRef = z.object({ type: z.enum(["oauth", "local"]), id: z.number().int().positive() });

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
              // The outer columns are named in full: inside the subquery a bare `user_id` would mean the subquery's own row.
              sql`EXISTS (SELECT 1 FROM expenses later WHERE later.user_id = expenses.user_id AND later.user_type = expenses.user_type AND later.date >= ${weekAgo})`,
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
      devices: devices.map((device) => ({ ...device, ...readClient(device.userAgent) })),
      captureDevices: captures,
      purchases,
      tickets,
    };
  }),
  // Every AI call, newest first, with who asked, what for, which model answered, the tokens each way and the cost;
  // and the totals of the chosen period by what was asked and by model.
  aiCalls: adminProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(90).default(1),
        channel: z.string().max(40).optional(),
        provider: z.string().max(60).optional(),
        failedOnly: z.boolean().default(false),
        page: z.number().int().min(1).default(1),
      }),
    )
    .query(async ({ input }) => {
      const since = new Date(startOfBusinessDay().getTime() - (input.days - 1) * DAY_MS);
      const where = and(
        gte(aiTokenLedgers.createdAt, since),
        input.channel ? eq(aiTokenLedgers.channel, input.channel) : undefined,
        input.provider ? eq(aiTokenLedgers.providerSlug, input.provider) : undefined,
        input.failedOnly ? gte(aiTokenLedgers.httpStatus, 400) : undefined,
      );
      const pageSize = 50;
      const [rows, byChannel, byModel] = await Promise.all([
        db
          .select({
            id: aiTokenLedgers.id,
            createdAt: aiTokenLedgers.createdAt,
            userId: aiTokenLedgers.userId,
            userType: aiTokenLedgers.userType,
            channel: aiTokenLedgers.channel,
            provider: aiTokenLedgers.providerSlug,
            model: aiTokenLedgers.modelId,
            input: aiTokenLedgers.promptTokens,
            output: aiTokenLedgers.completionTokens,
            cached: aiTokenLedgers.cachedTokens,
            reasoning: aiTokenLedgers.reasoningTokens,
            systemPrompt: aiTokenLedgers.systemPromptTokens,
            memory: aiTokenLedgers.memoryRagTokens,
            history: aiTokenLedgers.historyTokens,
            userInput: aiTokenLedgers.userInputTokens,
            tools: aiTokenLedgers.toolSchemaTokens,
            usd: aiTokenLedgers.costUsd,
            egp: aiTokenLedgers.costEgp,
            latencyMs: aiTokenLedgers.latencyMs,
            httpStatus: aiTokenLedgers.httpStatus,
            finishReason: aiTokenLedgers.finishReason,
            classificationLogId: aiTokenLedgers.classificationLogId,
          })
          .from(aiTokenLedgers)
          .where(where)
          .orderBy(desc(aiTokenLedgers.createdAt))
          .limit(pageSize + 1)
          .offset((input.page - 1) * pageSize),
        db
          .select({
            channel: aiTokenLedgers.channel,
            calls: count(),
            usd: sql<number>`COALESCE(SUM(${aiTokenLedgers.costUsd}), 0)`,
            input: sql<number>`COALESCE(SUM(${aiTokenLedgers.promptTokens}), 0)`,
            output: sql<number>`COALESCE(SUM(${aiTokenLedgers.completionTokens}), 0)`,
            failed: sql<number>`COALESCE(SUM(CASE WHEN ${aiTokenLedgers.httpStatus} >= 400 THEN 1 ELSE 0 END), 0)`,
          })
          .from(aiTokenLedgers)
          .where(where)
          .groupBy(aiTokenLedgers.channel),
        db
          .select({
            provider: aiTokenLedgers.providerSlug,
            model: aiTokenLedgers.modelId,
            calls: count(),
            usd: sql<number>`COALESCE(SUM(${aiTokenLedgers.costUsd}), 0)`,
            avgLatencyMs: sql<number>`COALESCE(AVG(${aiTokenLedgers.latencyMs}), 0)`,
            failed: sql<number>`COALESCE(SUM(CASE WHEN ${aiTokenLedgers.httpStatus} >= 400 THEN 1 ELSE 0 END), 0)`,
          })
          .from(aiTokenLedgers)
          .where(where)
          .groupBy(aiTokenLedgers.providerSlug, aiTokenLedgers.modelId),
      ]);
      const names = await namesOf(rows.slice(0, pageSize));
      const number = (value: unknown) => Number(value ?? 0);
      return {
        rows: rows.slice(0, pageSize).map((row) => ({
          ...row,
          usd: number(row.usd),
          egp: number(row.egp),
          who: names.get(`${row.userType}:${row.userId}`) ?? null,
        })),
        hasMore: rows.length > pageSize,
        byChannel: byChannel.map((row) => ({
          ...row,
          usd: number(row.usd),
          input: number(row.input),
          output: number(row.output),
          failed: number(row.failed),
        })),
        byModel: byModel
          .map((row) => ({ ...row, usd: number(row.usd), avgLatencyMs: Math.round(number(row.avgLatencyMs)), failed: number(row.failed) }))
          .sort((a, b) => b.usd - a.usd),
      };
    }),

  // The sentences people recorded and how each was read: the items, whether a rule or the model decided, the
  // confidence, what matched, and whether the person corrected it afterwards.
  classifications: adminProcedure
    .input(
      z.object({
        days: z.number().int().min(1).max(90).default(7),
        by: z.enum(["all", "rules", "model", "corrected", "unsure"]).default("all"),
        page: z.number().int().min(1).default(1),
      }),
    )
    .query(async ({ input }) => {
      const since = new Date(startOfBusinessDay().getTime() - (input.days - 1) * DAY_MS);
      const filter =
        input.by === "rules"
          ? eq(classificationLogs.parsedBy, "rule_engine")
          : input.by === "model"
            ? inArray(classificationLogs.parsedBy, ["ai", "hybrid"])
            : input.by === "corrected"
              ? eq(classificationLogs.wasCorrected, true)
              : input.by === "unsure"
                ? inArray(classificationLogs.decision, ["review", "clarify"])
                : undefined;
      const pageSize = 30;
      const rows = await db
        .select({
          id: classificationLogs.id,
          createdAt: classificationLogs.createdAt,
          userId: classificationLogs.userId,
          userType: classificationLogs.userType,
          text: classificationLogs.originalText,
          parsedBy: classificationLogs.parsedBy,
          confidence: classificationLogs.confidence,
          decision: classificationLogs.decision,
          channel: classificationLogs.inputChannel,
          model: classificationLogs.modelUsed,
          tokens: classificationLogs.tokensUsed,
          timeMs: classificationLogs.processingTimeMs,
          corrected: classificationLogs.wasCorrected,
          correction: classificationLogs.correction,
          items: classificationLogs.finalResult,
        })
        .from(classificationLogs)
        .where(and(gte(classificationLogs.createdAt, since), filter))
        .orderBy(desc(classificationLogs.createdAt))
        .limit(pageSize + 1)
        .offset((input.page - 1) * pageSize);
      const names = await namesOf(rows.slice(0, pageSize));
      return {
        rows: rows.slice(0, pageSize).map((row) => ({
          ...row,
          who: names.get(`${row.userType}:${row.userId}`) ?? null,
          items: readItems(row.items),
        })),
        hasMore: rows.length > pageSize,
      };
    }),
  // The growth page: daily activity and sign-ups, how many new people recorded within a day, weekly cohorts, how
  // people record, which platforms and versions they use, and store subscriptions. Days are Cairo days.
  growth: adminProcedure
    .input(z.object({ days: z.number().int().min(7).max(60).default(30) }))
    .query(async ({ input }) => {
      const todayStart = startOfBusinessDay();
      // One boundary per day, oldest first, from Cairo's own midnights (a DST change makes a day 23 or 25 hours).
      const starts: Date[] = [];
      for (let back = input.days - 1; back >= 0; back--) {
        starts.push(startOfBusinessDay(new Date(todayStart.getTime() - back * DAY_MS + 12 * 60 * 60 * 1000)));
      }
      const ends = [...starts.slice(1), new Date(todayStart.getTime() + DAY_MS + 12 * 60 * 60 * 1000)].map((value, index) =>
        index === starts.length - 1 ? startOfBusinessDay(value) : value,
      );
      const from = starts[0];

      const perDay = (column: unknown, distinct: boolean) =>
        starts.map(
          (start, index) =>
            distinct
              ? sql<number>`COUNT(DISTINCT CASE WHEN ${column} >= ${start} AND ${column} < ${ends[index]} THEN CONCAT(${expenses.userType}, ':', ${expenses.userId}) END)`
              : sql<number>`COALESCE(SUM(CASE WHEN ${column} >= ${start} AND ${column} < ${ends[index]} THEN 1 ELSE 0 END), 0)`,
        );
      const toRecord = (values: unknown[]) => Object.fromEntries(values.map((value, index) => [`d${index}`, value])) as Record<string, ReturnType<typeof sql<number>>>;

      const [recorders] = await db.select(toRecord(perDay(expenses.date, true))).from(expenses).where(gte(expenses.date, from));
      const signupsPerDay = async (table: typeof users | typeof localUsers) => {
        const [row] = await db
          .select(toRecord(starts.map((start, index) => sql<number>`COALESCE(SUM(CASE WHEN ${table.createdAt} >= ${start} AND ${table.createdAt} < ${ends[index]} THEN 1 ELSE 0 END), 0)`)))
          .from(table)
          .where(gte(table.createdAt, from));
        return row;
      };
      const [googleSignups, phoneSignups] = await Promise.all([signupsPerDay(users), signupsPerDay(localUsers)]);

      // Who recorded within a day of signing up, by the day they signed up.
      const activatedOf = (table: typeof users | typeof localUsers, userType: "oauth" | "local") =>
        db
          .select({
            createdAt: table.createdAt,
            // Named in full: a bare `id` inside the subquery would be the expense's own id.
            activated: sql<number>`EXISTS (SELECT 1 FROM expenses e WHERE e.user_id = ${sql.raw(userType === "oauth" ? "users" : "local_users")}.id AND e.user_type = ${userType} AND e.created_at < DATE_ADD(${sql.raw(userType === "oauth" ? "users" : "local_users")}.created_at, INTERVAL 1 DAY))`,
          })
          .from(table)
          .where(gte(table.createdAt, from));
      const newcomers = [...(await activatedOf(users, "oauth")), ...(await activatedOf(localUsers, "local"))];

      const daily = starts.map((start, index) => {
        const key = `d${index}`;
        const signups = Number(googleSignups?.[key] ?? 0) + Number(phoneSignups?.[key] ?? 0);
        const inDay = newcomers.filter((row) => {
          const at = new Date(row.createdAt).getTime();
          return at >= start.getTime() && at < ends[index].getTime();
        });
        return {
          day: start.toISOString(),
          recorders: Number(recorders?.[key] ?? 0),
          signups,
          activated: inDay.filter((row) => Number(row.activated) === 1).length,
        };
      });

      // Weekly cohorts: of the people who signed up in a week, the share who recorded in each later week.
      const cohortStart = new Date(todayStart.getTime() - 6 * 7 * DAY_MS);
      const cohortRows = await db.execute(sql`
        SELECT u.week AS cohort, FLOOR(TIMESTAMPDIFF(DAY, u.created_at, e.date) / 7) AS age, COUNT(DISTINCT u.user_type, u.id) AS people
        FROM (
          SELECT id, 'oauth' AS user_type, created_at, FLOOR(TIMESTAMPDIFF(DAY, ${cohortStart}, created_at) / 7) AS week FROM users WHERE created_at >= ${cohortStart}
          UNION ALL
          SELECT id, 'local' AS user_type, created_at, FLOOR(TIMESTAMPDIFF(DAY, ${cohortStart}, created_at) / 7) AS week FROM local_users WHERE created_at >= ${cohortStart}
        ) u
        JOIN expenses e ON e.user_id = u.id AND e.user_type = u.user_type AND e.date >= u.created_at
        GROUP BY cohort, age`);
      const cohortSizes = await db.execute(sql`
        SELECT week AS cohort, COUNT(*) AS people FROM (
          SELECT FLOOR(TIMESTAMPDIFF(DAY, ${cohortStart}, created_at) / 7) AS week FROM users WHERE created_at >= ${cohortStart}
          UNION ALL
          SELECT FLOOR(TIMESTAMPDIFF(DAY, ${cohortStart}, created_at) / 7) AS week FROM local_users WHERE created_at >= ${cohortStart}
        ) s GROUP BY week`);
      const rowsOf = (result: unknown) => ((Array.isArray(result) ? result[0] : result) ?? []) as Record<string, unknown>[];
      const sizes = new Map(rowsOf(cohortSizes).map((row) => [Number(row.cohort), Number(row.people)]));
      const cohorts = [...sizes.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([cohort, size]) => {
          const weeks: (number | null)[] = [];
          const weekStart = cohortStart.getTime() + cohort * 7 * DAY_MS;
          // Weeks that have begun for this cohort; later ones have not happened yet.
          const maxAge = Math.floor((todayStart.getTime() + DAY_MS - weekStart) / (7 * DAY_MS));
          for (let age = 0; age <= 5; age++) {
            if (age > maxAge) {
              weeks.push(null);
              continue;
            }
            const row = rowsOf(cohortRows).find((r) => Number(r.cohort) === cohort && Number(r.age) === age);
            weeks.push(size ? Math.round((Number(row?.people ?? 0) / size) * 100) : 0);
          }
          return { weekStart: new Date(weekStart).toISOString(), size, weeks };
        });

      const [sources, platforms, versions, subscriptions] = await Promise.all([
        db
          .select({ source: expenses.source, count: count() })
          .from(expenses)
          .where(gte(expenses.date, from))
          .groupBy(expenses.source),
        db
          .select({
            platform: sql<string>`JSON_UNQUOTE(JSON_EXTRACT(${userAnalytics.metadata}, '$.platform'))`,
            people: sql<number>`COUNT(DISTINCT ${userAnalytics.userType}, ${userAnalytics.userId})`,
          })
          .from(userAnalytics)
          .where(and(eq(userAnalytics.event, "app_seen"), gte(userAnalytics.createdAt, new Date(todayStart.getTime() - 6 * DAY_MS))))
          .groupBy(sql`1`),
        db
          .select({
            platform: sql<string>`JSON_UNQUOTE(JSON_EXTRACT(${userAnalytics.metadata}, '$.platform'))`,
            version: sql<string>`JSON_UNQUOTE(JSON_EXTRACT(${userAnalytics.metadata}, '$.version'))`,
            people: sql<number>`COUNT(DISTINCT ${userAnalytics.userType}, ${userAnalytics.userId})`,
          })
          .from(userAnalytics)
          .where(and(eq(userAnalytics.event, "app_seen"), gte(userAnalytics.createdAt, new Date(todayStart.getTime() - 6 * DAY_MS))))
          .groupBy(sql`1`, sql`2`),
        db
          .select({ store: storePurchases.store, status: storePurchases.status, count: count() })
          .from(storePurchases)
          .groupBy(storePurchases.store, storePurchases.status),
      ]);

      return {
        daily,
        cohorts,
        sources: sources.map((row) => ({ source: row.source ?? "manual", count: Number(row.count) })),
        platforms: platforms.map((row) => ({ platform: row.platform ?? "unknown", people: Number(row.people) })),
        versions: versions
          .filter((row) => row.platform === "android" || row.platform === "ios")
          .map((row) => ({ platform: row.platform, version: row.version && row.version !== "null" ? row.version : "قديم", people: Number(row.people) })),
        subscriptions: subscriptions.map((row) => ({ store: row.store, status: row.status, count: Number(row.count) })),
      };
    }),
  // Money: store subscriptions now and this month, a monthly revenue estimate from the published prices, and the
  // latest subscriptions with who holds them.
  money: adminProcedure.query(async () => {
    const monthStart = businessMonthRange().start;
    const [byStatus, newThisMonth, endedThisMonth, latest] = await Promise.all([
      db
        .select({ store: storePurchases.store, product: storePurchases.storeProductId, status: storePurchases.status, count: count() })
        .from(storePurchases)
        .groupBy(storePurchases.store, storePurchases.storeProductId, storePurchases.status),
      countOrNull(() => db.select({ count: count() }).from(storePurchases).where(gte(storePurchases.createdAt, monthStart))),
      countOrNull(() =>
        db
          .select({ count: count() })
          .from(storePurchases)
          .where(and(inArray(storePurchases.status, ["expired", "revoked"]), gte(storePurchases.updatedAt, monthStart))),
      ),
      db
        .select({
          id: storePurchases.id,
          userId: storePurchases.userId,
          userType: storePurchases.userType,
          store: storePurchases.store,
          product: storePurchases.storeProductId,
          status: storePurchases.status,
          expiresAt: storePurchases.expiresAt,
          createdAt: storePurchases.createdAt,
        })
        .from(storePurchases)
        .orderBy(desc(storePurchases.createdAt))
        .limit(40),
    ]);
    // A month's worth of each active subscription at the published price, in pounds. The stores keep their cut, so
    // this is what people pay, not what reaches the bank.
    const monthlyPounds = (product: string) => {
      const plan = BILLING_PLANS[product as keyof typeof BILLING_PLANS];
      if (!plan) return 0;
      return plan.duration === "year" ? plan.amountCents / 100 / 12 : plan.amountCents / 100;
    };
    const active = byStatus.filter((row) => row.status === "active" || row.status === "cancelled" || row.status === "grace");
    const names = await namesOf(latest);
    return {
      activeByStore: ["google_play", "app_store"].map((store) => ({
        store,
        count: active.filter((row) => row.store === store).reduce((sum, row) => sum + Number(row.count), 0),
      })),
      monthlyRevenueEstimate: Math.round(active.reduce((sum, row) => sum + monthlyPounds(row.product) * Number(row.count), 0)),
      byStatus: byStatus.map((row) => ({ ...row, count: Number(row.count) })),
      newThisMonth,
      endedThisMonth,
      latest: latest.map((row) => ({ ...row, who: names.get(`${row.userType}:${row.userId}`) ?? null })),
    };
  }),
});

/** Names of the people behind a page of rows, in two queries. */
async function namesOf(rows: { userId: number | null; userType: string | null }[]): Promise<Map<string, string>> {
  const ids = (type: string) => [
    ...new Set(rows.filter((row) => row.userType === type && row.userId).map((row) => row.userId as number)),
  ];
  const [google, phone] = await Promise.all([
    ids("oauth").length ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, ids("oauth"))) : [],
    ids("local").length
      ? db.select({ id: localUsers.id, name: localUsers.name }).from(localUsers).where(inArray(localUsers.id, ids("local")))
      : [],
  ]);
  return new Map([
    ...google.map((row) => [`oauth:${row.id}`, row.name ?? ""] as const),
    ...phone.map((row) => [`local:${row.id}`, row.name ?? ""] as const),
  ]);
}

/** The parts of a stored item the console explains: what it became and why. */
function readItems(value: unknown) {
  const list = Array.isArray(value) ? value : [];
  return list.slice(0, 10).map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const evidence = (item.evidence ?? {}) as Record<string, unknown>;
    return {
      amount: Number(item.amount ?? 0),
      category: String(item.category ?? ""),
      subCategory: item.subCategory ? String(item.subCategory) : null,
      description: item.description ? String(item.description) : null,
      type: String(item.type ?? ""),
      confidence: Number(item.confidence ?? 0),
      matchKind: evidence.matchKind ? String(evidence.matchKind) : null,
      agreement: Number(evidence.agreement ?? 0),
      disagreement: Number(evidence.disagreement ?? 0),
      categoryIsFallback: evidence.categoryIsFallback === true,
      reviewReasons: Array.isArray(item.reviewReasons) ? item.reviewReasons.map(String).slice(0, 5) : [],
      candidates: Array.isArray(item.candidates) ? item.candidates.map(String).slice(0, 4) : [],
    };
  });
}
