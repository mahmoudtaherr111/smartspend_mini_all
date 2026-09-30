/**
 * Starting a call: decide whether the user may, write the call's row, and hand the app a single-use ticket for
 * the socket. The session token never goes into a WebSocket URL; the ticket lives 60 seconds and opens one call.
 */
import { randomBytes, randomUUID } from "crypto";
import { voiceCalls } from "../../../../db/schema";
import type { VoiceClientPlatform, VoiceMode } from "../../../../contracts/voice-protocol";
import { executeSlidingWindowRateLimit } from "../../../lib/redis-client";
import { mapModelName } from "../../../lib/model-mapper";
import { db } from "../../../queries/connection";
import { getVoiceEntitlements, type VoiceEntitlements, type VoiceEntitlementUser } from "../../entitlements/voice";
import { resolveVoice } from "../brain/voices";
import { getSystemSettings } from "../../../lib/settings-cache";
import { admissionLimits, admitCall, releaseCall } from "./admission";
import { closeAbandonedCalls } from "./persistence";
import { callStateAvailable, putTicket } from "./store";

export interface TicketPayload {
  callId: string;
  userId: number;
  userType: "oauth" | "local";
  plan: string;
  role: string;
  model: string;
  voiceName: string;
  thinkingLevel: VoiceEntitlements["thinkingLevel"];
  /** The coach call's instructions and tools (api/services/voice/brain). */
  coach: boolean;
  /** The mode the call starts in; `model` and `thinkingLevel` are that mode's. Absent in older tickets: standard. */
  mode?: VoiceMode;
  /** What each mode runs on; `ultra` null when the user is not offered it. */
  modes?: { standard: { model: string; thinkingLevel: VoiceEntitlements["thinkingLevel"] }; ultra: { model: string; thinkingLevel: VoiceEntitlements["thinkingLevel"] } | null };
  maxSeconds: number;
  costBudgetUsd: number | null;
  client: VoiceClientPlatform;
}

export type StartCallResult =
  | { kind: "blocked"; reason: string; message: string }
  | { kind: "ok"; callId: string; ticket: string; maxSeconds: number; remainingSeconds: number; voice: string; mode: VoiceMode; ultraAvailable: boolean };

const BLOCKED_MESSAGES: Record<string, string> = {
  disabled: "المكالمة الصوتية مش متاحة في باقتك الحالية.",
  kill_switch: "المكالمة الصوتية متوقفة مؤقتاً. تقدر تكمل بالكتابة في الشات.",
  month_used: "خلصت دقايق المكالمات بتاعة الشهر ده.",
  daily_cost_cap: "وصلت لحد المكالمات النهارده. تقدر تكمل بالكتابة في الشات، أو تكلمني بكرة.",
  rate_limited: "بدأت مكالمات كتير ورا بعض. استنى دقيقة وجرب تاني.",
  unavailable: "المكالمة مش متاحة دلوقتي. جرب بعد شوية.",
  pool_full: "كل الخطوط مشغولة دلوقتي. جرب كمان دقيقة، أو كمل بالكتابة في الشات.",
  user_busy: "عندك مكالمة مفتوحة بالفعل على جهاز تاني. اقفلها الأول، أو استنى دقيقة لو كانت قفلت لوحدها.",
  provider_quota: "المكالمات وصلت لحد الاستخدام المسموح دلوقتي. جرب بعد شوية، أو كمل بالكتابة في الشات.",
};

export async function startVoiceCall(
  user: VoiceEntitlementUser,
  input: { voice?: string; client: VoiceClientPlatform; mode?: VoiceMode },
): Promise<StartCallResult> {
  const entitlements = await getVoiceEntitlements(user);
  const reason = entitlements.blockedReason;
  if (reason) return { kind: "blocked", reason, message: BLOCKED_MESSAGES[reason] };

  const limit = await executeSlidingWindowRateLimit(`voice:start:${user.type}:${user.id}`, 12, 10 * 60_000);
  if (!limit.allowed) return { kind: "blocked", reason: "rate_limited", message: BLOCKED_MESSAGES.rate_limited };
  if (!(await callStateAvailable())) return { kind: "blocked", reason: "unavailable", message: BLOCKED_MESSAGES.unavailable };

  await closeAbandonedCalls({ userId: user.id, userType: user.type });

  const callId = `vc_${randomUUID().replace(/-/g, "")}`;
  const voiceName = resolveVoice(input.voice);
  // Ultra Thinking only when asked for and offered; otherwise the plan's model. Never a silent swap either way.
  const modes = {
    standard: { model: mapModelName(entitlements.model), thinkingLevel: entitlements.thinkingLevel },
    ultra: entitlements.ultra ? { model: mapModelName(entitlements.ultra.model), thinkingLevel: entitlements.ultra.thinkingLevel } : null,
  };
  const mode: VoiceMode = input.mode === "ultra" && modes.ultra ? "ultra" : "standard";
  const { model, thinkingLevel } = mode === "ultra" ? modes.ultra! : modes.standard;
  // A seat in the model's shared pool before anything is written: a full pool or a quota pause is said now, not after
  // the app has connected. The call renews the seat while it lives and gives it back when it ends.
  const seat = { pool: model, callId, user: { id: user.id, type: user.type } };
  const admitted = await admitCall(seat, admissionLimits(await getSystemSettings(), model));
  if (!admitted.ok) return { kind: "blocked", reason: admitted.reason, message: BLOCKED_MESSAGES[admitted.reason] };
  try {
    await db.insert(voiceCalls).values({
      id: callId,
      userId: user.id,
      userType: user.type,
      status: "starting",
      engine: "gemini_live",
      model,
      voice: voiceName,
      client: input.client,
      month: entitlements.month,
      maxSeconds: entitlements.allowedCallSeconds,
    });
  } catch (error) {
    await releaseCall(seat);
    throw error;
  }

  const ticket = `tk_${randomBytes(24).toString("base64url")}`;
  const payload: TicketPayload = {
    callId,
    userId: user.id,
    userType: user.type,
    plan: entitlements.plan,
    role: String(user.role ?? "user"),
    model,
    voiceName,
    thinkingLevel,
    coach: entitlements.coach,
    mode,
    modes,
    maxSeconds: entitlements.allowedCallSeconds,
    costBudgetUsd: entitlements.dailyCostCapUsd > 0
      ? Math.max(0, entitlements.dailyCostCapUsd - entitlements.spentTodayUsd)
      : null,
    client: input.client,
  };
  await putTicket(ticket, payload);
  return {
    kind: "ok",
    callId,
    ticket,
    maxSeconds: entitlements.allowedCallSeconds,
    remainingSeconds: entitlements.remainingSecondsThisMonth,
    voice: voiceName,
    mode,
    ultraAvailable: Boolean(modes.ultra),
  };
}
