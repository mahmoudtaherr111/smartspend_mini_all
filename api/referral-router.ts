import { z } from "zod";
import { router, authedProcedure, adminProcedure } from "./middleware";
import { db } from "./queries/connection";
import {
  users,
  localUsers,
  referrals,
  discountCodes,
} from "../db/schema";
import { getSystemSettings } from "./lib/settings-cache";
import { eq, and, sql, count, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

function generateCode() {
  return "SS" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

export const referralRouter = router({
  // ─── Get My Referral Code ───
  myCode: authedProcedure.query(async ({ ctx }) => {
    const table = ctx.user.type === "oauth" ? users : localUsers;
    const user = await db
      .select()
      .from(table)
      .where(eq(table.id, ctx.user.id))
      .limit(1);
    let code = user[0]?.referralCode;

    if (!code) {
      code = generateCode();
      // Ensure unique
      let exists = true;
      let attempts = 0;
      while (exists && attempts < 10) {
        attempts++;
        const check = await db
          .select()
          .from(table)
          .where(eq(table.referralCode, code!))
          .limit(1);
        const check2 = await db
          .select()
          .from(discountCodes)
          .where(eq(discountCodes.code, code!))
          .limit(1);
        if (check.length === 0 && check2.length === 0) {
          exists = false;
        } else {
          code = generateCode() + Math.floor(Math.random() * 100);
        }
      }
      await db
        .update(table)
        .set({ referralCode: code })
        .where(eq(table.id, ctx.user.id));
    }

    const referralCount = await db
      .select({ count: count() })
      .from(referrals)
      .where(
        and(
          eq(referrals.referrerId, ctx.user.id),
          eq(referrals.referrerType, ctx.user.type),
        ),
      );
    const completedCount = await db
      .select({ count: count() })
      .from(referrals)
      .where(
        and(
          eq(referrals.referrerId, ctx.user.id),
          eq(referrals.referrerType, ctx.user.type),
          eq(referrals.status, "completed"),
        ),
      );

    const settings = await getSystemSettings();
    const discount = settings["promo_code_discount"] || "20";

    return {
      code,
      totalReferrals: referralCount[0]?.count ?? 0,
      completed: completedCount[0]?.count ?? 0,
      discount,
    };
  }),

  // ─── Apply Referral Code ───
  applyCode: authedProcedure
    .input(z.object({ code: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Can't refer yourself
      const myTable = ctx.user.type === "oauth" ? users : localUsers;
      const me = await db
        .select()
        .from(myTable)
        .where(eq(myTable.id, ctx.user.id))
        .limit(1);
      if (me[0]?.referralCode === input.code) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "مش ممكن تستخدم كودك",
        });
      }

      // Find referrer
      const oauthReferrer = await db
        .select()
        .from(users)
        .where(eq(users.referralCode, input.code))
        .limit(1);
      let referrerType: "oauth" | "local" = "oauth";
      let referrerId: number | null = null;

      if (oauthReferrer.length > 0) {
        referrerId = oauthReferrer[0].id;
        referrerType = "oauth";
      } else {
        const localReferrer = await db
          .select()
          .from(localUsers)
          .where(eq(localUsers.referralCode, input.code))
          .limit(1);
        if (localReferrer.length > 0) {
          referrerId = localReferrer[0].id;
          referrerType = "local";
        }
      }

      if (referrerId === null) {
        throw new TRPCError({ code: "NOT_FOUND", message: "الكود غير موجود" });
      }

      // Check if already referred
      const existing = await db
        .select()
        .from(referrals)
        .where(
          and(
            eq(referrals.referredId, ctx.user.id),
            eq(referrals.referredType, ctx.user.type),
          ),
        )
        .limit(1);
      if (existing.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "أنت مسجل بالفعل بكود إحالة",
        });
      }

      await db.insert(referrals).values({
        referrerId: referrerId,
        referrerType,
        referredId: ctx.user.id,
        referredType: ctx.user.type,
        codeUsed: input.code,
        status: "completed",
      });

      // Update referredBy
      await db
        .update(myTable)
        .set({ referredBy: referrerId })
        .where(eq(myTable.id, ctx.user.id));

      return { success: true, message: "تم تطبيق الكود بنجاح!" };
    }),

  // ─── My Referrals ───
  myReferrals: authedProcedure.query(async ({ ctx }) => {
    return await db
      .select()
      .from(referrals)
      .where(
        and(
          eq(referrals.referrerId, ctx.user.id),
          eq(referrals.referrerType, ctx.user.type),
        ),
      )
      .orderBy(desc(referrals.createdAt));
  }),

  // ─── Admin: List All Referrals ───
  listAll: adminProcedure
    .input(
      z
        .object({
          page: z.number().default(1),
          limit: z.number().default(50),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const { page = 1, limit = 50 } = input ?? {};
      const offset = (page - 1) * limit;
      const list = await db
        .select()
        .from(referrals)
        .orderBy(desc(referrals.createdAt))
        .limit(limit)
        .offset(offset);
      const total = await db.select({ count: count() }).from(referrals);
      return { list, total: total[0]?.count ?? 0, page, limit };
    }),
});
