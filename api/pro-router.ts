import { z } from "zod";
import { router, authedProcedure, adminProcedure } from "./middleware";
import { db } from "./queries/connection";
import { users, localUsers, proSubscriptions } from "../db/schema";
import { eq, and, desc, sql, count } from "drizzle-orm";

export const proRouter = router({
  // ─── Get My Plan ───
  myPlan: authedProcedure.query(async ({ ctx }) => {
    const table = ctx.user.type === "oauth" ? users : localUsers;
    const user = await db.select().from(table).where(eq(table.id, ctx.user.id)).limit(1);
    const subs = await db.select().from(proSubscriptions)
      .where(and(eq(proSubscriptions.userId, ctx.user.id), eq(proSubscriptions.userType, ctx.user.type)))
      .orderBy(desc(proSubscriptions.createdAt))
      .limit(1);

    return {
      plan: user[0]?.plan ?? "free",
      role: user[0]?.role ?? "user",
      subscription: subs[0] ?? null,
      features: {
        aiRequests: user[0]?.plan === "pro" ? "unlimited" : "10/day",
        exports: user[0]?.plan === "pro",
        ads: user[0]?.plan !== "pro",
        advancedStats: user[0]?.plan === "pro",
        prioritySupport: user[0]?.plan === "pro",
      },
    };
  }),

  // ─── Upgrade to Pro (Simulated - replace with real payment) ───
  upgrade: authedProcedure
    .input(z.object({
      plan: z.enum(["pro_monthly", "pro_yearly"]),
      paymentMethod: z.string(),
      transactionId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const endDate = new Date();
      if (input.plan === "pro_monthly") endDate.setMonth(endDate.getMonth() + 1);
      else endDate.setFullYear(endDate.getFullYear() + 1);

      await db.insert(proSubscriptions).values({
        userId: ctx.user.id,
        userType: ctx.user.type,
        plan: input.plan,
        status: "active",
        startDate: new Date(),
        endDate,
        paymentMethod: input.paymentMethod,
        transactionId: input.transactionId,
      });

      const table = ctx.user.type === "oauth" ? users : localUsers;
      await db.update(table).set({ plan: "pro" }).where(eq(table.id, ctx.user.id));

      return { success: true, message: "تم الترقية لبرو بنجاح!", endDate };
    }),

  // ─── Cancel Subscription ───
  cancel: authedProcedure.mutation(async ({ ctx }) => {
    await db.update(proSubscriptions)
      .set({ status: "cancelled" })
      .where(and(eq(proSubscriptions.userId, ctx.user.id), eq(proSubscriptions.userType, ctx.user.type)));

    const table = ctx.user.type === "oauth" ? users : localUsers;
    await db.update(table).set({ plan: "free" }).where(eq(table.id, ctx.user.id));

    return { success: true, message: "تم إلغاء الاشتراك" };
  }),

  // ─── Admin: List All Subscriptions ───
  listSubscriptions: adminProcedure
    .input(z.object({
      status: z.string().optional(),
      page: z.number().default(1),
      limit: z.number().default(20),
    }).optional())
    .query(async ({ input }) => {
      const { status, page = 1, limit = 20 } = input ?? {};
      const offset = (page - 1) * limit;
      let query = db.select().from(proSubscriptions).orderBy(desc(proSubscriptions.createdAt));
      if (status) query = query.where(eq(proSubscriptions.status, status)) as any;
      const list = await query.limit(limit).offset(offset);
      const total = await db.select({ count: count() }).from(proSubscriptions);
      return { list, total: total[0]?.count ?? 0, page, limit };
    }),
});
