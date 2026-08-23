import "dotenv/config";

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { systemSettings } from "../../db/schema";
import { db } from "../queries/connection";
import { compileDataNeeds, routeIntent, runAIKernelActive, type AIResponse } from "../services/ai-kernel";
import { retrieveMemoryContext } from "../services/ai-memory";
import { executeVoiceTool } from "../services/voice-kernel/voice-tool-adapter";
import { clearVoiceSessionState, createVoiceSessionState } from "../services/voice-kernel/voice-session-state";
import type { VoiceToolResponse } from "../services/voice-kernel/types";
import {
  AI_CENTER_QA_MARKER,
  AI_CENTER_QA_PLAN,
  AI_CENTER_QA_USER_TYPE,
  seedAICenterQA,
  type AICenterQASeedResult,
} from "./ai-center-qa-seed";

interface QACaseResult {
  name: string;
  ok: boolean;
  durationMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

interface QARunResult {
  ok: boolean;
  generatedAt: string;
  seed: AICenterQASeedResult;
  cases: QACaseResult[];
}

interface KernelCaseOptions {
  message: string;
  expectedIntent: string;
  requiredNeeds: string[];
  requireNoEmbedding?: boolean;
  requireMemoryEmbedding?: boolean;
  requireChartArtifact?: boolean;
  requireSiteGuide?: boolean;
}

function directRun(): boolean {
  return Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cacheHitsFrom(debug: Record<string, unknown>): string[] {
  return Array.isArray(debug.cacheHits) ? debug.cacheHits.map(String) : [];
}

function embeddingRows(cacheHits: string[]): number {
  const hit = cacheHits.find((item) => item.startsWith("embedding:rows:"));
  return hit ? asNumber(hit.split(":").at(-1)) : 0;
}

import { getSystemSettings } from "../lib/settings-cache";

async function loadKernelConfig(): Promise<{
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
}> {
  const settings = await getSystemSettings();
  return {
    apiKey: settings.chatbot_api_key || settings.fireworks_api_key || process.env.FIREWORKS_API_KEY || "",
    baseUrl: settings.chatbot_base_url || "https://api.fireworks.ai/inference/v1",
    model: settings.chatbot_model || "accounts/fireworks/models/deepseek-v4-flash",
    maxTokens: Number(settings.chatbot_max_tokens_ultra || 500),
  };
}

async function runCase(name: string, execute: () => Promise<Record<string, unknown> | void>): Promise<QACaseResult> {
  const startedAt = Date.now();
  try {
    const details = (await execute()) ?? {};
    return {
      name,
      ok: true,
      durationMs: Date.now() - startedAt,
      details,
    };
  } catch (error) {
    return {
      name,
      ok: false,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarizeKernel(response: AIResponse): Record<string, unknown> {
  const debug = asObject(response.debug);
  const cacheHits = cacheHitsFrom(debug);
  return {
    traceId: response.traceId,
    intent: response.intent.kind,
    needs: response.dataNeeds.map((need) => need.kind),
    factCount: response.facts.length,
    artifactTypes: response.artifacts.map((artifact) => artifact.type),
    tokensUsed: response.tokensUsed,
    llmCalls: debug.llmCalls,
    embeddingCalls: debug.embeddingCalls,
    embeddingApiStatus: debug.embeddingApiStatus,
    retrievalPolicy: debug.retrievalPolicy,
    cacheHits,
    embeddingRows: embeddingRows(cacheHits),
    contentPreview: response.content.slice(0, 180),
  };
}

async function runKernelCase(
  seed: AICenterQASeedResult,
  config: Awaited<ReturnType<typeof loadKernelConfig>>,
  options: KernelCaseOptions,
): Promise<Record<string, unknown>> {
  const response = await runAIKernelActive(
    {
      channel: "chat",
      userId: seed.user.id,
      userType: seed.user.userType,
      userPlan: seed.user.plan,
      message: options.message,
      metadata: {
        qaMarker: AI_CENTER_QA_MARKER,
        salaryDay: 1,
      },
    },
    config,
  );
  const debug = asObject(response.debug);
  const cacheHits = cacheHitsFrom(debug);
  const needs = response.dataNeeds.map((need) => String(need.kind));

  assert(response.intent.kind === options.expectedIntent, `Expected intent ${options.expectedIntent}, got ${response.intent.kind}`);
  for (const need of options.requiredNeeds) {
    assert(needs.includes(need), `Expected data need ${need}, got ${needs.join(", ")}`);
  }
  assert(response.facts.length > 0 || options.requireChartArtifact || options.requireSiteGuide, "Expected resolved facts");

  if (options.requireNoEmbedding) {
    assert(asNumber(debug.embeddingCalls) === 0, `Expected zero embedding calls, got ${String(debug.embeddingCalls)}`);
    assert(debug.embeddingApiStatus === "skipped", `Expected skipped embedding status, got ${String(debug.embeddingApiStatus)}`);
  }

  if (options.requireMemoryEmbedding) {
    const retrievalPolicy = asObject(debug.retrievalPolicy);
    assert(retrievalPolicy.embedding === "fireworks_qwen", `Expected fireworks_qwen retrieval, got ${String(retrievalPolicy.embedding)}`);
    assert(cacheHits.includes("embedding:fireworks"), `Expected embedding:fireworks trace, got ${cacheHits.join(", ")}`);
    assert(embeddingRows(cacheHits) > 0, `Expected vector rows > 0, got ${embeddingRows(cacheHits)}`);
    assert(
      debug.embeddingApiStatus === "fireworks_live_call" || debug.embeddingApiStatus === "query_cache_hit",
      `Expected live/cache Fireworks embedding, got ${String(debug.embeddingApiStatus)}`,
    );
  }

  if (options.requireChartArtifact) {
    const chart = response.artifacts.find((artifact) => artifact.type === "chart");
    assert(chart, "Expected chart artifact");
  }

  if (options.requireSiteGuide) {
    const retrievalPolicy = asObject(debug.retrievalPolicy);
    assert(retrievalPolicy.embedding === "static_local", `Expected static local site guide retrieval, got ${String(retrievalPolicy.embedding)}`);
    assert(
      cacheHits.includes("site_guide:static_local") || cacheHits.includes("site_guide:static_256"),
      `Expected site guide trace, got ${cacheHits.join(", ")}`,
    );
  }

  return summarizeKernel(response);
}

function summarizeVoice(response: VoiceToolResponse): Record<string, unknown> {
  const cacheHits = "cacheHits" in response && response.cacheHits ? response.cacheHits : [];
  return {
    ok: response.ok,
    tool: response.tool,
    factCount: "facts" in response && response.facts ? response.facts.length : 0,
    artifactTypes: "artifacts" in response && response.artifacts ? response.artifacts.map((artifact) => artifact.type) : [],
    dataNeeds: "dataNeeds" in response && response.dataNeeds ? response.dataNeeds.map((need) => need.kind) : [],
    embeddingApiStatus: "embeddingApiStatus" in response ? response.embeddingApiStatus : undefined,
    retrievalPolicy: "retrievalPolicy" in response ? response.retrievalPolicy : undefined,
    cacheHits,
    embeddingRows: embeddingRows(cacheHits),
    actionStatus: "action" in response ? response.action?.status : undefined,
    result: response.result,
    error: response.ok ? undefined : response.error,
  };
}

async function runVoiceCase(
  seed: AICenterQASeedResult,
  toolName: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const sessionId = `qa_voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await createVoiceSessionState({
    sessionId,
    userId: seed.user.id,
    userType: seed.user.userType,
    userPlan: seed.user.plan,
  });

  try {
    const response = await executeVoiceTool({
      toolName,
      args,
      ctx: {
        sessionId,
        userId: seed.user.id,
        userType: seed.user.userType,
        userPlan: seed.user.plan,
      },
    });
    assert(response.ok, `Voice tool ${toolName} failed: ${response.ok ? "" : response.error}`);
    return summarizeVoice(response);
  } finally {
    await clearVoiceSessionState(sessionId);
  }
}

async function runVoiceMemoryCase(seed: AICenterQASeedResult): Promise<Record<string, unknown>> {
  const details = await runVoiceCase(seed, "memory_search", {
    query: "coffee plan sleep plan هدف العربية",
    limit: 5,
  });
  const cacheHits = Array.isArray(details.cacheHits) ? details.cacheHits.map(String) : [];
  const retrievalPolicy = asObject(details.retrievalPolicy);
  assert(retrievalPolicy.embedding === "fireworks_qwen", `Expected voice memory fireworks_qwen, got ${String(retrievalPolicy.embedding)}`);
  assert(cacheHits.includes("embedding:fireworks"), `Expected voice memory embedding trace, got ${cacheHits.join(", ")}`);
  assert(embeddingRows(cacheHits) > 0, `Expected voice memory rows > 0, got ${embeddingRows(cacheHits)}`);
  return details;
}

async function runChatMemoryRetrievalCase(seed: AICenterQASeedResult): Promise<Record<string, unknown>> {
  const message = "remember coffee plan sleep plan";
  const intent = routeIntent(message);
  const dataNeeds = compileDataNeeds(intent);
  const memoryNeed = dataNeeds.find((need) => need.kind === "memory.search");

  assert(intent.kind === "memory_question", `Expected intent memory_question, got ${intent.kind}`);
  assert(memoryNeed, `Expected memory.search data need, got ${dataNeeds.map((need) => need.kind).join(", ")}`);

  const result = await retrieveMemoryContext({
    userId: seed.user.id,
    userType: seed.user.userType,
    query: "coffee plan sleep plan هدف العربية",
    limit: 5,
  });
  const retrievalPolicy = asObject({
    embedding: result.cacheHits.includes("embedding:fireworks") ? "fireworks_qwen" : "fallback_or_cached",
    vectorRows: embeddingRows(result.cacheHits),
  });

  assert(result.facts.length > 0, "Expected memory facts for seeded chat memories");
  assert(result.cacheHits.includes("embedding:fireworks"), `Expected embedding:fireworks trace, got ${result.cacheHits.join(", ")}`);
  assert(embeddingRows(result.cacheHits) > 0, `Expected vector rows > 0, got ${embeddingRows(result.cacheHits)}`);

  return {
    intent: intent.kind,
    needs: dataNeeds.map((need) => need.kind),
    factCount: result.facts.length,
    artifactTypes: result.artifacts.map((artifact) => artifact.type),
    retrievalPolicy,
    cacheHits: result.cacheHits,
    embeddingRows: embeddingRows(result.cacheHits),
    selected: result.facts.map((fact) => fact.value).slice(0, 5),
    errors: result.errors,
  };
}

async function runVoiceActionDraftCase(seed: AICenterQASeedResult): Promise<Record<string, unknown>> {
  const details = await runVoiceCase(seed, "action_draft", {
    actionName: "goal.create",
    title: "هدف عربية QA جديد",
    targetAmount: 100000,
    targetDate: "2027-06-16",
    description: "مسودة هدف من QA runner فقط، لا تنفذ بدون تأكيد.",
  });
  const result = asObject(details.result);
  assert(result.requiresConfirmation === true, "Expected voice action draft to require confirmation");
  assert(details.actionStatus === "pending_confirmation", `Expected pending_confirmation, got ${String(details.actionStatus)}`);
  return details;
}

function markdownReport(result: QARunResult): string {
  const lines = [
    "# AI Center QA Runner Last Result",
    "",
    `Generated: ${result.generatedAt}`,
    `Status: ${result.ok ? "PASS" : "FAIL"}`,
    "",
    "## Seed",
    "",
    `- User: ${result.seed.user.name} / ${result.seed.user.phone} / id ${result.seed.user.id}`,
    `- Expenses: ${result.seed.seeded.expenses}`,
    `- Wallets: ${result.seed.seeded.wallets}`,
    `- Goals: ${result.seed.seeded.goals}`,
    `- Active memories: ${result.seed.seeded.activeMemories}`,
    `- Embeddings: ${result.seed.seeded.embeddings}`,
    `- Embedding backfill: scanned=${result.seed.embeddingBackfill.scanned}, inserted=${result.seed.embeddingBackfill.inserted}, skippedExisting=${result.seed.embeddingBackfill.skippedExisting}, skippedFallback=${result.seed.embeddingBackfill.skippedFallback}, failed=${result.seed.embeddingBackfill.failed}, model=${result.seed.embeddingBackfill.model}, dimensions=${result.seed.embeddingBackfill.dimensions}`,
    "",
    "## Cases",
    "",
  ];

  for (const item of result.cases) {
    lines.push(`### ${item.ok ? "PASS" : "FAIL"} - ${item.name}`);
    lines.push("");
    lines.push(`- Duration: ${item.durationMs} ms`);
    if (item.error) lines.push(`- Error: ${item.error}`);
    if (item.details) {
      lines.push("");
      lines.push("```json");
      lines.push(JSON.stringify(item.details, null, 2));
      lines.push("```");
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

async function writeReport(result: QARunResult): Promise<void> {
  writeFileSync(resolve(process.cwd(), "docs/AI_CENTER_QA_RUNNER_LAST_RESULT.md"), markdownReport(result), "utf8");
}

export async function runAICenterQA(): Promise<QARunResult> {
  const seed = await seedAICenterQA();
  const config = await loadKernelConfig();

  const cases: QACaseResult[] = [];
  cases.push(
    await runCase("chat finance today uses SQL facts without embedding", () =>
      runKernelCase(seed, config, {
        message: "صرفت كام النهارده؟",
        expectedIntent: "finance_query",
        requiredNeeds: ["finance.summary"],
        requireNoEmbedding: true,
      }),
    ),
  );
  cases.push(
    await runCase("chat food current month returns category total and evidence rows", () =>
      runKernelCase(seed, config, {
        message: "صرفت كام أكل الشهر ده بالظبط؟ وهات العمليات اللي اتحسبت",
        expectedIntent: "finance_query",
        requiredNeeds: ["finance.category_total", "finance.transactions"],
        requireNoEmbedding: true,
      }),
    ),
  );
  cases.push(
    await runCase("chat memory recall uses Fireworks Qwen vector retrieval", () =>
      runChatMemoryRetrievalCase(seed),
    ),
  );
  cases.push(
    await runCase("chat chart request returns chart artifact", () =>
      runKernelCase(seed, config, {
        message: "ارسملي chart مصاريف الأكل آخر 6 شهور",
        expectedIntent: "chart_request",
        requiredNeeds: ["chart.data"],
        requireChartArtifact: true,
      }),
    ),
  );
  cases.push(
    await runCase("chat site guide answers from local product guide", () =>
      runKernelCase(seed, config, {
        message: "إزاي أربط الفيزا أو SMS في التطبيق؟",
        expectedIntent: "site_help",
        requiredNeeds: ["site_guide.search"],
        requireSiteGuide: true,
      }),
    ),
  );
  cases.push(
    await runCase("voice finance tool uses exact hot summary", () =>
      runVoiceCase(seed, "finance_query", {
        kind: "summary",
        period: "today",
      }),
    ),
  );
  cases.push(await runCase("voice memory tool uses same vector memory", () => runVoiceMemoryCase(seed)));
  cases.push(await runCase("voice action draft requires confirmation", () => runVoiceActionDraftCase(seed)));

  const result: QARunResult = {
    ok: cases.every((item) => item.ok),
    generatedAt: new Date().toISOString(),
    seed,
    cases,
  };
  await writeReport(result);
  return result;
}

if (directRun()) {
  runAICenterQA()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.ok ? 0 : 1);
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.stack || error.message : error);
      process.exit(1);
    });
}
