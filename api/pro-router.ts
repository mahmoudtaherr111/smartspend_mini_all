import { z } from "zod";
import { router, authedProcedure, adminProcedure } from "./middleware";
import { db } from "./queries/connection";
import { users, localUsers, proSubscriptions, storePurchases } from "../db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  globalEntitlementStateMachine,
  verifyGooglePlayPurchaseToken,
  verifyAppleStoreKitTransaction,
} from "./lib/store-billing";
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

    const storeSubs = await db
      .select()
      .from(storePurchases)
      .where(
        and(
          eq(storePurchases.userId, ctx.user.id),
          eq(storePurchases.userType, ctx.user.type),
        ),
      )
      .orderBy(desc(storePurchases.createdAt))
      .limit(1);

    const row = user[0];
    let plan = row?.plan ?? "free";
    const role = row?.role ?? "user";
    const now = new Date();

    const sub = subs[0];
    const storeSub = storeSubs[0];
    let activeSubscriptionFound = false;

    // Check web subscription
    if (sub) {
      if ((sub.status === "active" || sub.status === "cancelled") && sub.endDate >= now) {
        activeSubscriptionFound = true;
      } else if ((sub.status === "active" || sub.status === "cancelled") && sub.endDate < now) {
        await db
          .update(proSubscriptions)
          .set({ status: "expired" })
          .where(eq(proSubscriptions.id, sub.id));
        sub.status = "expired";
      }
    }

    // Check mobile store subscription
    if (storeSub) {
      if (storeSub.expiresAt && (storeSub.status === "active" || storeSub.status === "cancelled") && storeSub.expiresAt >= now) {
        activeSubscriptionFound = true;
      } else if (storeSub.expiresAt && (storeSub.status === "active" || storeSub.status === "cancelled") && storeSub.expiresAt < now) {
        await db
          .update(storePurchases)
          .set({ status: "expired" })
          .where(eq(storePurchases.id, storeSub.id));
        storeSub.status = "expired";
      }
    }

    // Downgrade to free if no active subscription exists
    if (!activeSubscriptionFound && plan !== "free" && role !== "admin") {
      await setPlan(ctx.user.type, ctx.user.id, "free");
      plan = "free";
    }

    const effectiveSubscription = sub ?? (storeSub ? {
      id: storeSub.id,
      userId: storeSub.userId,
      userType: storeSub.userType,
      plan: storeSub.storeProductId?.toLowerCase().includes("ultra") ? "ultra" : "pro",
      status: storeSub.status,
      startDate: storeSub.createdAt,
      endDate: storeSub.expiresAt ?? storeSub.createdAt,
      paymobOrderId: storeSub.originalTransactionId,
    } : null);

    const settings = await getSystemSettings().catch(() => ({} as Record<string, string>));

    return {
      plan,
      role,
      subscription: effectiveSubscription,
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

  /** Verifies mobile in-app purchases (Google Play or Apple App Store) and activates Pro. */
  verifyStorePurchase: authedProcedure
    .input(
      z.object({
        store: z.enum(["google_play", "app_store"]),
        productId: z.string(),
        purchaseToken: z.string(),
        signature: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.purchaseToken || input.purchaseToken.length > 4096 || input.purchaseToken.includes("\0")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "رمز الشراء غير صالح أو تالف.",
        });
      }

      let verifiedOriginalTxId: string;
      let verifiedTxId: string;
      let expiresDate: Date;

      if (input.store === "google_play") {
        const verifyRes = await verifyGooglePlayPurchaseToken(input.purchaseToken, input.productId);
        if (!verifyRes.valid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "فشل التحقق من صحة عملية الشراء من متجر Google Play.",
          });
        }
        verifiedOriginalTxId = input.purchaseToken;
        verifiedTxId = verifyRes.orderId ?? input.purchaseToken;
        expiresDate = new Date(verifyRes.expiryTimeMillis ?? Date.now() + 30 * 24 * 60 * 60 * 1000);
      } else {
        const verifyRes = await verifyAppleStoreKitTransaction(input.purchaseToken, input.productId);
        if (!verifyRes.valid) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "فشل التحقق من صحة عملية الشراء من App Store.",
          });
        }
        verifiedOriginalTxId = verifyRes.originalTransactionId ?? input.purchaseToken;
        verifiedTxId = verifyRes.transactionId ?? input.purchaseToken;
        expiresDate = new Date(verifyRes.expiresDate ?? Date.now() + 30 * 24 * 60 * 60 * 1000);
      }

      const subKey = `${input.store === "google_play" ? "android" : "ios"}:${verifiedOriginalTxId}`;
      const existingPurchase = await db
        .select()
        .from(storePurchases)
        .where(eq(storePurchases.originalTransactionId, verifiedOriginalTxId))
        .limit(1);

      if (existingPurchase[0]) {
        if (existingPurchase[0].userId !== ctx.user.id || existingPurchase[0].userType !== ctx.user.type) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "عملية الشراء مسجلة لحساب آخر.",
          });
        }
        if (!globalEntitlementStateMachine.getSubscription(subKey)) {
          globalEntitlementStateMachine.setSubscription(subKey, {
            platform: input.store === "google_play" ? "android" : "ios",
            originalTxId: verifiedOriginalTxId,
            tokenOrTxId: verifiedTxId,
            productId: existingPurchase[0].storeProductId || input.productId,
            userId: String(existingPurchase[0].userId),
            userType: (existingPurchase[0].userType === "oauth" ? "oauth" : "local") as "local" | "oauth",
            status: (existingPurchase[0].status?.toUpperCase() || "ACTIVE") as any,
            lastEventTime: existingPurchase[0].updatedAt?.getTime() ?? Date.now(),
            expiresAt: existingPurchase[0].expiresAt?.getTime() ?? expiresDate.getTime(),
          });
        }
      }

      const transition = globalEntitlementStateMachine.processStoreEvent({
        platform: input.store === "google_play" ? "android" : "ios",
        originalTxId: verifiedOriginalTxId,
        tokenOrTxId: verifiedTxId,
        productId: input.productId,
        userId: String(ctx.user.id),
        userType: ctx.user.type as "local" | "oauth",
        eventType: "PURCHASE",
        eventTime: Date.now(),
        expiresAt: expiresDate.getTime(),
        eventId: verifiedTxId,
      });

      if (!transition.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ما عرفناش نفعّل الاشتراك: " + (transition.reason ?? "حالة مش صالحة"),
        });
      }

      if (existingPurchase[0]) {
        await db
          .update(storePurchases)
          .set({
            status: transition.state.toLowerCase(),
            expiresAt: expiresDate,
            purchaseToken: input.purchaseToken,
            rawPayload: {
              verifiedTxId,
              eventType: "PURCHASE",
              eventId: verifiedTxId,
              processedEvents: [verifiedTxId],
            },
          })
          .where(eq(storePurchases.id, existingPurchase[0].id));
      } else {
        await db.insert(storePurchases).values({
          userId: ctx.user.id,
          userType: ctx.user.type,
          store: input.store,
          storeProductId: input.productId,
          originalTransactionId: verifiedOriginalTxId,
          purchaseToken: input.purchaseToken,
          status: transition.state.toLowerCase(),
          expiresAt: expiresDate,
          rawPayload: {
            verifiedTxId,
            eventType: "PURCHASE",
            eventId: verifiedTxId,
            processedEvents: [verifiedTxId],
          },
        });
      }

      await setPlan(ctx.user.type, ctx.user.id, transition.effectivePlan);

      return {
        status: "active" as const,
        entitlement: transition.effectivePlan,
        expiresAt: expiresDate.toISOString(),
      };
    }),

  /** Restores existing mobile store purchases on a new device. */
  restorePurchases: authedProcedure
    .input(
      z.object({
        store: z.enum(["google_play", "app_store"]),
        tokens: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!input.tokens || input.tokens.length === 0) {
        return { restored: false, plan: ctx.user.plan };
      }

      let activeFound = false;
      let latestExpiry = new Date(0);
      let restoredPlan: "pro" | "ultra" = "pro";

      for (const token of input.tokens) {
        if (!token || token.length > 4096 || token.includes("\0")) continue;

        let verifiedOriginalTxId: string | undefined;
        let exp: Date | undefined;
        let identifiedProductId = "pro_monthly";

        if (input.store === "google_play") {
          const verifyRes = await verifyGooglePlayPurchaseToken(token, "pro_monthly");
          if (verifyRes.valid) {
            verifiedOriginalTxId = token;
            exp = new Date(verifyRes.expiryTimeMillis ?? Date.now() + 30 * 24 * 60 * 60 * 1000);
          }
        } else {
          const verifyRes = await verifyAppleStoreKitTransaction(token, "pro_monthly");
          if (verifyRes.valid) {
            verifiedOriginalTxId = verifyRes.originalTransactionId ?? token;
            exp = new Date(verifyRes.expiresDate ?? Date.now() + 30 * 24 * 60 * 60 * 1000);
          }
        }

        if (verifiedOriginalTxId && exp && exp > new Date()) {
          // Check ownership to prevent cross-user token theft
          const existing = await db
            .select()
            .from(storePurchases)
            .where(eq(storePurchases.originalTransactionId, verifiedOriginalTxId))
            .limit(1);

          if (existing[0]) {
            if (existing[0].userId !== ctx.user.id || existing[0].userType !== ctx.user.type) {
              // Token already claimed by another user — prevent hijacking
              continue;
            }
            if (existing[0].storeProductId?.toLowerCase().includes("ultra")) {
              restoredPlan = "ultra";
            }
            await db
              .update(storePurchases)
              .set({
                status: "active",
                expiresAt: exp,
              })
              .where(eq(storePurchases.id, existing[0].id));
          } else {
            const isUltra = token.toLowerCase().includes("ultra");
            identifiedProductId = isUltra ? "ultra_monthly" : "pro_monthly";
            if (isUltra) {
              restoredPlan = "ultra";
            }
            await db.insert(storePurchases).values({
              userId: ctx.user.id,
              userType: ctx.user.type,
              store: input.store,
              storeProductId: identifiedProductId,
              originalTransactionId: verifiedOriginalTxId,
              purchaseToken: token,
              status: "active",
              expiresAt: exp,
              rawPayload: { restored: true, timestamp: Date.now() },
            });
          }

          activeFound = true;
          if (exp > latestExpiry) latestExpiry = exp;
        }
      }

      if (activeFound) {
        await setPlan(ctx.user.type, ctx.user.id, restoredPlan);
        return {
          restored: true,
          plan: restoredPlan,
          expiresAt: latestExpiry.toISOString(),
        };
      }

      return {
        restored: false,
        plan: ctx.user.plan,
      };
    }),
});
