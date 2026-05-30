import { z } from "zod";
import { router, authedProcedure } from "./middleware";
import { db } from "./queries/connection";
import { userWallets, expenses } from "../db/schema";
import { eq, and, desc, or, like, sql } from "drizzle-orm";

export const walletRouter = router({
  getWallets: authedProcedure.query(async ({ ctx }) => {
    return await db
      .select()
      .from(userWallets)
      .where(
        and(
          eq(userWallets.userId, ctx.user.id as number),
          eq(userWallets.userType, ctx.user.type),
        ),
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
            eq(userWallets.userType, ctx.user.type),
          ),
        )
        .limit(1);

      if (!wallet) {
        return [];
      }

      const qProvider = `%${wallet.provider}%`;
      const qName = `%${wallet.name}%`;

      const conditions = or(
        eq(expenses.paymentMethod, wallet.name),
        eq(expenses.paymentMethod, wallet.provider),
        like(sql`LOWER(${expenses.parsedMetadata})`, qProvider.toLowerCase()),
        like(sql`LOWER(${expenses.description})`, qProvider.toLowerCase()),
        like(sql`LOWER(${expenses.description})`, qName.toLowerCase()),
        like(sql`LOWER(${expenses.rawText})`, qProvider.toLowerCase()),
        like(sql`LOWER(${expenses.rawText})`, qName.toLowerCase())
      );

      const filtered = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, ctx.user.id as number),
            eq(expenses.userType, ctx.user.type),
            conditions
          )
        )
        .orderBy(desc(expenses.date))
        .limit(100);

      return filtered;
    }),

  createWallet: authedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        provider: z.string().min(1).max(50),
        lastFourDigits: z.string().max(4).optional(),
        balance: z.string().optional(),
      }),
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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: any = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.lastFourDigits !== undefined)
        updateData.lastFourDigits = input.lastFourDigits || null;
      if (input.balance !== undefined) updateData.balance = input.balance;

      await db
        .update(userWallets)
        .set(updateData)
        .where(
          and(
            eq(userWallets.id, input.id),
            eq(userWallets.userId, ctx.user.id as number),
            eq(userWallets.userType, ctx.user.type),
          ),
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
            eq(userWallets.userType, ctx.user.type),
          ),
        );
      return { success: true };
    }),
});
