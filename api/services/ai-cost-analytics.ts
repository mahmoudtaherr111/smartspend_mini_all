import { and, desc, eq, gte, like, lte } from "drizzle-orm";
import { userAnalytics } from "../../db/schema";
import { db } from "../queries/connection";

export interface AICostAnalyticsInput {
  userId?: number;
  userType?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface AICostAnalyticsEvent {
  id?: number;
  userId: number;
  userType: string;
  channel: string;
  route: string;
  intentKind: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  embeddingCalls: number;
  llmCalls: number;
  toolCalls: number;
  latencyMs: number;
  costUnits: number;
  cacheHit: boolean | null;
  fallback: boolean;
  createdAt?: Date | null;
  model: string;
}

export interface AICostAggregate {
  count: number;
  totalTokens: number;
  totalCostUnits: number;
  llmCalls: number;
  embeddingCalls: number;
  toolCalls: number;
  avgTokens: number;
  avgLatencyMs: number;
  cacheHitRate: number | null;
  fallbackRate: number;
}

export interface AICostOverview {
  totals: AICostAggregate;
  byChannel: Record<string, AICostAggregate>;
  byRoute: Record<string, AICostAggregate>;
  byUser: Record<string, AICostAggregate>;
  recent: AICostAnalyticsEvent[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function hasFallbackSignal(value: unknown): boolean {
  if (typeof value === "string") return value.toLowerCase().includes("fallback");
  if (Array.isArray(value)) return value.some(hasFallbackSignal);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(([key, item]) => {
      if (key.toLowerCase().includes("fallback")) return Boolean(item);
      return hasFallbackSignal(item);
    });
  }
  return false;
}

function cacheHitFromMetadata(metadata: Record<string, unknown>): boolean | null {
  if (typeof metadata.cacheHit === "boolean") return metadata.cacheHit;
  const cacheHits = metadata.cacheHits;
  if (Array.isArray(cacheHits)) return cacheHits.length > 0;
  const trace = asRecord(metadata.trace);
  const traceCacheHits = trace.cacheHits;
  if (Array.isArray(traceCacheHits)) return traceCacheHits.length > 0;
  return null;
}

export function normalizeAICostAnalyticsEvent(row: {
  id?: number;
  userId: number;
  userType: string;
  event: string;
  metadata?: unknown;
  createdAt?: Date | null;
}): AICostAnalyticsEvent {
  const metadata = asRecord(row.metadata);
  const trace = asRecord(metadata.trace);
  const routing = asRecord(metadata.routing);
  const route =
    stringValue(metadata.route, "") ||
    stringValue(trace.route, "") ||
    stringValue(routing.route, "") ||
    stringValue(metadata.intentKind, "unknown");

  return {
    id: row.id,
    userId: row.userId,
    userType: row.userType,
    channel: row.event.replace(/^ai_cost_/, ""),
    route,
    intentKind: stringValue(metadata.intentKind, "unknown"),
    totalTokens: asNumber(metadata.totalTokens),
    inputTokens: asNumber(metadata.inputTokens),
    outputTokens: asNumber(metadata.outputTokens),
    embeddingCalls: asNumber(metadata.embeddingCalls),
    llmCalls: asNumber(metadata.llmCalls),
    toolCalls: asNumber(metadata.toolCalls),
    latencyMs: asNumber(metadata.latencyMs),
    costUnits: asNumber(metadata.costUnits),
    cacheHit: cacheHitFromMetadata(metadata),
    fallback: hasFallbackSignal(metadata),
    createdAt: row.createdAt,
    model: stringValue(metadata.model, "—"),
  };
}

function aggregate(events: AICostAnalyticsEvent[]): AICostAggregate {
  const count = events.length;
  const totalTokens = events.reduce((sum, event) => sum + event.totalTokens, 0);
  const totalCostUnits = events.reduce((sum, event) => sum + event.costUnits, 0);
  const totalLatency = events.reduce((sum, event) => sum + event.latencyMs, 0);
  const cacheKnown = events.filter((event) => event.cacheHit !== null);
  const cacheHits = cacheKnown.filter((event) => event.cacheHit).length;
  const fallbackCount = events.filter((event) => event.fallback).length;

  return {
    count,
    totalTokens,
    totalCostUnits,
    llmCalls: events.reduce((sum, event) => sum + event.llmCalls, 0),
    embeddingCalls: events.reduce((sum, event) => sum + event.embeddingCalls, 0),
    toolCalls: events.reduce((sum, event) => sum + event.toolCalls, 0),
    avgTokens: count ? Math.round(totalTokens / count) : 0,
    avgLatencyMs: count ? Math.round(totalLatency / count) : 0,
    cacheHitRate: cacheKnown.length ? Math.round((cacheHits / cacheKnown.length) * 100) / 100 : null,
    fallbackRate: count ? Math.round((fallbackCount / count) * 100) / 100 : 0,
  };
}

function groupBy(events: AICostAnalyticsEvent[], key: (event: AICostAnalyticsEvent) => string) {
  const grouped: Record<string, AICostAnalyticsEvent[]> = {};
  for (const event of events) {
    const groupKey = key(event) || "unknown";
    grouped[groupKey] = grouped[groupKey] || [];
    grouped[groupKey].push(event);
  }
  return Object.fromEntries(
    Object.entries(grouped).map(([groupKey, groupEvents]) => [groupKey, aggregate(groupEvents)]),
  );
}

export function buildAICostOverview(events: AICostAnalyticsEvent[]): AICostOverview {
  return {
    totals: aggregate(events),
    byChannel: groupBy(events, (event) => event.channel),
    byRoute: groupBy(events, (event) => event.route),
    byUser: groupBy(events, (event) => `${event.userType}:${event.userId}`),
    recent: events.slice(0, 50),
  };
}

export async function loadAICostOverview(input: AICostAnalyticsInput = {}): Promise<AICostOverview> {
  const conditions = [like(userAnalytics.event, "ai_cost_%")];
  if (input.userId !== undefined) conditions.push(eq(userAnalytics.userId, input.userId));
  if (input.userType) conditions.push(eq(userAnalytics.userType, input.userType));
  if (input.from) conditions.push(gte(userAnalytics.createdAt, input.from));
  if (input.to) conditions.push(lte(userAnalytics.createdAt, input.to));

  const rows = await db
    .select()
    .from(userAnalytics)
    .where(and(...conditions))
    .orderBy(desc(userAnalytics.createdAt))
    .limit(Math.min(Math.max(input.limit ?? 1000, 1), 10000));

  return buildAICostOverview(rows.map(normalizeAICostAnalyticsEvent));
}
