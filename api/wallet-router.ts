import { z } from "zod";
import { bumpFinanceCacheGen } from "./services/finance-semantic-layer";
import { router, authedProcedure } from "./middleware";
import { db } from "./queries/connection";
import { userWallets, expenses, captureMarkers } from "../db/schema";
import { eq, and, or, desc, gte, lt, like, sql } from "drizzle-orm";
import { counterWalletSql, ledgerMovementSql } from "./services/ledger-semantics";
import { financialMovement, movementOf } from "../contracts/ledger-movement";
import { lockLedgerOwner } from "./services/ledger-writer";
import { ledgerBundle, ledgerBundleColumns, ledgerBundleJoin, linkedLedgerFee, standaloneLedgerRowSql } from "./services/ledger-bundles";
import { businessDateKey } from "./lib/app-time";
import { getSystemSettings } from "./lib/settings-cache";
import { walletBalancePolicies } from "./services/wallet-balance-policy";
import { reportPeriod } from "./services/financial-month";

/**
 * A balance as the client typed it, stored in a decimal(12,2) column. Arabic digits and thousands separators are
 * read; anything that is not an amount is refused with a message, where it used to reach MySQL as it was.
 */
export const walletBalanceSchema = z
  .string()
  .trim()
  .transform((value) =>
    value.replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[,،\s]/g, "").replace("٫", "."),
  )
  .pipe(z.string().regex(/^-?\d{1,10}(?:\.\d{1,2})?$/, "الرصيد لازم يكون رقم، زي 1500 أو 1500.50"));

export const walletRouter = router({
  getWallets: authedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select()
      .from(userWallets)
      .where(
        and(
          eq(userWallets.userId, ctx.user.id as number),
          eq(userWallets.userType, ctx.user.type),
        ),
      )
      .orderBy(userWallets.createdAt);
    const enabled = (await getSystemSettings()).capture_financial_version === "cashflow-v1";
    const policy = enabled ? await walletBalancePolicies({ userId: ctx.user.id, userType: ctx.user.type }) : null;
    return rows.map((row) => ({ ...row, balanceKind: policy?.kinds.get(row.id) ?? "unknown", cashBalanceIncluded: !policy?.creditWalletIds.has(row.id) }));
  }),

  getWalletTransactions: authedProcedure
    .input(
      z.object({
        walletId: z.number(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
        groupLinkedFees: z.boolean().default(false),
      }),
    )
    .query(async ({ ctx, input }) => {
      const walletExpenses = await db
        .select(ledgerBundleColumns)
        .from(expenses)
        .leftJoin(linkedLedgerFee, ledgerBundleJoin)
        .where(
          and(
            eq(expenses.userId, ctx.user.id as number),
            eq(expenses.userType, ctx.user.type),
            or(eq(expenses.walletId, input.walletId), sql`${counterWalletSql} = ${input.walletId}`),
            ...(input.groupLinkedFees ? [standaloneLedgerRowSql] : []),
          ),
        )
        .orderBy(desc(expenses.date))
        .limit(input.limit)
        .offset(input.offset);

      return walletExpenses.map(({ entry: row, fee }) => {
        const financial = financialMovement(row);
        if (row.walletId === input.walletId || financial?.counterWalletId !== input.walletId) return input.groupLinkedFees ? ledgerBundle(row, fee, input.walletId) : { ...row, bundle: null };
        const incoming = movementOf(row) === "out";
        const view = { ...row, type: incoming ? "income" : "expense", amount: Math.abs(Number(row.amount)).toFixed(2), walletId: input.walletId,
          parsedMetadata: { ...(row.parsedMetadata as Record<string, unknown> | null), financial: { ...financial, movement: incoming ? "in" : "out" }, walletView: { originalWalletId: row.walletId } } };
        return input.groupLinkedFees ? ledgerBundle(view, fee, input.walletId) : { ...view, bundle: null };
      });
    }),

  /**
   * A wallet's money in and out over one month, summed on the server in Cairo days (from payday with one), over every
   * row of the month rather than a page of them. `month` defaults to the current Cairo calendar month. Money in is
   * income and refunds; money out is spending; transfers move money between the person's own accounts and count in
   * neither.
   */
  getWalletMonth: authedProcedure
    .input(
      z.object({
        walletId: z.number().int().positive(),
        month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
        salaryDay: z.number().int().min(1).max(31).nullable().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const month = input.month ?? businessDateKey().slice(0, 7);
      const { current } = reportPeriod(month, input.salaryDay);
      const incoming = sql`((${expenses.walletId} = ${input.walletId} AND ${ledgerMovementSql} = 'in') OR (${counterWalletSql} = ${input.walletId} AND (${expenses.walletId} IS NULL OR ${expenses.walletId} <> ${input.walletId}) AND ${ledgerMovementSql} = 'out'))`;
      const outgoing = sql`((${expenses.walletId} = ${input.walletId} AND ${ledgerMovementSql} = 'out') OR (${counterWalletSql} = ${input.walletId} AND (${expenses.walletId} IS NULL OR ${expenses.walletId} <> ${input.walletId}) AND ${ledgerMovementSql} = 'in'))`;
      const [row] = await db
        .select({
          moneyIn: sql<string>`COALESCE(SUM(CASE WHEN ${incoming} THEN ABS(${expenses.amount}) ELSE 0 END), 0)`,
          moneyOut: sql<string>`COALESCE(SUM(CASE WHEN ${outgoing} THEN ABS(${expenses.amount}) ELSE 0 END), 0)`,
          count: sql<number>`COUNT(*)`,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.userId, ctx.user.id as number),
            eq(expenses.userType, ctx.user.type),
            or(eq(expenses.walletId, input.walletId), sql`${counterWalletSql} = ${input.walletId}`),
            gte(expenses.date, current.startUtc),
            lt(expenses.date, current.endUtc),
            sql`(${expenses.status} IS NULL OR ${expenses.status} = 'confirmed')`,
          ),
        );
      return {
        month,
        moneyIn: Number(row?.moneyIn ?? 0),
        moneyOut: Number(row?.moneyOut ?? 0),
        count: Number(row?.count ?? 0),
      };
    }),

  createWallet: authedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        provider: z.string().min(1).max(50),
        lastFourDigits: z.string().max(4).optional(),
        balance: walletBalanceSchema.optional(),
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
        // When the balance was given and by whom, so an old figure is never taken for today's.
        ...(input.balance !== undefined ? { balanceObservedAt: new Date(), balanceSource: "user" } : {}),
      });
      return { success: true, insertId: insertResult.insertId };
    }),

  updateWallet: authedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().min(1).max(100).optional(),
        lastFourDigits: z.string().max(4).optional(),
        balance: walletBalanceSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updateData: any = {};
      if (input.name !== undefined) updateData.name = input.name;
      if (input.lastFourDigits !== undefined)
        updateData.lastFourDigits = input.lastFourDigits || null;
      if (input.balance !== undefined) {
        updateData.balance = input.balance;
        updateData.balanceObservedAt = new Date();
        updateData.balanceSource = "user";
      }

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
      await db.transaction(async (tx) => {
        await lockLedgerOwner(tx, { userId: ctx.user.id as number, userType: ctx.user.type });
        await tx.delete(captureMarkers).where(and(eq(captureMarkers.userId, ctx.user.id as number), eq(captureMarkers.userType, ctx.user.type), eq(captureMarkers.kind, "wallet_kind"), like(captureMarkers.value, `${input.id}:%`)));
        await tx.update(expenses).set({ parsedMetadata: sql`JSON_REMOVE(${expenses.parsedMetadata}, '$.financial.counterWalletId')` }).where(and(
          eq(expenses.userId, ctx.user.id as number), eq(expenses.userType, ctx.user.type), sql`${counterWalletSql} = ${input.id}`,
        ));
        // Nullify foreign keys on linked expenses first to prevent orphaned references
        await tx
          .update(expenses)
          .set({ walletId: null })
          .where(
            and(
              eq(expenses.walletId, input.id),
              eq(expenses.userId, ctx.user.id as number),
              eq(expenses.userType, ctx.user.type),
            ),
          );

        await tx
          .delete(userWallets)
          .where(
            and(
              eq(userWallets.id, input.id),
              eq(userWallets.userId, ctx.user.id as number),
              eq(userWallets.userType, ctx.user.type),
            ),
          );
      });
      // The wallet's rows lost their wallet: per-wallet figures are cached, and read them.
      await bumpFinanceCacheGen(ctx.user.id as number, ctx.user.type as "oauth" | "local");
      return { success: true };
    }),
});
