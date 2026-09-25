/**
 * The call's rows in MySQL: `voice_calls` (what the allowance counts and what the call cost) and
 * `voice_call_incidents`. Only counts, tokens and structured fields are written — never anything said
 * (golden rule 10, and the owner's decision that no transcript is stored).
 */
import { and, eq, inArray, lt, or, isNull } from "drizzle-orm";
import { voiceCallIncidents, voiceCalls } from "../../../../db/schema";
import { db } from "../../../queries/connection";
import { createLogger } from "../../../lib/log";
import { recordAiLedger } from "../../../lib/ai-ledger";
import { usageCostUsd, type UsageTotals } from "./pricing";

const log = createLogger("voice-persistence");

export interface CallProgress {
  status: "live" | "reconnecting";
  billedSeconds: number;
  turns: number;
  toolCalls: number;
  incidents: number;
  reconnects: number;
  tokens: UsageTotals;
  costUsd: number;
  metrics: Record<string, unknown>;
}

export interface CallFinal extends Omit<CallProgress, "status"> {
  endReason: string;
  memoryStatus: "pending" | "empty";
  failed: boolean;
}

export interface CallPersistence {
  markLive(callId: string): Promise<void>;
  checkpoint(callId: string, progress: CallProgress): Promise<void>;
  finalize(callId: string, final: CallFinal): Promise<void>;
  incident(
    call: { callId: string; userId: number; userType: string },
    kind: string,
    detail: Record<string, string | number | boolean | null>,
  ): Promise<void>;
}

const usd = (value: number) => value.toFixed(8);

export const mysqlCallPersistence: CallPersistence = {
  async markLive(callId) {
    await db.update(voiceCalls).set({ status: "live", connectedAt: new Date(), lastCheckpointAt: new Date() })
      .where(eq(voiceCalls.id, callId));
  },

  async checkpoint(callId, progress) {
    await db.update(voiceCalls).set({
      status: progress.status,
      billedSeconds: progress.billedSeconds,
      turns: progress.turns,
      toolCalls: progress.toolCalls,
      incidents: progress.incidents,
      reconnects: progress.reconnects,
      tokens: progress.tokens,
      metrics: progress.metrics,
      costUsd: usd(progress.costUsd),
      lastCheckpointAt: new Date(),
    }).where(eq(voiceCalls.id, callId));
  },

  async finalize(callId, final) {
    await db.update(voiceCalls).set({
      status: final.failed ? "failed" : "ended",
      endedAt: new Date(),
      endReason: final.endReason,
      billedSeconds: final.billedSeconds,
      turns: final.turns,
      toolCalls: final.toolCalls,
      incidents: final.incidents,
      reconnects: final.reconnects,
      tokens: final.tokens,
      metrics: final.metrics,
      costUsd: usd(final.costUsd),
      memoryStatus: final.memoryStatus,
      lastCheckpointAt: new Date(),
    }).where(eq(voiceCalls.id, callId));
    // The live session's own cost goes to the AI cost ledger; the tools' text models write their own rows.
    const [call] = await db
      .select({ userId: voiceCalls.userId, userType: voiceCalls.userType, model: voiceCalls.model })
      .from(voiceCalls)
      .where(eq(voiceCalls.id, callId))
      .limit(1);
    if (call) {
      const sum = (side: Record<string, number>) => Object.values(side).reduce((total, tokens) => total + tokens, 0);
      await recordAiLedger({
        userId: call.userId,
        userType: call.userType,
        channel: "voice_call",
        providerSlug: "gemini",
        modelId: call.model,
        promptTokens: sum(final.tokens.input),
        completionTokens: sum(final.tokens.output),
        reasoningTokens: final.tokens.thoughts,
        costUsd: usageCostUsd(final.tokens),
        traceId: callId,
        metadata: { billedSeconds: final.billedSeconds },
      });
    }
  },

  async incident(call, kind, detail) {
    try {
      await db.insert(voiceCallIncidents).values({
        callId: call.callId,
        userId: call.userId,
        userType: call.userType,
        kind,
        detail,
      });
    } catch (error) {
      log.warn({ event: "voice.incident_write_failed", callId: call.callId, kind, err: error }, "Incident not recorded");
    }
  },
};

/**
 * Calls a server stopped holding (a crash or a deploy) stay "live" forever unless someone closes them. Their billed
 * seconds are already checkpointed; this only marks them ended so the history and the admin views are right.
 */
export async function closeAbandonedCalls(user: { userId: number; userType: string }, olderThanMs = 3 * 60_000): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const stale = await db.select({ id: voiceCalls.id }).from(voiceCalls).where(and(
    eq(voiceCalls.userId, user.userId),
    eq(voiceCalls.userType, user.userType),
    inArray(voiceCalls.status, ["starting", "live", "reconnecting"]),
    or(lt(voiceCalls.lastCheckpointAt, cutoff), and(isNull(voiceCalls.lastCheckpointAt), lt(voiceCalls.startedAt, cutoff))),
  ));
  if (stale.length === 0) return 0;
  await db.update(voiceCalls).set({ status: "ended", endReason: "server", endedAt: new Date() })
    .where(inArray(voiceCalls.id, stale.map((row) => row.id)));
  return stale.length;
}
