import { z } from "zod";
import { router, authedProcedure, adminProcedure } from "./middleware";
import { db } from "./queries/connection";
import { users, localUsers, proSubscriptions } from "../db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { env } from "./lib/env";
import { grantProSubscription } from "./lib/subscription-service";
import {
  isPaymobConfigured,
  createPaymobHostedCheckoutUrl,
} from "./lib/paymob";
import { BILLING_PLAN_IDS } from "../contracts/plans";
import { setPlan } from "./lib/access-control";
import { getSystemSettings } from "./lib/settings-cache";
import { buildPlanCatalog, buildPlanCatalogEntry } from "./lib/plan-catalog";
import { asPlanId, isPlanFeatureEnabled } from "../contracts/plan-features";

/** The plan features the screens gate on, from the admin's settings. Admins get all. */
function planFeatures(settings: Record<string, string>, plan: string, role: string) {
  const on = (feature: Parameters<typeof isPlanFeatureEnabled>[2]) =>
    role === "admin" || isPlanFeatureEnabled(settings, plan, feature);
  return {
    receipts: on("receipts"),
    business: on("business"),
    proReport: on("pro_report"),
    goalAnalysis: on("goal_analysis"),
    whatsappReport: on("whatsapp_report"),
    ads: plan === "free" && role !== "admin",
  };
}

export const proRouter = router({
  myPlan: authedProcedure.query(async ({ ctx }) => {
    const table = ctx.user.type === "oauth" ? users : localUsers;
    const user = await db
      .select()
      .from(table)
      .where(eq(table.id, ctx.user.id))
      .limit(1);
    const subs = await db
      .select()
      .from(proSubscriptions)
      .where(
        and(
          eq(proSubscriptions.userId, ctx.user.id),
          eq(proSubscriptions.userType, ctx.user.type),
        ),
      )
      .orderBy(desc(proSubscriptions.createdAt))
      .limit(1);

    const row = user[0];
    let plan = row?.plan ?? "free";
    const role = row?.role ?? "user";

    // Subscription expiration check
    const sub = subs[0];
    if (
      sub &&
      plan !== "free" &&
      (sub.status === "active" || sub.status === "cancelled") &&
      sub.endDate < new Date()
    ) {
      await db
        .update(proSubscriptions)
        .set({ status: "expired" })
        .where(eq(proSubscriptions.id, sub.id));
      // A read that writes, on purpose: the daily job in api/jobs/subscription-expiry-job.ts is the owner of
      // this downgrade, and this is the safety net for the hours between its runs. It goes through the same
      // helper so the paid plan does not survive in a cached session.
      await setPlan(ctx.user.type, ctx.user.id, "free");
      plan = "free";
      sub.status = "expired";
    }

    const settings = await getSystemSettings().catch(() => ({} as Record<string, string>));

    return {
      plan,
      role,
      subscription: sub ?? null,
      features: planFeatures(settings, plan, role),
      included: buildPlanCatalogEntry(settings, asPlanId(plan)),
    };
  }),

  /** What every plan includes, from the settings the server enforces (the plans screen). */
  planCatalog: authedProcedure.query(async () => {
    const settings = await getSystemSettings().catch(() => ({} as Record<string, string>));
    return buildPlanCatalog(settings);
  }),

  /** Starts hosted checkout when Paymob is configured; otherwise signals client to use simulate upgrade. */
  createCheckoutSession: authedProcedure
    .input(z.object({ plan: z.enum(BILLING_PLAN_IDS) }))
    .mutation(async ({ ctx, input }) => {
      if (isPaymobConfigured()) {
        const redirectUrl = await createPaymobHostedCheckoutUrl({
          plan: input.plan,
          clientEmail: ctx.user.email ?? null,
          userId: ctx.user.id,
          userType: ctx.user.type as "oauth" | "local",
        });
        return { mode: "redirect" as const, redirectUrl, paymobReady: true };
      }
      const allowSimulate =
        env.NODE_ENV === "development" || env.BILLING_SIMULATE === "true";
      return {
        mode: allowSimulate ? ("simulate" as const) : ("unavailable" as const),
        redirectUrl: null as string | null,
        paymobReady: false,
      };
    }),

  upgrade: authedProcedure
    .input(
      z.object({
        plan: z.enum(BILLING_PLAN_IDS),
        paymentMethod: z.string(),
        transactionId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (env.NODE_ENV === "production") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "الترقية المباشرة غير مسموح بها في البيئة الإنتاجية. يجب إتمام عملية الدفع عبر بوابة الدفع الرسمية.",
        });
      }
      const simOk = env.BILLING_SIMULATE === "true";
      if (!simOk) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "الترقية المباشرة غير مسموح بها. يجب إتمام عملية الدفع عبر بوابة الدفع الرسمية.",
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
    // Mark the subscription as cancelled, but DO NOT immediately downgrade
    // the user's plan to "free". They've already paid for the current cycle
    // and should retain Pro access until the billing period ends (endDate).
    // A scheduled cron job or middleware check should downgrade expired
    // cancelled subscriptions to "free".
    await db
      .update(proSubscriptions)
      .set({ status: "cancelled", autoRenew: false })
      .where(
        and(
          eq(proSubscriptions.userId, ctx.user.id),
          eq(proSubscriptions.userType, ctx.user.type),
          eq(proSubscriptions.status, "active"),
        ),
      );

    // NOTE: We intentionally do NOT set plan to "free" here.
    // The user keeps Pro access until their subscription endDate.

    return { success: true, message: "تم إلغاء التجديد التلقائي. ستستمر خدمة Pro حتى نهاية فترة الاشتراك الحالية." };
  }),

  listSubscriptions: adminProcedure
    .input(
      z
        .object({
          status: z.string().optional(),
          page: z.number().default(1),
          limit: z.number().default(20),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const { status, page = 1, limit = 20 } = input ?? {};
      const offset = (page - 1) * limit;
      let query = db
        .select()
        .from(proSubscriptions)
        .$dynamic()
        .orderBy(desc(proSubscriptions.createdAt));
      if (status) {
        query = query.where(eq(proSubscriptions.status, status));
      }
      const list = await query.limit(limit).offset(offset);
      const totalQuery = db.select({ count: count() }).from(proSubscriptions).$dynamic();
      const total = status
        ? await totalQuery.where(eq(proSubscriptions.status, status))
        : await totalQuery;
      return { list, total: total[0]?.count ?? 0, page, limit };
    }),
});
