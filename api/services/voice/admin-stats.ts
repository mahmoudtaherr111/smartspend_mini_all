/**
 * The admin's view of the rebuilt call over the last days: how many calls and callers, minutes, what they cost us at
 * Google, how fast the assistant starts answering, why calls ended, what went wrong, and whether their memory was
 * written. Built from `voice_calls` and `voice_call_incidents` only: counts, times and costs, never what was said.
 */
import { desc, gte } from "drizzle-orm";
import { voiceCallIncidents, voiceCalls } from "../../../db/schema";
import { db } from "../../queries/connection";

export interface VoiceCallStatRow {
  id: string;
  userId: number;
  userType: string;
  model: string;
  client: string | null;
  status: string;
  startedAt: Date;
  billedSeconds: number;
  endReason: string | null;
  toolCalls: number;
  incidents: number;
  reconnects: number;
  costUsd: string | number;
  memoryStatus: string;
  metrics: unknown;
}

export interface VoiceStats {
  days: number;
  calls: number;
  callers: number;
  minutes: number;
  averageCallSeconds: number;
  costUsd: number;
  /** What the tools' text models cost, inside costUsd. */
  toolCostUsd: number;
  costPerMinuteUsd: number | null;
  /** First audio after the user stops speaking: the median of the calls' medians, and the 95th percentile of their p95. */
  firstAudioMs: { p50: number | null; p95: number | null };
  reconnectsPerCall: number;
  toolCallsPerCall: number;
  endReasons: Array<{ key: string; count: number }>;
  clients: Array<{ key: string; count: number }>;
  models: Array<{ key: string; count: number; minutes: number; costUsd: number }>;
  memory: Array<{ key: string; count: number }>;
  incidents: Array<{ key: string; count: number }>;
  recent: Array<{
    id: string;
    user: string;
    startedAt: string;
    seconds: number;
    model: string;
    client: string | null;
    endReason: string | null;
    costUsd: number;
    firstAudioP50: number | null;
    incidents: number;
    memory: string;
  }>;
}

const MAX_ROWS = 20_000;

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

function counts(keys: Array<string | null | undefined>): Array<{ key: string; count: number }> {
  const map = new Map<string, number>();
  for (const key of keys) map.set(key || "unknown", (map.get(key || "unknown") ?? 0) + 1);
  return [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

function firstAudio(metrics: unknown): { p50: number | null; p95: number | null } {
  const value = (metrics as { firstAudioMs?: { p50?: unknown; p95?: unknown } } | null)?.firstAudioMs;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return { p50: num(value?.p50), p95: num(value?.p95) };
}

function toolCost(metrics: unknown): number {
  const value = (metrics as { toolCostUsd?: unknown } | null)?.toolCostUsd;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

const round = (value: number, places: number) => Number(value.toFixed(places));

export function summarizeVoiceCalls(days: number, rows: VoiceCallStatRow[], incidentKinds: string[]): VoiceStats {
  const seconds = rows.reduce((sum, row) => sum + row.billedSeconds, 0);
  const cost = rows.reduce((sum, row) => sum + Number(row.costUsd || 0), 0);
  const audio = rows.map((row) => firstAudio(row.metrics));
  const models = new Map<string, { count: number; seconds: number; cost: number }>();
  for (const row of rows) {
    const entry = models.get(row.model) ?? { count: 0, seconds: 0, cost: 0 };
    entry.count += 1;
    entry.seconds += row.billedSeconds;
    entry.cost += Number(row.costUsd || 0);
    models.set(row.model, entry);
  }
  const minutes = seconds / 60;
  return {
    days,
    calls: rows.length,
    callers: new Set(rows.map((row) => `${row.userType}:${row.userId}`)).size,
    minutes: round(minutes, 1),
    averageCallSeconds: rows.length ? Math.round(seconds / rows.length) : 0,
    costUsd: round(cost, 4),
    toolCostUsd: round(rows.reduce((sum, row) => sum + toolCost(row.metrics), 0), 4),
    costPerMinuteUsd: minutes > 0 ? round(cost / minutes, 4) : null,
    firstAudioMs: {
      p50: percentile(audio.map((a) => a.p50).filter((v): v is number => v !== null), 0.5),
      p95: percentile(audio.map((a) => a.p95).filter((v): v is number => v !== null), 0.95),
    },
    reconnectsPerCall: rows.length ? round(rows.reduce((sum, row) => sum + row.reconnects, 0) / rows.length, 2) : 0,
    toolCallsPerCall: rows.length ? round(rows.reduce((sum, row) => sum + row.toolCalls, 0) / rows.length, 2) : 0,
    endReasons: counts(rows.filter((row) => row.status === "ended" || row.status === "failed").map((row) => row.endReason)),
    clients: counts(rows.map((row) => row.client)),
    models: [...models.entries()]
      .map(([key, entry]) => ({ key, count: entry.count, minutes: round(entry.seconds / 60, 1), costUsd: round(entry.cost, 4) }))
      .sort((a, b) => b.count - a.count),
    memory: counts(rows.map((row) => row.memoryStatus)),
    incidents: counts(incidentKinds),
    recent: rows.slice(0, 25).map((row) => ({
      id: row.id,
      user: `${row.userType}:${row.userId}`,
      startedAt: row.startedAt.toISOString(),
      seconds: row.billedSeconds,
      model: row.model,
      client: row.client,
      endReason: row.endReason,
      costUsd: round(Number(row.costUsd || 0), 4),
      firstAudioP50: firstAudio(row.metrics).p50,
      incidents: row.incidents,
      memory: row.memoryStatus,
    })),
  };
}

export async function loadVoiceStats(days: number, now = new Date()): Promise<VoiceStats> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const [rows, incidents] = await Promise.all([
    db
      .select({
        id: voiceCalls.id,
        userId: voiceCalls.userId,
        userType: voiceCalls.userType,
        model: voiceCalls.model,
        client: voiceCalls.client,
        status: voiceCalls.status,
        startedAt: voiceCalls.startedAt,
        billedSeconds: voiceCalls.billedSeconds,
        endReason: voiceCalls.endReason,
        toolCalls: voiceCalls.toolCalls,
        incidents: voiceCalls.incidents,
        reconnects: voiceCalls.reconnects,
        costUsd: voiceCalls.costUsd,
        memoryStatus: voiceCalls.memoryStatus,
        metrics: voiceCalls.metrics,
      })
      .from(voiceCalls)
      .where(gte(voiceCalls.startedAt, since))
      .orderBy(desc(voiceCalls.startedAt))
      .limit(MAX_ROWS),
    db
      .select({ kind: voiceCallIncidents.kind })
      .from(voiceCallIncidents)
      .where(gte(voiceCallIncidents.createdAt, since))
      .limit(MAX_ROWS),
  ]);
  return summarizeVoiceCalls(days, rows, incidents.map((row) => row.kind));
}
