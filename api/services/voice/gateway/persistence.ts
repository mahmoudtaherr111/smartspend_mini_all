/**
 * The call's rows in MySQL: `voice_calls` (what the allowance counts and what the call cost) and
 * `voice_call_incidents`. Only counts, tokens and structured fields are written — never anything said
 * (golden rule 10, and the owner's decision that no transcript is stored).
 */
import { and, eq, inArray, lt, or, isNull, sql } from "drizzle-orm";
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
  /** Durable one-time permission for one draft, also when a stale server or a reconnect tries again. */
  claimWrite?(callId: string, draftId: string): Promise<boolean>;
  markLive(callId: string): Promise<void>;
  checkpoint(callId: string, progress: CallProgress): Promise<void>;
  finalize(
    callId: string,
    final: CallFinal,
  ): Promise<void | { keepTranscript: boolean }>;
  incident(
    call: { callId: string; userId: number; userType: string },
    kind: string,
    detail: Record<string, string | number | boolean | null>,
  ): Promise<void>;
}

const usd = (value: number) => value.toFixed(8);

export const mysqlCallPersistence: CallPersistence = {
  async claimWrite(callId, draftId) {
    if (!/^dr_[A-Za-z0-9_-]{8,40}$/.test(draftId)) return false;
    const path = `$.writeClaims."${draftId}"`;
    const [result] = await db
      .update(voiceCalls)
      .set({
        metrics: sql`JSON_MERGE_PATCH(COALESCE(${voiceCalls.metrics}, JSON_OBJECT()), JSON_OBJECT('writeClaims', JSON_OBJECT(${draftId}, 'claimed')))`,
      })
      .where(
        and(
          eq(voiceCalls.id, callId),
          inArray(voiceCalls.status, ["live", "reconnecting"]),
          sql`JSON_CONTAINS_PATH(COALESCE(${voiceCalls.metrics}, JSON_OBJECT()), 'one', ${path}) = 0`,
        ),
      );
    return result.affectedRows === 1;
  },
  async markLive(callId) {
    await db
      .update(voiceCalls)
      .set({
        status: "live",
        connectedAt: new Date(),
        lastCheckpointAt: new Date(),
      })
      .where(eq(voiceCalls.id, callId));
  },

  async checkpoint(callId, progress) {
    await db
      .update(voiceCalls)
      .set({
        status: progress.status,
        billedSeconds: progress.billedSeconds,
        turns: progress.turns,
        toolCalls: progress.toolCalls,
        incidents: progress.incidents,
        reconnects: progress.reconnects,
        tokens: progress.tokens,
        metrics: sql`JSON_MERGE_PATCH(COALESCE(${voiceCalls.metrics}, JSON_OBJECT()), CAST(${JSON.stringify(progress.metrics)} AS JSON))`,
        costUsd: usd(progress.costUsd),
        lastCheckpointAt: new Date(),
      })
      .where(eq(voiceCalls.id, callId));
  },

  async finalize(callId, final) {
    await db
      .update(voiceCalls)
      .set({
        status: final.failed ? "failed" : "ended",
        endedAt: new Date(),
        endReason: final.endReason,
        billedSeconds: final.billedSeconds,
        turns: final.turns,
        toolCalls: final.toolCalls,
        incidents: final.incidents,
        reconnects: final.reconnects,
        tokens: final.tokens,
        metrics: sql`JSON_MERGE_PATCH(COALESCE(${voiceCalls.metrics}, JSON_OBJECT()), CAST(${JSON.stringify(final.metrics)} AS JSON))`,
        costUsd: usd(final.costUsd),
        memoryStatus: sql`CASE WHEN ${voiceCalls.memoryStatus} = 'suppressed' THEN 'suppressed' ELSE ${final.memoryStatus} END`,
        lastCheckpointAt: new Date(),
      })
      .where(eq(voiceCalls.id, callId));
    // The live session's own cost goes to the AI cost ledger; the tools' text models write their own rows.
    const [call] = await db
      .select({
        userId: voiceCalls.userId,
        userType: voiceCalls.userType,
        model: voiceCalls.model,
        memoryStatus: voiceCalls.memoryStatus,
      })
      .from(voiceCalls)
      .where(eq(voiceCalls.id, callId))
      .limit(1);
    if (call) {
      const sum = (side: Record<string, number>) =>
        Object.values(side).reduce((total, tokens) => total + tokens, 0);
      const segments = final.metrics.modelSegments as
        | Array<{ model: string; usage: UsageTotals; billedSeconds: number }>
        | undefined;
      for (const segment of segments?.length
        ? segments
        : [
            {
              model: call.model,
              usage: final.tokens,
              billedSeconds: final.billedSeconds,
            },
          ]) {
        if (
          !sum(segment.usage.input) &&
          !sum(segment.usage.output) &&
          !segment.usage.thoughts
        )
          continue;
        await recordAiLedger({
          userId: call.userId,
          userType: call.userType,
          channel: "voice_call",
          providerSlug: "gemini",
          modelId: segment.model,
          promptTokens: sum(segment.usage.input),
          completionTokens: sum(segment.usage.output),
          reasoningTokens: segment.usage.thoughts,
          costUsd: usageCostUsd(segment.usage),
          traceId: callId,
          metadata: { billedSeconds: segment.billedSeconds },
        });
      }
    }
    return {
      keepTranscript: Boolean(call) && call.memoryStatus !== "suppressed",
    };
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
      log.warn(
        {
          event: "voice.incident_write_failed",
          callId: call.callId,
          kind,
          err: error,
        },
        "Incident not recorded",
      );
    }
  },
};

/**
 * Calls a server stopped holding (a crash or a deploy) stay "live" forever unless someone closes them. Their billed
 * seconds are already checkpointed; this only marks them ended so the history and the admin views are right.
 */
export async function closeAbandonedCalls(
  user: { userId: number; userType: string },
  olderThanMs = 3 * 60_000,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs);
  const stale = await db
    .select({ id: voiceCalls.id })
    .from(voiceCalls)
    .where(
      and(
        eq(voiceCalls.userId, user.userId),
        eq(voiceCalls.userType, user.userType),
        inArray(voiceCalls.status, ["starting", "live", "reconnecting"]),
        or(
          lt(voiceCalls.lastCheckpointAt, cutoff),
          and(
            isNull(voiceCalls.lastCheckpointAt),
            lt(voiceCalls.startedAt, cutoff),
          ),
        ),
      ),
    );
  if (stale.length === 0) return 0;
  await db
    .update(voiceCalls)
    .set({ status: "ended", endReason: "server", endedAt: new Date() })
    .where(
      inArray(
        voiceCalls.id,
        stale.map((row) => row.id),
      ),
    );
  return stale.length;
}
