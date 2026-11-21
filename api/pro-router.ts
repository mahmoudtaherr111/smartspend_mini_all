import { z } from "zod";
import { router, authedProcedure, adminProcedure } from "./middleware";
import { db } from "./queries/connection";
import { users, localUsers, proSubscriptions, storePurchases } from "../db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  acknowledgeGooglePurchase,
  applyStoreEvent,
  fetchGoogleSubscription,
  googlePurchaseKey,
  grantsAccess,
  isAppStoreConfigured,
  isGooglePlayConfigured,
  STORE_IDS,
  STORE_PRODUCT_IDS,
  storeAccountToken,
  validateTokenInput,
  verifyAppleStoreKitTransaction,
  type EntitlementState,
  type StoreEventResult,
  type StoreId,
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

const storePurchaseInput = z.object({
  store: z.enum(STORE_IDS),
  purchaseToken: z.string().min(1).max(16_384),
});

function storeUnavailable(): TRPCError {
  return new TRPCError({ code: "PRECONDITION_FAILED", message: "الشراء من المتجر مش متاح دلوقتي." });
}

/** Asks the store what this token really is and writes that through the ledger. */
async function confirmStorePurchase(
  user: { id: number; type: string },
  store: StoreId,
  token: string,
): Promise<StoreEventResult> {
  const owner = { userId: user.id, userType: user.type as "local" | "oauth" };
  const expectedAccount = storeAccountToken(owner);

  if (store === "google_play") {
    if (!isGooglePlayConfigured()) throw storeUnavailable();
    if (!validateTokenInput(token)) return { outcome: "unknown_purchase" };
    const purchase = await fetchGoogleSubscription(token);
    if (!purchase) return { outcome: "unknown_purchase" };
    if (purchase.accountToken && purchase.accountToken !== expectedAccount) {
      return { outcome: "owned_by_another_account" };
    }
    const result = await applyStoreEvent({
      store,
      purchaseKey: googlePurchaseKey(token),
      replacesPurchaseKey: purchase.linkedPurchaseToken ? googlePurchaseKey(purchase.linkedPurchaseToken) : null,
      purchaseToken: token,
      productId: purchase.productId,
      state: purchase.state,
      expiresAt: purchase.expiresAt,
      eventId: `confirm:${purchase.orderId ?? googlePurchaseKey(token)}:${purchase.state}`,
      eventType: "confirm",
      eventTime: new Date(),
      owner,
    });
    if (result.outcome === "applied" && !purchase.acknowledged) {
      await acknowledgeGooglePurchase(token, purchase.productId);
    }
    return result;
  }

  if (!isAppStoreConfigured()) throw storeUnavailable();
  const tx = verifyAppleStoreKitTransaction(token);
  if (!tx || !(STORE_PRODUCT_IDS as readonly string[]).includes(tx.productId)) return { outcome: "unknown_purchase" };
  if (tx.accountToken && tx.accountToken !== expectedAccount) return { outcome: "owned_by_another_account" };
  const state: EntitlementState = tx.revoked ? "revoked" : "active";
  return applyStoreEvent({
    store,
    purchaseKey: tx.originalTransactionId,
    purchaseToken: tx.transactionId,
    productId: tx.productId,
    state: grantsAccess(state, tx.expiresAt, new Date()) || tx.revoked ? state : "expired",
    expiresAt: tx.expiresAt,
    eventId: `confirm:${tx.transactionId}:${state}`,
    eventType: "confirm",
    eventTime: new Date(),
    owner,
  });
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
      if (storeSub.status === "in_grace_period") {
        activeSubscriptionFound = true;
      } else if (storeSub.expiresAt && (storeSub.status === "active" || storeSub.status === "cancelled") && storeSub.expiresAt >= now) {
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

  /** Whether the stores can sell here, and the value the app passes with a purchase to tie it to this account. */
  storeBilling: authedProcedure.query(({ ctx }) => ({
    googlePlay: isGooglePlayConfigured(),
    appStore: isAppStoreConfigured(),
    productIds: STORE_PRODUCT_IDS,
    accountToken: storeAccountToken({ userId: ctx.user.id, userType: ctx.user.type as "local" | "oauth" }),
  })),

  /** Records a purchase the store confirms. What the phone sends only says where to look. */
  verifyStorePurchase: authedProcedure
    .input(storePurchaseInput)
    .mutation(async ({ ctx, input }) => {
      const result = await confirmStorePurchase(ctx.user, input.store, input.purchaseToken);
      if (result.outcome === "owned_by_another_account") {
        throw new TRPCError({ code: "FORBIDDEN", message: "عملية الشراء دي مسجلة على حساب تاني." });
      }
      if (result.outcome === "unknown_purchase") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "المتجر ما أكدش عملية الشراء دي." });
      }
      return { state: result.state, plan: result.plan };
    }),

  /** Restores the store purchases this phone holds, for a new phone or a reinstall. */
  restorePurchases: authedProcedure
    .input(z.object({ store: z.enum(STORE_IDS), tokens: z.array(storePurchaseInput.shape.purchaseToken).max(20) }))
    .mutation(async ({ ctx, input }) => {
      const results = await Promise.all(
        input.tokens.map((token) => confirmStorePurchase(ctx.user, input.store, token)),
      );
      const restored = results.some((result) => "state" in result && (result.state === "active" || result.state === "in_grace_period"));
      return { restored };
    }),
});
