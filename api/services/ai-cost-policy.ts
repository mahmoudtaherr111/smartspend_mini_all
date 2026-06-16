import type {
  AIChannel,
  AIIntentKind,
  ResolvedFact,
  TokenBudget,
} from "./ai-kernel/types";

export type AICostPlan = "free" | "pro" | "ultra";
export type AICostChannel = AIChannel | "embedding" | "action" | "parse" | "speech";

export interface AICostPolicyInput {
  channel: AICostChannel;
  plan?: string | null;
  intentKind?: AIIntentKind | string | null;
  role?: string | null;
  settings?: Record<string, unknown>;
}

export interface AICostPolicy extends TokenBudget {
  channel: AICostChannel;
  plan: AICostPlan;
  intentKind: string;
  estimatedMaxCostUnits: number;
}

export interface AICostMetricInput {
  userId: number;
  userType: string;
  channel: AICostChannel;
  plan?: string | null;
  intentKind?: string | null;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  embeddingCalls?: number;
  llmCalls?: number;
  toolCalls?: number;
  latencyMs?: number;
  costUnits?: number;
  metadata?: Record<string, unknown>;
}

export interface AICostMetricSnapshot {
  channel: AICostChannel | string;
  totalTokens?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  latencyMs?: number | null;
  costUnits?: number | null;
}

export interface AIRolloutInput {
  userId: number | string;
  role?: string | null;
  plan?: string | null;
  settings?: Record<string, unknown>;
  flagPrefix?: string;
}

export interface AIRolloutDecision {
  enabled: boolean;
  reason: string;
  bucket: number;
}

export interface NumberFactAccuracy {
  numbers: string[];
  supported: string[];
  missing: string[];
  accuracy: number;
}

export interface RetrievalEvalCandidate {
  id?: string | number;
  source?: string;
  score?: number;
  confidence?: number;
  document?: {
    metadata?: Record<string, unknown>;
  };
}

export interface RetrievalQualityInput {
  query: string;
  results?: RetrievalEvalCandidate[];
  facts?: ResolvedFact[];
  expectedSources?: string[];
}

export interface RetrievalQualityResult {
  query: string;
  resultCount: number;
  avgConfidence: number;
  expectedSourceHit: boolean;
  score: number;
}

export interface FallbackSearchDocument {
  id: string;
  text: string;
  metadata?: Record<string, unknown>;
}

export interface FallbackSearchResult {
  id: string;
  score: number;
  document: FallbackSearchDocument;
}

export const AI_GOLDEN_EVAL_DATASET: Array<{
  id: string;
  question: string;
  expectedIntent: AIIntentKind;
  expectedNeeds: string[];
  channel: "chat" | "voice";
  numericAnswerRequiresFacts: boolean;
}> = [
  {
    id: "today_spending_total",
    question: "صرفت كام النهارده؟",
    expectedIntent: "finance_query",
    expectedNeeds: ["finance.summary"],
    channel: "chat",
    numericAnswerRequiresFacts: true,
  },
  {
    id: "month_food_total",
    question: "صرفي على الأكل الشهر ده كام بالظبط؟",
    expectedIntent: "finance_query",
    expectedNeeds: ["finance.category_total"],
    channel: "chat",
    numericAnswerRequiresFacts: true,
  },
  {
    id: "six_month_food_chart",
    question: "اعمل رسم بياني لمصاريف الأكل آخر 6 شهور",
    expectedIntent: "chart_request",
    expectedNeeds: ["chart.data"],
    channel: "chat",
    numericAnswerRequiresFacts: true,
  },
  {
    id: "goal_create_car",
    question: "عايز أحوش 100 ألف جنيه عشان أجيب عربية",
    expectedIntent: "goal_planning",
    expectedNeeds: ["profile.snapshot", "finance.breakdown", "goals.active"],
    channel: "chat",
    numericAnswerRequiresFacts: true,
  },
  {
    id: "sms_linking_help",
    question: "إزاي أربط SMS البنك؟",
    expectedIntent: "site_help",
    expectedNeeds: ["site_guide.search"],
    channel: "chat",
    numericAnswerRequiresFacts: false,
  },
  {
    id: "voice_today_total",
    question: "قول لي صرفت كام النهارده بسرعة",
    expectedIntent: "finance_query",
    expectedNeeds: ["finance.summary"],
    channel: "voice",
    numericAnswerRequiresFacts: true,
  },
  {
    id: "memory_previous_plan",
    question: "فاكر الخطة اللي اتكلمنا عنها؟",
    expectedIntent: "memory_question",
    expectedNeeds: ["memory.search"],
    channel: "chat",
    numericAnswerRequiresFacts: false,
  },
];

const BASE_POLICIES: Record<AICostChannel, Record<AICostPlan, TokenBudget>> = {
  chat: {
    free: budget(700, 350, 360, 120, 140, 1),
    pro: budget(1200, 600, 520, 180, 220, 1),
    ultra: budget(1800, 900, 720, 260, 320, 1),
  },
  voice: {
    free: budget(350, 100, 220, 70, 70, 1),
    pro: budget(550, 140, 300, 90, 90, 1),
    ultra: budget(700, 180, 360, 110, 110, 1),
  },
  report: {
    free: budget(1600, 900, 900, 160, 140, 2),
    pro: budget(2600, 1600, 1300, 220, 180, 2),
    ultra: budget(3600, 2400, 1800, 280, 220, 2),
  },
  system: {
    free: budget(650, 240, 320, 100, 100, 1),
    pro: budget(900, 320, 420, 140, 140, 1),
    ultra: budget(1200, 420, 520, 180, 180, 1),
  },
  embedding: {
    free: budget(220, 0, 0, 0, 0, 0),
    pro: budget(320, 0, 0, 0, 0, 0),
    ultra: budget(420, 0, 0, 0, 0, 0),
  },
  action: {
    free: budget(500, 160, 180, 80, 60, 1),
    pro: budget(700, 220, 240, 100, 80, 1),
    ultra: budget(900, 300, 320, 120, 100, 1),
  },
  parse: {
    free: budget(650, 260, 0, 0, 0, 0),
    pro: budget(1200, 420, 0, 0, 0, 0),
    ultra: budget(1500, 560, 0, 0, 0, 0),
  },
  speech: {
    free: budget(420, 0, 0, 0, 0, 0),
    pro: budget(700, 0, 0, 0, 0, 0),
    ultra: budget(900, 0, 0, 0, 0, 0),
  },
};

const HARD_CAPS: Record<AICostChannel, Pick<TokenBudget, "maxInputTokens" | "maxOutputTokens" | "maxFactTokens" | "maxMemoryTokens" | "maxHistoryTokens" | "maxToolRounds">> = {
  chat: budget(2500, 1200, 1000, 360, 420, 2),
  voice: budget(900, 220, 500, 160, 160, 1),
  report: budget(4200, 2600, 2200, 420, 420, 2),
  system: budget(1500, 600, 700, 220, 220, 1),
  embedding: budget(600, 0, 0, 0, 0, 0),
  action: budget(1000, 380, 420, 180, 160, 1),
  parse: budget(1800, 700, 0, 0, 0, 0),
  speech: budget(1200, 0, 0, 0, 0, 0),
};

const COMPLEX_TOOL_INTENTS = new Set<string>([
  "finance_analysis",
  "goal_planning",
  "report_request",
  "chart_request",
]);

function budget(
  maxInputTokens: number,
  maxOutputTokens: number,
  maxFactTokens: number,
  maxMemoryTokens: number,
  maxHistoryTokens: number,
  maxToolRounds: number,
): TokenBudget {
  return {
    maxInputTokens,
    maxOutputTokens,
    maxFactTokens,
    maxMemoryTokens,
    maxHistoryTokens,
    maxToolRounds,
  };
}

function asCostPlan(plan: string | null | undefined): AICostPlan {
  return plan === "pro" || plan === "ultra" ? plan : "free";
}

function readSetting(settings: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = settings?.[key];
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function readBool(settings: Record<string, unknown> | undefined, key: string, fallback: boolean): boolean {
  const value = readSetting(settings, key);
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function readOptionalInt(settings: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = readSetting(settings, key);
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function readNumber(settings: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const value = readSetting(settings, key);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readCsv(settings: Record<string, unknown> | undefined, key: string): string[] {
  const value = readSetting(settings, key);
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function overrideBudgetValue(
  settings: Record<string, unknown> | undefined,
  channel: AICostChannel,
  plan: AICostPlan,
  suffix: string,
  fallback: number,
  max: number,
): number {
  const planKey = `ai_cost_${channel}_${suffix}_${plan}`;
  const globalKey = `ai_cost_${channel}_${suffix}`;
  const value = readOptionalInt(settings, planKey) ?? readOptionalInt(settings, globalKey) ?? fallback;
  return clamp(value, 0, max);
}

export function estimateAICostUnits(input: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  embeddingCalls?: number;
  llmCalls?: number;
  toolCalls?: number;
}): number {
  const inputTokens = Math.max(0, Math.round(input.inputTokens ?? 0));
  const outputTokens = Math.max(0, Math.round(input.outputTokens ?? 0));
  const totalTokens = Math.max(0, Math.round(input.totalTokens ?? inputTokens + outputTokens));
  const embeddingCalls = Math.max(0, Math.round(input.embeddingCalls ?? 0));
  const llmCalls = Math.max(0, Math.round(input.llmCalls ?? 0));
  const toolCalls = Math.max(0, Math.round(input.toolCalls ?? 0));
  return totalTokens + outputTokens * 2 + embeddingCalls * 25 + llmCalls * 100 + toolCalls * 10;
}

export function resolveAICostPolicy(input: AICostPolicyInput): AICostPolicy {
  const plan = asCostPlan(input.plan);
  const channel = input.channel;
  const intentKind = input.intentKind || "unknown";
  const base = BASE_POLICIES[channel][plan];
  const caps = HARD_CAPS[channel];
  const complexIntent = COMPLEX_TOOL_INTENTS.has(String(intentKind));

  let maxToolRounds = complexIntent && channel !== "voice"
    ? Math.max(base.maxToolRounds, 2)
    : Math.min(base.maxToolRounds, 1);

  maxToolRounds = overrideBudgetValue(
    input.settings,
    channel,
    plan,
    "max_tool_rounds",
    maxToolRounds,
    caps.maxToolRounds,
  );

  if (!complexIntent && channel !== "report") {
    maxToolRounds = Math.min(maxToolRounds, 1);
  }
  if (channel === "voice" || channel === "embedding" || channel === "speech" || channel === "parse") {
    maxToolRounds = Math.min(maxToolRounds, caps.maxToolRounds);
  }

  const policy: AICostPolicy = {
    channel,
    plan,
    intentKind: String(intentKind),
    maxInputTokens: overrideBudgetValue(input.settings, channel, plan, "max_input", base.maxInputTokens, caps.maxInputTokens),
    maxOutputTokens: overrideBudgetValue(input.settings, channel, plan, "max_output", base.maxOutputTokens, caps.maxOutputTokens),
    maxFactTokens: overrideBudgetValue(input.settings, channel, plan, "max_fact", base.maxFactTokens, caps.maxFactTokens),
    maxMemoryTokens: overrideBudgetValue(input.settings, channel, plan, "max_memory", base.maxMemoryTokens, caps.maxMemoryTokens),
    maxHistoryTokens: overrideBudgetValue(input.settings, channel, plan, "max_history", base.maxHistoryTokens, caps.maxHistoryTokens),
    maxToolRounds,
    estimatedMaxCostUnits: 0,
  };

  policy.estimatedMaxCostUnits = estimateAICostUnits({
    inputTokens: policy.maxInputTokens,
    outputTokens: policy.maxOutputTokens,
    embeddingCalls: channel === "embedding" ? 1 : 0,
    llmCalls: channel === "embedding" || channel === "speech" ? 0 : 1,
    toolCalls: policy.maxToolRounds,
  });

  return policy;
}

export async function recordAICostMetric(input: AICostMetricInput): Promise<void> {
  const inputTokens = Math.max(0, Math.round(input.inputTokens ?? 0));
  const outputTokens = Math.max(0, Math.round(input.outputTokens ?? 0));
  const totalTokens = Math.max(0, Math.round(input.totalTokens ?? inputTokens + outputTokens));
  const costUnits = Math.max(
    0,
    Math.round(
      input.costUnits ??
        estimateAICostUnits({
          inputTokens,
          outputTokens,
          totalTokens,
          embeddingCalls: input.embeddingCalls,
          llmCalls: input.llmCalls,
          toolCalls: input.toolCalls,
        }),
    ),
  );

  const metadata = {
    plan: asCostPlan(input.plan),
    intentKind: input.intentKind ?? null,
    model: input.model ?? null,
    inputTokens,
    outputTokens,
    totalTokens,
    embeddingCalls: input.embeddingCalls ?? 0,
    llmCalls: input.llmCalls ?? 0,
    toolCalls: input.toolCalls ?? 0,
    latencyMs: input.latencyMs ?? null,
    costUnits,
    ...(input.metadata || {}),
  };

  try {
    console.info("[AI Cost]", JSON.stringify({
      userId: input.userId,
      userType: input.userType,
      channel: input.channel,
      ...metadata,
    }));
  } catch {
    // Ignore logging serialization failures.
  }

  try {
    const [{ db }, schema] = await Promise.all([
      import("../queries/connection"),
      import("../../db/schema"),
    ]);
    await db.insert(schema.userAnalytics).values({
      userId: input.userId,
      userType: input.userType,
      event: `ai_cost_${input.channel}`,
      metadata,
    });
  } catch {
    // Cost telemetry should never break the user request.
  }
}

export function summarizeAICostMetrics(events: AICostMetricSnapshot[]): {
  count: number;
  totalCostUnits: number;
  avgCostUnits: number;
  avgTokens: number;
  avgLatencyMs: number;
  byChannel: Record<string, { count: number; avgCostUnits: number; avgTokens: number; avgLatencyMs: number }>;
} {
  const count = events.length;
  const totalCostUnits = events.reduce((sum, event) => sum + Number(event.costUnits || 0), 0);
  const totalTokens = events.reduce((sum, event) => sum + Number(event.totalTokens ?? (Number(event.inputTokens || 0) + Number(event.outputTokens || 0))), 0);
  const totalLatency = events.reduce((sum, event) => sum + Number(event.latencyMs || 0), 0);
  const grouped: Record<string, AICostMetricSnapshot[]> = {};

  for (const event of events) {
    const key = String(event.channel);
    grouped[key] = grouped[key] || [];
    grouped[key].push(event);
  }

  const byChannel: Record<string, { count: number; avgCostUnits: number; avgTokens: number; avgLatencyMs: number }> = {};
  for (const [channel, rows] of Object.entries(grouped)) {
    const rowCount = rows.length;
    const rowCost = rows.reduce((sum, row) => sum + Number(row.costUnits || 0), 0);
    const rowTokens = rows.reduce((sum, row) => sum + Number(row.totalTokens ?? (Number(row.inputTokens || 0) + Number(row.outputTokens || 0))), 0);
    const rowLatency = rows.reduce((sum, row) => sum + Number(row.latencyMs || 0), 0);
    byChannel[channel] = {
      count: rowCount,
      avgCostUnits: rowCount ? Math.round(rowCost / rowCount) : 0,
      avgTokens: rowCount ? Math.round(rowTokens / rowCount) : 0,
      avgLatencyMs: rowCount ? Math.round(rowLatency / rowCount) : 0,
    };
  }

  return {
    count,
    totalCostUnits,
    avgCostUnits: count ? Math.round(totalCostUnits / count) : 0,
    avgTokens: count ? Math.round(totalTokens / count) : 0,
    avgLatencyMs: count ? Math.round(totalLatency / count) : 0,
    byChannel,
  };
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function resolveAIRollout(input: AIRolloutInput): AIRolloutDecision {
  const prefix = input.flagPrefix || "ai_kernel";
  const plan = asCostPlan(input.plan);
  const role = String(input.role || "user");
  const userId = String(input.userId);
  const bucket = stableHash(`${prefix}:${userId}`) % 100;

  if (!readBool(input.settings, `${prefix}_rollout_enabled`, true)) {
    return { enabled: false, reason: "rollout_disabled", bucket };
  }

  const userAllowList = readCsv(input.settings, `${prefix}_rollout_user_ids`);
  if (userAllowList.includes(userId)) {
    return { enabled: true, reason: "user_allowlist", bucket };
  }

  const adminOnly = readBool(input.settings, `${prefix}_rollout_admin_only`, false);
  if (adminOnly && role !== "admin") {
    return { enabled: false, reason: "admin_only", bucket };
  }

  if (role === "admin" && readBool(input.settings, `${prefix}_rollout_admin_bypass`, true)) {
    return { enabled: true, reason: "admin", bucket };
  }

  const allowedPlans = readCsv(input.settings, `${prefix}_rollout_plans`);
  if (allowedPlans.length > 0 && !allowedPlans.includes(plan)) {
    return { enabled: false, reason: "plan_not_in_rollout", bucket };
  }

  const percentage = clamp(readNumber(input.settings, `${prefix}_rollout_percentage`, 100), 0, 100);
  if (percentage <= 0) {
    return { enabled: false, reason: "percentage_zero", bucket };
  }
  if (bucket >= percentage) {
    return { enabled: false, reason: "percentage_bucket", bucket };
  }

  return { enabled: true, reason: "enabled", bucket };
}

const NUMERAL_MAP: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
};

function normalizeNumericText(value: string): string {
  return value
    .replace(/[٠-٩۰-۹]/g, (digit) => NUMERAL_MAP[digit] || digit)
    .replace(/\u066b/g, ".")
    .replace(/\u066c/g, ",");
}

function extractNumbers(value: string): string[] {
  const normalized = normalizeNumericText(value);
  return normalized.match(/-?\d+(?:[,.]\d+)*/g)?.map(canonicalNumber).filter(Boolean) ?? [];
}

function canonicalNumber(value: string): string {
  const withoutThousands = value.replace(/,/g, "");
  const parsed = Number(withoutThousands);
  if (!Number.isFinite(parsed)) return withoutThousands;
  return Object.is(parsed, -0) ? "0" : parsed.toString();
}

function collectNumbersFromFacts(value: unknown, target: Set<string>, depth = 0): void {
  if (depth > 4 || value === null || value === undefined) return;
  if (typeof value === "number") {
    target.add(canonicalNumber(String(value)));
    return;
  }
  if (typeof value === "string") {
    for (const number of extractNumbers(value)) target.add(number);
    return;
  }
  if (typeof value === "boolean") return;
  if (Array.isArray(value)) {
    for (const item of value) collectNumbersFromFacts(item, target, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectNumbersFromFacts(item, target, depth + 1);
    }
  }
}

export function validateNumbersAgainstFacts(responseText: string, facts: ResolvedFact[] | Record<string, unknown> | string): NumberFactAccuracy {
  const numbers = [...new Set(extractNumbers(responseText))];
  const factNumbers = new Set<string>();
  collectNumbersFromFacts(facts, factNumbers);

  const supported = numbers.filter((number) => factNumbers.has(number));
  const missing = numbers.filter((number) => !factNumbers.has(number));

  return {
    numbers,
    supported,
    missing,
    accuracy: numbers.length === 0 ? 1 : supported.length / numbers.length,
  };
}

function candidateSource(candidate: RetrievalEvalCandidate): string | undefined {
  const metadataSource = candidate.document?.metadata?.source;
  return candidate.source || (typeof metadataSource === "string" ? metadataSource : undefined);
}

export function evaluateRetrievalQuality(input: RetrievalQualityInput): RetrievalQualityResult {
  const candidates: RetrievalEvalCandidate[] =
    input.results ??
    (input.facts || []).map((fact) => ({
      id: fact.id,
      source: fact.source,
      confidence: fact.confidence,
      score: fact.confidence,
    }));

  const resultCount = candidates.length;
  const totalConfidence = candidates.reduce((sum, item) => {
    const score = Number(item.confidence ?? item.score ?? 0);
    return sum + clamp(score, 0, 1);
  }, 0);
  const avgConfidence = resultCount ? totalConfidence / resultCount : 0;
  const expectedSourceHit =
    !input.expectedSources?.length ||
    candidates.some((item) => {
      const source = candidateSource(item);
      return Boolean(source && input.expectedSources?.includes(source));
    });

  return {
    query: input.query,
    resultCount,
    avgConfidence,
    expectedSourceHit,
    score: clamp(avgConfidence * 0.7 + (expectedSourceHit ? 0.3 : 0), 0, 1),
  };
}

function normalizeSearchText(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2);
}

export function fallbackVectorSearch(input: {
  query: string;
  documents: FallbackSearchDocument[];
  limit?: number;
}): FallbackSearchResult[] {
  const queryTokens = new Set(normalizeSearchText(input.query));
  if (queryTokens.size === 0) return [];
  const limit = Math.max(1, Math.min(input.limit ?? 5, 20));

  return input.documents
    .map((document) => {
      const documentTokens = new Set(normalizeSearchText(document.text));
      let hits = 0;
      for (const token of queryTokens) {
        if (documentTokens.has(token)) hits += 1;
      }
      return {
        id: document.id,
        document,
        score: hits / Math.max(1, queryTokens.size),
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function buildDeterministicFallbackEmbedding(text: string, dimensions: number): number[] {
  const safeDimensions = Math.max(1, Math.min(Math.round(dimensions), 4096));
  const vector = Array.from({ length: safeDimensions }, () => 0);
  const tokens = normalizeSearchText(text);
  const sourceTokens = tokens.length > 0 ? tokens : [text || "empty"];

  for (const token of sourceTokens) {
    const hash = stableHash(token);
    const index = hash % safeDimensions;
    const sign = hash % 2 === 0 ? 1 : -1;
    const weight = 1 + (hash % 997) / 997;
    vector[index] += sign * weight;
  }

  const norm = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1;
  return vector.map((item) => Number((item / norm).toFixed(6)));
}
