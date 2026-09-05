import { z } from "zod";
import { router, authedProcedure, adminProcedure } from "./middleware";
import { sessionMetadataFields } from "./lib/admin-safe-fields";
import { db } from "./queries/connection";
import { sessions, userAnalytics } from "../db/schema";
import { eq, desc, and, sql, count, gte } from "drizzle-orm";

export const sessionRouter = router({
  // ─── My Sessions ───
  listMine: authedProcedure.query(async ({ ctx }) => {
    return await db
      .select(sessionMetadataFields)
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, ctx.user.id),
          eq(sessions.userType, ctx.user.type),
        ),
      )
      .orderBy(desc(sessions.createdAt));
  }),

  // ─── Revoke My Session ───
  revokeMine: authedProcedure
    .input(z.object({ sessionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const session = await db.query.sessions.findFirst({
        where: and(
          eq(sessions.id, input.sessionId),
          eq(sessions.userId, ctx.user.id),
          eq(sessions.userType, ctx.user.type),
        ),
      });

      if (session) {
        await db
          .delete(sessions)
          .where(eq(sessions.id, session.id));

        const { bumpAuthVersion, hashSessionToken } = await import(
          "./lib/session-validation"
        );
        const { cacheDel } = await import("./lib/redis-client");
        const { CacheKeys } = await import("./lib/cache-keys");

        if (session.tokenHash) {
          await cacheDel(CacheKeys.session(session.tokenHash));
        } else if (session.token) {
          await cacheDel(CacheKeys.session(hashSessionToken(session.token).hex));
        }
        await bumpAuthVersion(ctx.user.type, ctx.user.id);
      }

      return { success: true };
    }),

  // ─── Session Stats (Admin only) ───
  stats: adminProcedure.query(async () => {
    const total = await db.select({ count: count() }).from(sessions);
    const active = await db
      .select({ count: count() })
      .from(sessions)
      .where(gte(sessions.expiresAt, new Date()));
    const today = await db
      .select({ count: count() })
      .from(sessions)
      .where(sql`DATE(created_at) = CURDATE()`);
    const byDay = await db
      .select({
        day: sql`DATE(created_at)`,
        count: count(),
      })
      .from(sessions)
      .groupBy(sql`DATE(created_at)`)
      .orderBy(desc(sql`DATE(created_at)`))
      .limit(7);

    return {
      total: total[0]?.count ?? 0,
      active: active[0]?.count ?? 0,
      today: today[0]?.count ?? 0,
      byDay,
    };
  }),

  // ─── All Sessions (Admin only) ───
  listAll: adminProcedure
    .input(
      z
        .object({
          userId: z.number().optional(),
          userType: z.enum(["oauth", "local"]).optional(),
          activeOnly: z.boolean().default(false),
          page: z.number().default(1),
          limit: z.number().default(50),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const { userId, activeOnly, page = 1, limit = 50 } = input ?? {};
      const offset = (page - 1) * limit;
      const conditions = [];
      if (userId) {
        conditions.push(eq(sessions.userId, userId));
        if (input?.userType) {
          conditions.push(eq(sessions.userType, input.userType));
        }
      }
      if (activeOnly) conditions.push(gte(sessions.expiresAt, new Date()));
      let query = db.select(sessionMetadataFields).from(sessions).$dynamic();
      if (conditions.length > 0) query = query.where(and(...conditions));
      query = query.orderBy(desc(sessions.createdAt));
      const list = await query.limit(limit).offset(offset);
      let totalQuery = db.select({ count: count() }).from(sessions).$dynamic();
      if (conditions.length > 0) totalQuery = totalQuery.where(and(...conditions));
      const total = await totalQuery;
      return { list, total: total[0]?.count ?? 0, page, limit };
    }),

  // ─── Track Event ───
  trackEvent: authedProcedure
    .input(
      z.object({
        event: z.enum([
          "login",
          "logout",
          "page_view",
          "expense_create",
          "expense_update",
          "expense_delete",
          "ai_use",
          "upgrade_to_pro",
          "export_data",
          "voice_record",
          "sms_ingest",
          "onboarding_complete",
          "budget_exceeded",
          "chat_message",
        ]),
        metadata: z.record(z.string(), z.any()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await db.insert(userAnalytics).values({
        userId: ctx.user.id,
        userType: ctx.user.type,
        event: input.event,
        metadata: input.metadata ?? {},
      });
      return { success: true };
    }),
});
