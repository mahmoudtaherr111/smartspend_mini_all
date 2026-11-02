import { z } from "zod";
import {
  router,
  publicProcedure,
  authedProcedure,
  adminProcedure,
} from "./middleware";
import { db } from "./queries/connection";
import { ads, adClicks, adImpressions } from "../db/schema";
import { eq, and, or, isNull, lte, gte, sql, count, desc } from "drizzle-orm";
import { startOfBusinessDay } from "./lib/app-time";
import { logAdminAction } from "./lib/admin-audit";

const safeUrlSchema = z.string().url().optional().or(z.literal(""));

export const adsRouter = router({
  // ─── Get Active Ads (ADS-01) ───
  list: publicProcedure
    .input(
      z
        .object({
          placement: z.string().optional(),
          platform: z.enum(["android", "ios", "web", "all"]).default("web"),
          userPlan: z.enum(["free", "pro", "all"]).optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const plan = ctx.user && ctx.user.plan !== "free" ? "pro" : "free";

      const conditions = [
        eq(ads.isActive, true),
        or(isNull(ads.startDate), lte(ads.startDate, now)),
        or(isNull(ads.endDate), gte(ads.endDate, now)),
        plan === "pro"
          ? or(eq(ads.targetPlan, "all"), eq(ads.targetPlan, "pro"))
          : or(
              eq(ads.targetPlan, "all"),
              eq(ads.targetPlan, "free"),
              eq(ads.targetPlan, "free_only"),
            ),
      ];

      if (input?.placement) {
        conditions.push(eq(ads.placement, input.placement) as any);
      }

      if (input?.platform && input.platform !== "all") {
        conditions.push(
          or(
            eq(ads.platformTarget, "all"),
            eq(ads.platformTarget, input.platform),
          ) as any,
        );
      }

      const activeAds = await db
        .select()
        .from(ads)
        .where(and(...conditions))
        .limit(20);

      // Frequency capping check
      const hasCappedAds = activeAds.some((ad) => ad.frequencyCapPerDay > 0);
      if (ctx.user && hasCappedAds) {
        const todayStart = startOfBusinessDay();
        const userImpressionsToday = await db
          .select({ adId: adImpressions.adId, count: count() })
          .from(adImpressions)
          .where(
            and(
              eq(adImpressions.userId, ctx.user.id),
              eq(adImpressions.userType, ctx.user.type),
              gte(adImpressions.createdAt, todayStart),
            ),
          )
          .groupBy(adImpressions.adId);

        const impressionCountMap = new Map<number, number>();
        for (const imp of userImpressionsToday) {
          impressionCountMap.set(imp.adId, imp.count);
        }

        return activeAds.filter((ad) => {
          if (ad.frequencyCapPerDay > 0) {
            const viewedCount = impressionCountMap.get(ad.id) ?? 0;
            if (viewedCount >= ad.frequencyCapPerDay) return false;
          }
          return true;
        });
      }

      return activeAds;
    }),

  // ─── Record Ad Impression (ADS-02, BUG-06) ───
  recordImpression: publicProcedure
    .input(
      z.object({
        adId: z.number(),
        placement: z.string(),
        impressionToken: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Check deduplication token
      const existing = await db
        .select({ id: adImpressions.id })
        .from(adImpressions)
        .where(eq(adImpressions.impressionToken, input.impressionToken))
        .limit(1);

      if (existing[0]) {
        return {
          success: false,
          recorded: false,
          error: "DUPLICATE_IMPRESSION_IGNORED",
        };
      }

      // 2. Record unique impression
      try {
        await db.insert(adImpressions).values({
          adId: input.adId,
          userId: ctx.user ? ctx.user.id : null,
          userType: ctx.user ? ctx.user.type : null,
          placement: input.placement,
          impressionToken: input.impressionToken,
          ipAddress: ctx.ip || null,
        });

        // 3. Atomically increment counter on ad campaign
        await db
          .update(ads)
          .set({ impressions: sql`${ads.impressions} + 1` })
          .where(eq(ads.id, input.adId));

        return { success: true, recorded: true };
      } catch {
        return {
          success: false,
          recorded: false,
          error: "DUPLICATE_IMPRESSION_IGNORED",
        };
      }
    }),

  // ─── Track Impression (Legacy) ───
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
        placement: z.string().default("sidebar"),
        targetPlan: z.enum(["free", "all"]).default("free"),
        platformTarget: z
          .enum(["all", "android", "ios", "web"])
          .default("all"),
        frequencyCapPerDay: z.number().min(0).default(0),
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
      const adId = Number(result[0].insertId);
      await logAdminAction(ctx, {
        action: "CREATE_AD",
        targetType: "ad",
        targetId: adId,
        details: { title: input.title, placement: input.placement },
      });
      return { success: true, adId };
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
        platformTarget: z.enum(["all", "android", "ios", "web"]).optional(),
        frequencyCapPerDay: z.number().min(0).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await db.update(ads).set(data).where(eq(ads.id, id));
      await logAdminAction(ctx, {
        action: "UPDATE_AD",
        targetType: "ad",
        targetId: id,
        details: { id, ...data },
      });
      return { success: true };
    }),

  // ─── Admin: Delete Ad ───
  delete: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db.transaction(async (tx) => {
        await tx.delete(adImpressions).where(eq(adImpressions.adId, input.id));
        await tx.delete(adClicks).where(eq(adClicks.adId, input.id));
        await tx.delete(ads).where(eq(ads.id, input.id));
      });
      await logAdminAction(ctx, {
        action: "DELETE_AD",
        targetType: "ad",
        targetId: input.id,
        details: { id: input.id },
      });
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
