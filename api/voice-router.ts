/**
 * The live call's procedures: whether the user can call and how many minutes are left, starting a call
 * (a single-use ticket for the /api/voice/v2 socket), the user's recent calls, and the admin's dashboard. The call itself runs on the
 * socket; see docs/systems/voice-calls.md.
 */
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { voiceCalls } from "../db/schema";
import { adminProcedure, authedProcedure, router } from "./middleware";
import { db } from "./queries/connection";
import { getVoiceEntitlements } from "./services/entitlements/voice";
import { loadVoiceStats } from "./services/voice/admin-stats";
import { DEFAULT_VOICE, VOICE_CHOICES } from "./services/voice/brain/voices";
import { startVoiceCall } from "./services/voice/gateway/start-call";

export const voiceRouter = router({
  eligibility: authedProcedure.query(async ({ ctx }) => {
    const entitlements = await getVoiceEntitlements({ id: ctx.user.id, type: ctx.user.type, plan: ctx.user.plan, role: ctx.user.role });
    return {
      // The ways into the call show unless the plan has no calls or the admin stopped them for everyone.
      available: entitlements.enabled && !entitlements.killSwitch,
      enabled: entitlements.enabled,
      blockedReason: entitlements.blockedReason,
      minutesLeft: Math.floor(entitlements.remainingSecondsThisMonth / 60),
      maxCallSeconds: entitlements.allowedCallSeconds,
      voices: Object.entries(VOICE_CHOICES).map(([id, voice]) => ({ id, label: voice.labelAr, gender: voice.gender })),
      defaultVoice: DEFAULT_VOICE,
    };
  }),

  startCall: authedProcedure
    .input(z.object({
      voice: z.string().max(20).optional(),
      client: z.enum(["web", "pwa", "android", "ios"]).default("web"),
    }))
    .mutation(({ ctx, input }) =>
      startVoiceCall({ id: ctx.user.id, type: ctx.user.type, plan: ctx.user.plan, role: ctx.user.role }, input)),

  listCalls: authedProcedure.query(async ({ ctx }) => {
    const rows = await db
      .select({
        id: voiceCalls.id,
        startedAt: voiceCalls.startedAt,
        billedSeconds: voiceCalls.billedSeconds,
        endReason: voiceCalls.endReason,
        memoryStatus: voiceCalls.memoryStatus,
      })
      .from(voiceCalls)
      .where(and(eq(voiceCalls.userId, ctx.user.id), eq(voiceCalls.userType, ctx.user.type)))
      .orderBy(desc(voiceCalls.startedAt))
      .limit(20);
    return { calls: rows };
  }),

  /** The admin console's calls dashboard: counts, minutes, cost and speed over the last days, never content. */
  adminStats: adminProcedure
    .input(z.object({ days: z.union([z.literal(1), z.literal(7), z.literal(30)]).default(7) }))
    .query(({ input }) => loadVoiceStats(input.days)),
});
