/**
 * Starting a call: decide whether the user may, write the call's row, and hand the app a single-use ticket for
 * the socket. The session token never goes into a WebSocket URL; the ticket lives 60 seconds and opens one call.
 */
import { randomBytes, randomUUID } from "crypto";
import { voiceCalls } from "../../../../db/schema";
import type { VoiceClientPlatform } from "../../../../contracts/voice-protocol";
import { executeSlidingWindowRateLimit } from "../../../lib/redis-client";
import { mapModelName } from "../../../lib/model-mapper";
import { db } from "../../../queries/connection";
import { getVoiceEntitlements, type VoiceEntitlements, type VoiceEntitlementUser } from "../../entitlements/voice";
import { resolveVoice } from "../brain/voices";
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
  maxSeconds: number;
  costBudgetUsd: number | null;
  client: VoiceClientPlatform;
}

export type StartCallResult =
  /** Not in the new call's rollout: the app keeps using the old call. */
  | { kind: "legacy" }
  | { kind: "blocked"; reason: string; message: string }
  | { kind: "ok"; callId: string; ticket: string; maxSeconds: number; remainingSeconds: number; voice: string };

const BLOCKED_MESSAGES: Record<string, string> = {
  disabled: "المكالمة الصوتية مش متاحة في باقتك الحالية.",
  kill_switch: "المكالمة الصوتية متوقفة مؤقتاً. تقدر تكمل بالكتابة في الشات.",
  month_used: "خلصت دقايق المكالمات بتاعة الشهر ده.",
  daily_cost_cap: "وصلت لحد المكالمات النهارده. تقدر تكمل بالكتابة في الشات، أو تكلمني بكرة.",
  rate_limited: "بدأت مكالمات كتير ورا بعض. استنى دقيقة وجرب تاني.",
  unavailable: "المكالمة مش متاحة دلوقتي. جرب بعد شوية.",
};

export async function startVoiceCall(
  user: VoiceEntitlementUser,
  input: { voice?: string; client: VoiceClientPlatform },
): Promise<StartCallResult> {
  const entitlements = await getVoiceEntitlements(user);
  // Outside the rollout, or with the kill switch on, the app keeps the old call while it still exists.
  if (!entitlements.v2) return { kind: "legacy" };
  const reason = entitlements.blockedReason;
  if (reason) return { kind: "blocked", reason, message: BLOCKED_MESSAGES[reason] };

  const limit = await executeSlidingWindowRateLimit(`voice:start:${user.type}:${user.id}`, 12, 10 * 60_000);
  if (!limit.allowed) return { kind: "blocked", reason: "rate_limited", message: BLOCKED_MESSAGES.rate_limited };
  if (!(await callStateAvailable())) return { kind: "blocked", reason: "unavailable", message: BLOCKED_MESSAGES.unavailable };

  await closeAbandonedCalls({ userId: user.id, userType: user.type });

  const callId = `vc_${randomUUID().replace(/-/g, "")}`;
  const voiceName = resolveVoice(input.voice);
  const model = mapModelName(entitlements.model);
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

  const ticket = `tk_${randomBytes(24).toString("base64url")}`;
  const payload: TicketPayload = {
    callId,
    userId: user.id,
    userType: user.type,
    plan: entitlements.plan,
    role: String(user.role ?? "user"),
    model,
    voiceName,
    thinkingLevel: entitlements.thinkingLevel,
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
  };
}
