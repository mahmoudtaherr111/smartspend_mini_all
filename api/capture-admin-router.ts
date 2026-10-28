/**
 * The admin's control of the capture catalog (api/lib/capture/catalog.ts): every bank, wallet, payment network,
 * fintech, telecom and messaging app whose notifications are read, and the subscriptions recognised in card charges.
 * A change reaches every server process within ten seconds and phones at their next check, without a deploy. Editing
 * a seeded row marks it, so the shipped seed never overwrites the admin's version; `restoreSeed` gives it back.
 * Also the numbers of what capture did per bank and kind, and the bulk undo of one bank's recordings (decision 0032).
 */
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { CATALOG_STATUSES } from "../contracts/capture";
import { captureSources, subscriptionCatalog } from "../db/schema";
import { adminProcedure, router } from "./middleware";
import {
  captureSourceInput,
  getCaptureCatalog,
  invalidateCaptureCatalog,
  normalizeSourceInput,
  normalizeSubscriptionInput,
  packagesTakenElsewhere,
  seedSourceBySlug,
  seedSubscriptionBySlug,
  sourceFromRow,
  subscriptionFromRow,
  subscriptionInput,
  syncCaptureSeed,
} from "./lib/capture/catalog";
import { BULK_UNDO_MAX, applyBulkUndo, captureFunnel, previewBulkUndo } from "./lib/capture/operations";
import { db } from "./queries/connection";

const idInput = z.object({ id: z.number().int().positive() });

async function sourceById(id: number) {
  const [row] = await db.select().from(captureSources).where(eq(captureSources.id, id)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "المصدر ده مش موجود." });
  return row;
}

async function subscriptionById(id: number) {
  const [row] = await db.select().from(subscriptionCatalog).where(eq(subscriptionCatalog.id, id)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "الاشتراك ده مش موجود." });
  return row;
}

/** One app belongs to one source: a notification with two owners would be read twice. */
async function assertPackagesFree(slug: string, packages: string[]) {
  const rows = await db.select().from(captureSources);
  const taken = packagesTakenElsewhere(rows.map(sourceFromRow), slug, packages);
  if (taken.length) {
    throw new TRPCError({ code: "CONFLICT", message: `التطبيق ده متسجل لمصدر تاني: ${taken.join("، ")}` });
  }
}

async function assertSlugFree(table: typeof captureSources | typeof subscriptionCatalog, slug: string, exceptId?: number) {
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.slug, slug)).limit(1);
  if (row && row.id !== exceptId) throw new TRPCError({ code: "CONFLICT", message: "الاسم المختصر ده مستخدم قبل كده." });
}

export const captureAdminRouter = router({
  /** Everything in both tables, disabled rows included, with the version phones currently see. */
  catalog: adminProcedure.query(async () => {
    const [sourceRows, subscriptionRows, live] = await Promise.all([
      db.select().from(captureSources),
      db.select().from(subscriptionCatalog),
      getCaptureCatalog(),
    ]);
    return {
      version: live.version,
      sources: sourceRows.map(sourceFromRow).sort((a, b) => a.priority - b.priority || a.slug.localeCompare(b.slug)),
      subscriptions: subscriptionRows.map(subscriptionFromRow).sort((a, b) => a.slug.localeCompare(b.slug)),
    };
  }),

  saveSource: adminProcedure
    .input(z.object({ id: z.number().int().positive().optional(), item: captureSourceInput }))
    .mutation(async ({ input }) => {
      const { id } = input;
      const values = normalizeSourceInput(input.item);
      await assertSlugFree(captureSources, values.slug, id);
      await assertPackagesFree(values.slug, values.androidPackages);
      if (id) {
        await sourceById(id);
        await db.update(captureSources).set({ ...values, adminEditedAt: new Date() }).where(eq(captureSources.id, id));
      } else {
        await db.insert(captureSources).values({ ...values, origin: "admin" });
      }
      await invalidateCaptureCatalog();
      return { success: true };
    }),

  setSourceStatus: adminProcedure
    .input(idInput.extend({ status: z.enum(CATALOG_STATUSES) }))
    .mutation(async ({ input }) => {
      await sourceById(input.id);
      await db.update(captureSources).set({ status: input.status, adminEditedAt: new Date() }).where(eq(captureSources.id, input.id));
      await invalidateCaptureCatalog();
      return { success: true };
    }),

  saveSubscription: adminProcedure
    .input(z.object({ id: z.number().int().positive().optional(), item: subscriptionInput }))
    .mutation(async ({ input }) => {
      const values = normalizeSubscriptionInput(input.item);
      await assertSlugFree(subscriptionCatalog, values.slug, input.id);
      if (input.id) {
        await subscriptionById(input.id);
        await db.update(subscriptionCatalog).set({ ...values, adminEditedAt: new Date() }).where(eq(subscriptionCatalog.id, input.id));
      } else {
        await db.insert(subscriptionCatalog).values({ ...values, origin: "admin" });
      }
      await invalidateCaptureCatalog();
      return { success: true };
    }),

  setSubscriptionStatus: adminProcedure
    .input(idInput.extend({ status: z.enum(CATALOG_STATUSES) }))
    .mutation(async ({ input }) => {
      await subscriptionById(input.id);
      await db
        .update(subscriptionCatalog)
        .set({ status: input.status, adminEditedAt: new Date() })
        .where(eq(subscriptionCatalog.id, input.id));
      await invalidateCaptureCatalog();
      return { success: true };
    }),

  /**
   * Writes the shipped seed now, as boot does on the servers that run background jobs: missing banks and
   * subscriptions are added and untouched seeded rows updated; an admin's rows are left alone.
   */
  syncSeed: adminProcedure.mutation(async () => syncCaptureSeed()),

  /** A seeded row back exactly as shipped, and followed by the seed again from now on. */
  restoreSeed: adminProcedure
    .input(idInput.extend({ table: z.enum(["source", "subscription"]) }))
    .mutation(async ({ input }) => {
      if (input.table === "source") {
        const row = await sourceById(input.id);
        const seed = seedSourceBySlug(row.slug);
        if (!seed) throw new TRPCError({ code: "BAD_REQUEST", message: "المصدر ده اتضاف من الأدمن، مالوش نسخة أصلية." });
        await assertPackagesFree(seed.slug, seed.androidPackages);
        await db.update(captureSources).set({ ...seed, adminEditedAt: null }).where(eq(captureSources.id, input.id));
      } else {
        const row = await subscriptionById(input.id);
        const seed = seedSubscriptionBySlug(row.slug);
        if (!seed) throw new TRPCError({ code: "BAD_REQUEST", message: "الاشتراك ده اتضاف من الأدمن، مالوش نسخة أصلية." });
        await db.update(subscriptionCatalog).set({ ...seed, adminEditedAt: null }).where(eq(subscriptionCatalog.id, input.id));
      }
      await invalidateCaptureCatalog();
      return { success: true };
    }),

  /** What became of the payments captured in the last days, per bank and kind, and the model's queue. */
  funnel: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(30).default(7) }))
    .query(async ({ input }) => captureFunnel(input.days)),

  /**
   * Takes back the ledger rows one bank's messages recorded in a period (a reader version that read them wrong):
   * without `apply` it only counts them.
   */
  bulkUndo: adminProcedure
    .input(
      z.object({
        sourceSlug: z.string().trim().min(1).max(64),
        readerVersion: z.string().trim().min(1).max(32).optional(),
        from: z.string().datetime(),
        to: z.string().datetime(),
        onlyAuto: z.boolean().default(true),
        apply: z.boolean().default(false),
      }),
    )
    .mutation(async ({ input }) => {
      const range = { ...input, from: new Date(input.from), to: new Date(input.to) };
      if (range.from > range.to) throw new TRPCError({ code: "BAD_REQUEST", message: "بداية الفترة بعد نهايتها." });
      const preview = await previewBulkUndo(range);
      if (!input.apply) return { ...preview, removed: 0, max: BULK_UNDO_MAX };
      return { ...preview, removed: await applyBulkUndo(range), max: BULK_UNDO_MAX };
    }),
});
