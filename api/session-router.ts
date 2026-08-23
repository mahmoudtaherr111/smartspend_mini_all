import { z } from "zod";
import { router, authedProcedure, moderatorProcedure } from "./middleware";
import { db } from "./queries/connection";
import { sessions, userAnalytics } from "../db/schema";
import { eq, desc, and, sql, count, gte } from "drizzle-orm";

export const sessionRouter = router({
  // ─── My Sessions ───
  listMine: authedProcedure.query(async ({ ctx }) => {
    return await db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        userType: sessions.userType,
        ipAddress: sessions.ipAddress,
        userAgent: sessions.userAgent,
        expiresAt: sessions.expiresAt,
        createdAt: sessions.createdAt,
      })
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
      await db
        .delete(sessions)
        .where(
          and(
            eq(sessions.id, input.sessionId),
            eq(sessions.userId, ctx.user.id),
            eq(sessions.userType, ctx.user.type),
          ),
        );
      return { success: true };
    }),

  // ─── Session Stats (Moderator+) ───
  stats: moderatorProcedure.query(async () => {
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

  // ─── All Sessions (Moderator+) ───
  listAll: moderatorProcedure
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
      let query = db.select({
        id: sessions.id,
        userId: sessions.userId,
        userType: sessions.userType,
        ipAddress: sessions.ipAddress,
        userAgent: sessions.userAgent,
        expiresAt: sessions.expiresAt,
        createdAt: sessions.createdAt,
      }).from(sessions).$dynamic();
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
