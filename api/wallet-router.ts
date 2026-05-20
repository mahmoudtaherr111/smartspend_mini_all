import { z } from "zod";
import { router, authedProcedure } from "./middleware";
import { db } from "./queries/connection";
import { userWallets, expenses } from "../db/schema";
import { eq, and, desc } from "drizzle-orm";

export const walletRouter = router({
  getWallets: authedProcedure.query(async ({ ctx }) => {
    return await db
      .select()
      .from(userWallets)
      .where(
        and(
          eq(userWallets.userId, ctx.user.id as number),
          eq(userWallets.userType, ctx.user.type)
        )
      )
      .orderBy(userWallets.createdAt);
  }),

  getWalletTransactions: authedProcedure
    .input(z.object({ walletId: z.number() }))
    .query(async ({ ctx, input }) => {
      // 1. Fetch the wallet
      const [wallet] = await db
        .select()
        .from(userWallets)
        .where(
          and(
            eq(userWallets.id, input.walletId),
            eq(userWallets.userId, ctx.user.id as number),
            eq(userWallets.userType, ctx.user.type)
          )
        )
        .limit(1);

      if (!wallet) {
        return [];
      }

      // 2. Fetch all expenses for the user (recent 200)
      const userExpenses = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, ctx.user.id as number),
            eq(expenses.userType, ctx.user.type)
          )
        )
        .orderBy(desc(expenses.date))
        .limit(200);

      // 3. Filter expenses in JS to find matching ones
      const filtered = userExpenses.filter((exp) => {
        // Match by exact payment method if set
        if (exp.paymentMethod === wallet.name || exp.paymentMethod === wallet.provider) {
          return true;
        }
        // Match by SMS provider metadata
        if (exp.parsedMetadata && typeof exp.parsedMetadata === "object") {
          const meta = exp.parsedMetadata as any;
          if (meta.provider === wallet.provider) {
            return true;
          }
        }
        // Fallback: search in description or rawText for provider/name (case-insensitive)
        const provLower = wallet.provider.toLowerCase();
        const nameLower = wallet.name.toLowerCase();
        const descLower = (exp.description || "").toLowerCase();
        const rawLower = (exp.rawText || "").toLowerCase();
        if (
          descLower.includes(provLower) ||
          descLower.includes(nameLower) ||
          rawLower.includes(provLower) ||
          rawLower.includes(nameLower)
        ) {
          return true;
        }

        return false;
      });

      return filtered;
    }),

  createWallet: authedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        provider: z.string().min(1).max(50),
        lastFourDigits: z.string().max(4).optional(),
        balance: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [insertResult] = await db.insert(userWallets).values({
        userId: ctx.user.id as number,
        userType: ctx.user.type,
        name: input.name,
        provider: input.provider,
        lastFourDigits: input.lastFourDigits || null,
        balance: input.balance || "0.00",
      });
      return { success: true, insertId: insertResult.insertId };
    }),

  updateWallet: authedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        lastFourDigits: z.string().max(4).optional(),
        balance: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: any = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.lastFourDigits !== undefined) updateData.lastFourDigits = input.lastFourDigits || null;
      if (input.balance !== undefined) updateData.balance = input.balance;

      await db
        .update(userWallets)
        .set(updateData)
        .where(
          and(
            eq(userWallets.id, input.id),
            eq(userWallets.userId, ctx.user.id as number),
            eq(userWallets.userType, ctx.user.type)
          )
        );
      return { success: true };
    }),

  deleteWallet: authedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(userWallets)
        .where(
          and(
            eq(userWallets.id, input.id),
            eq(userWallets.userId, ctx.user.id as number),
            eq(userWallets.userType, ctx.user.type)
          )
        );
      return { success: true };
    }),
});
