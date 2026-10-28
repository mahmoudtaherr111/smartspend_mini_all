/**
 * Capture for the signed-in app (decision 0028). `sources` is what a phone needs from the capture catalog before it
 * reads a notification (api/lib/capture/catalog.ts): the active banks, wallets and apps with their Android packages and
 * confirmed SMS sender ids, and a `version` so a phone keeps its copy until the catalog changes.
 *
 * The rest sets capture up and answers it: `registerDevice` gives the installation the device token its native code
 * sends signals with (`/api/capture/v1`, api/capture-v1-routes.ts), `setConsent` records what the user agreed to,
 * `pending` lists the transactions waiting for the user, and `answer` records or dismisses one through the ledger
 * writer.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, authedProcedure } from "./middleware";
import { CAPTURE_CONSENT_SCOPES } from "../contracts/capture-intake";
import { getCaptureCatalog, sourcesForPhones } from "./lib/capture/catalog";
import { CAPTURE_CONSENT_TEXT_VERSION, captureConsentsOf, setCaptureConsent } from "./lib/capture/consent";
import { listCaptureDevices, registerCaptureDevice, revokeCaptureDevice } from "./lib/capture/devices";
import { answerEvent, captureLimitOf, captureUsageOf, pendingEvents, releaseHeldEvents } from "./lib/capture/intake";
import { autoOffers, setPairAuto } from "./lib/capture/memory";
import { createRateLimiter } from "./lib/rate-limit";
import { getSystemSettings } from "./lib/settings-cache";

// A stolen session should not mint device tokens in bulk.
const deviceRegistrations = createRateLimiter(10, 3_600_000);

const ownerOf = (ctx: { user: { id: number; type: string } | null }) => ({ userId: ctx.user!.id, userType: ctx.user!.type });

export const captureRouter = router({
  sources: authedProcedure.query(async () => {
    const catalog = await getCaptureCatalog();
    return { version: catalog.version, sources: sourcesForPhones(catalog) };
  }),

  /** Whether capture is open, what the user agreed to, and the consent text version the app must show. */
  status: authedProcedure.query(async ({ ctx }) => {
    const [settings, consent, usage] = await Promise.all([
      getSystemSettings(),
      captureConsentsOf(ownerOf(ctx)),
      captureUsageOf(ownerOf(ctx), ctx.user!.plan),
    ]);
    return { enabled: settings.capture_enabled === "true", consent, consentTextVersion: CAPTURE_CONSENT_TEXT_VERSION, usage };
  }),

  /** The device token for this installation, shown once; registering the same installation again replaces it. */
  registerDevice: authedProcedure
    .input(
      z.object({
        platform: z.enum(["android", "ios"]),
        installationId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
        label: z.string().max(80).optional(),
        appVersion: z.string().max(32).optional(),
        osVersion: z.string().max(32).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const owner = ownerOf(ctx);
      if ((await getSystemSettings()).capture_enabled !== "true") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "تسجيل رسايل البنك مش متاح دلوقتي" });
      }
      await deviceRegistrations.hit(`capture:register:${owner.userType}:${owner.userId}`);
      return registerCaptureDevice(owner, input);
    }),

  devices: authedProcedure.query(async ({ ctx }) => listCaptureDevices(ownerOf(ctx))),

  revokeDevice: authedProcedure.input(z.object({ deviceId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (!(await revokeCaptureDevice(ownerOf(ctx), input.deviceId))) {
      throw new TRPCError({ code: "NOT_FOUND", message: "الجهاز ده مش موجود" });
    }
    return { success: true };
  }),

  setConsent: authedProcedure
    .input(z.object({ scope: z.enum(CAPTURE_CONSENT_SCOPES), granted: z.boolean(), textVersion: z.string().min(1).max(20) }))
    .mutation(async ({ ctx, input }) => {
      if (input.granted && input.textVersion !== CAPTURE_CONSENT_TEXT_VERSION) {
        throw new TRPCError({ code: "CONFLICT", message: "نص الموافقة اتغير، حدّث التطبيق" });
      }
      await setCaptureConsent(ownerOf(ctx), input.scope, input.granted, input.textVersion);
      return captureConsentsOf(ownerOf(ctx));
    }),

  /** The captured transactions waiting for the user, newest first, with where each would be filed. */
  pending: authedProcedure.query(async ({ ctx }) => {
    // After an upgrade, what was held comes back here first.
    if ((await captureLimitOf(ctx.user!.plan)) === 0) await releaseHeldEvents(ownerOf(ctx));
    return pendingEvents(ownerOf(ctx));
  }),

  /**
   * The banks and kinds of message the user recorded as read three times in a row and was not asked about yet: the
   * app offers to record them on their own (decision 0030).
   */
  autoOffers: authedProcedure.query(async ({ ctx }) => {
    const catalog = await getCaptureCatalog();
    const offers = await autoOffers(ownerOf(ctx));
    return offers.map((offer) => {
      const source = catalog.sources.find((item) => item.slug === offer.sourceSlug);
      return { ...offer, sourceName: source ? { ar: source.nameAr, en: source.nameEn } : null };
    });
  }),

  /** The user's answer to an offer: record this bank and kind on their own from now on, or keep asking. */
  setAuto: authedProcedure
    .input(z.object({ sourceSlug: z.string().min(1).max(64), kind: z.string().min(1).max(32), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (!(await setPairAuto(ownerOf(ctx), input.sourceSlug, input.kind, input.enabled))) {
        throw new TRPCError({ code: "NOT_FOUND", message: "مفيش عرض بالشكل ده" });
      }
      return { success: true };
    }),

  answer: authedProcedure
    .input(
      z.object({
        eventId: z.number().int().positive(),
        action: z.enum(["record", "dismiss"]),
        categoryId: z.string().max(60).optional(),
        subCategoryId: z.string().max(60).optional(),
        amountEgp: z.number().positive().max(100_000_000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { eventId, ...answer } = input;
      return answerEvent(ownerOf(ctx), eventId, answer);
    }),
});
