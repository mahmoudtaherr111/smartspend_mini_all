import { z } from "zod";
import { router, authedProcedure, adminProcedure } from "./middleware";
import { db } from "./queries/connection";
import { users, localUsers, proSubscriptions } from "../db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { env } from "./lib/env";
import { grantProSubscription } from "./lib/subscription-service";
import { isPaymobConfigured, createPaymobHostedCheckoutUrl } from "./lib/paymob";

function hasPaidFeatures(plan: string, role: string) {
  return plan === "pro" || plan === "ultra" || role === "admin";
}

export const proRouter = router({
  myPlan: authedProcedure.query(async ({ ctx }) => {
    const table = ctx.user.type === "oauth" ? users : localUsers;
    const user = await db.select().from(table).where(eq(table.id, ctx.user.id)).limit(1);
    const subs = await db
      .select()
      .from(proSubscriptions)
      .where(and(eq(proSubscriptions.userId, ctx.user.id), eq(proSubscriptions.userType, ctx.user.type)))
      .orderBy(desc(proSubscriptions.createdAt))
      .limit(1);

    const row = user[0];
    const plan = row?.plan ?? "free";
    const role = row?.role ?? "user";
    const paid = hasPaidFeatures(plan, role);

    return {
      plan,
      role,
      subscription: subs[0] ?? null,
      features: {
        aiRequests: paid ? "unlimited" : "10/day",
        exports: paid,
        ads: !paid,
        advancedStats: paid,
        prioritySupport: paid,
      },
    };
  }),

  /** Starts hosted checkout when Paymob is configured; otherwise signals client to use simulate upgrade. */
  createCheckoutSession: authedProcedure
    .input(z.object({ plan: z.enum(["pro_monthly", "pro_yearly"]) }))
    .mutation(async ({ ctx, input }) => {
      if (isPaymobConfigured()) {
        const redirectUrl = await createPaymobHostedCheckoutUrl({
          plan: input.plan,
          clientEmail: ctx.user.email ?? null,
        });
        return { mode: "redirect" as const, redirectUrl };
      }
      return { mode: "simulate" as const, redirectUrl: null as string | null };
    }),

  upgrade: authedProcedure
    .input(
      z.object({
        plan: z.enum(["pro_monthly", "pro_yearly"]),
        paymentMethod: z.string(),
        transactionId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const simOk = env.NODE_ENV === "development" || env.BILLING_SIMULATE === "true";
      if (!simOk && input.transactionId.startsWith("demo_")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "الترقية التجريبية معطّلة في الإنتاج. استخدم مسار الدفع الرسمي.",
        });
      }

      const { endDate } = await grantProSubscription({
        userId: ctx.user.id,
        userType: ctx.user.type,
        plan: input.plan,
        paymentMethod: input.paymentMethod,
        transactionId: input.transactionId,
      });

      return { success: true, message: "تم الترقية لبرو بنجاح!", endDate };
    }),

  cancel: authedProcedure.mutation(async ({ ctx }) => {
    await db
      .update(proSubscriptions)
      .set({ status: "cancelled" })
      .where(and(eq(proSubscriptions.userId, ctx.user.id), eq(proSubscriptions.userType, ctx.user.type)));

    const table = ctx.user.type === "oauth" ? users : localUsers;
    await db.update(table).set({ plan: "free" }).where(eq(table.id, ctx.user.id));

    return { success: true, message: "تم إلغاء الاشتراك" };
  }),

  listSubscriptions: adminProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          page: z.number().default(1),
          limit: z.number().default(20),
        })
        .optional()
    )
    .query(async ({ input }) => {
      const { status, page = 1, limit = 20 } = input ?? {};
      const offset = (page - 1) * limit;
      let query = db.select().from(proSubscriptions).$dynamic().orderBy(desc(proSubscriptions.createdAt));
      if (status) {
        query = query.where(eq(proSubscriptions.status, status));
      }
      const list = await query.limit(limit).offset(offset);
      const total = await db.select({ count: count() }).from(proSubscriptions);
      return { list, total: total[0]?.count ?? 0, page, limit };
    }),
});
