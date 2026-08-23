import { z } from "zod";
import {
  router,
  publicProcedure,
  authedProcedure,
  adminProcedure,
} from "./middleware";
import { db } from "./queries/connection";
import { ads, adClicks } from "../db/schema";
import { eq, and, or, sql, count, desc } from "drizzle-orm";

const safeUrlSchema = z.string().url().optional().or(z.literal(""));

export const adsRouter = router({
  // ─── Get Active Ads ───
  list: publicProcedure
    .input(
      z
        .object({
          placement: z.enum(["sidebar", "banner", "popup"]).optional(),
          userPlan: z.enum(["free", "pro", "all"]).default("free"),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const now = new Date();
      const plan = input?.userPlan ?? "free";

      const conditions = [
        eq(ads.isActive, true),
        sql`${ads.startDate} IS NULL OR ${ads.startDate} <= ${now}`,
        sql`${ads.endDate} IS NULL OR ${ads.endDate} >= ${now}`,
        or(eq(ads.targetPlan, "all"), eq(ads.targetPlan, plan)),
      ];

      if (input?.placement) {
        conditions.push(eq(ads.placement, input.placement) as any);
      }

      const list = await db
        .select()
        .from(ads)
        .where(and(...conditions))
        .limit(20);

      return list;
    }),

  // ─── Track Impression ───
  impression: publicProcedure
    .input(z.object({ adId: z.number() }))
    .mutation(async ({ input }) => {
      await db
        .update(ads)
        .set({ impressions: sql`impressions + 1` })
        .where(eq(ads.id, input.adId));
      return { success: true };
    }),

  // ─── Track Click ───
  click: authedProcedure
    .input(z.object({ adId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .update(ads)
        .set({ clicks: sql`clicks + 1` })
        .where(eq(ads.id, input.adId));
      await db.insert(adClicks).values({
        adId: input.adId,
        userId: ctx.user.id,
        userType: ctx.user.type,
      });
      return { success: true };
    }),

  // ─── Admin: Create Ad ───
  create: adminProcedure
    .input(
      z.object({
        title: z.string().min(1),
        content: z.string().min(1),
        imageUrl: safeUrlSchema,
        linkUrl: safeUrlSchema,
        placement: z.enum(["sidebar", "banner", "popup"]).default("sidebar"),
        targetPlan: z.enum(["free", "all"]).default("free"),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const result = await db.insert(ads).values({
        ...input,
        createdBy: ctx.user.id,
        startDate: input.startDate ? new Date(input.startDate) : null,
        endDate: input.endDate ? new Date(input.endDate) : null,
      });
      return { success: true, adId: Number(result[0].insertId) };
    }),

  // ─── Admin: Update Ad ───
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().optional(),
        content: z.string().optional(),
        imageUrl: safeUrlSchema,
        linkUrl: safeUrlSchema,
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      await db.update(ads).set(data).where(eq(ads.id, id));
      return { success: true };
    }),

  // ─── Admin: Delete Ad ───
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      await db.delete(ads).where(eq(ads.id, input.id));
      return { success: true };
    }),

  // ─── Admin: Ad Stats ───
  stats: adminProcedure.query(async () => {
    const allAds = await db.select().from(ads).orderBy(desc(ads.createdAt));
    const totalClicks = await db.select({ sum: sql`SUM(clicks)` }).from(ads);
    const totalImpressions = await db
      .select({ sum: sql`SUM(impressions)` })
      .from(ads);
    return {
      ads: allAds,
      totalClicks: totalClicks[0]?.sum ?? 0,
      totalImpressions: totalImpressions[0]?.sum ?? 0,
    };
  }),
});
