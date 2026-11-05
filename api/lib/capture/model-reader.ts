/**
 * sms-v5 transport (decision 0049): the admin's "sms" routes (or the server's Gemini key when none is set), prepared
 * text only, durable capture reservations. A reply that fails its checks is asked of the next route.
 */
import { z } from "zod";
import { resolveAdminRoutes } from "../ai-gateway";
import { recordAiLedger } from "../ai-ledger";
import { costAtRates, ratesFor } from "../ai-pricing";
import { asPlan, estimateTokensFromText } from "../ai-usage-policy";
import { env } from "../env";
import { executeLlmChain, LlmChainError, type LlmAttempt, type LlmRoute, type StructuredSchema } from "../llm-router";
import { mapModelName } from "../model-mapper";
import { getSystemSettings } from "../settings-cache";
import { reserveCaptureCall, settleCaptureCall } from "./admission";
import {
  CAPTURE_MODEL_REPLY_SCHEMA,
  CAPTURE_PROMPT_VERSION,
  CAPTURE_SYSTEM_PROMPT,
  captureUserPrompt,
  checkCaptureReply,
  labelAmounts,
  parseCaptureReply,
  proposeCapturePosting,
  type CapturePostingProposal,
  type CaptureReplyCheck,
} from "./model-contract";
import { preparedCaptureMessage, type PreparedCaptureText } from "./privacy";
import { CAPTURE_AUTOMATIC_CONSENT_TEXT_VERSION, captureConsentsOf } from "./consent";

/** The models used when the admin configured none for "sms": both answer on the server's Gemini key. */
export const CAPTURE_DEFAULT_MODELS = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"] as const;

export interface CaptureModelUser { userId: number; userType: "oauth" | "local"; plan?: string | null; sender?: string | null }
export type CaptureModelRead =
  | { outcome: "read"; check: Extract<CaptureReplyCheck, { ok: true }>; proposal: CapturePostingProposal; model: string; provider: string }
  | { outcome: "disabled" | "unpriced" | "configuration" | "capacity" | "daily_cap" | "monthly_budget" | "gone" | "failed" | "invalid_reply" };
const positive = (value: string | undefined, fallback: number, max: number) => {
  if (value === undefined) return fallback;
  const number = Number(value); return Number.isFinite(number) && number > 0 && number <= max ? number : null;
};

/** The routes capture asks, in order: the admin's for "sms", else the server's own Gemini key. */
export async function captureRoutes(plan: ReturnType<typeof asPlan>): Promise<LlmRoute[]> {
  const admin = await resolveAdminRoutes("sms", plan);
  const configured = admin.preferred ? [admin.preferred, ...admin.routes.filter((row) => row.slug !== admin.preferred!.slug || row.model !== admin.preferred!.model)] : admin.routes;
  const seen = new Set<string>();
  const routes: LlmRoute[] = configured.flatMap((route) => {
    const model = route.protocol === "gemini" ? mapModelName(route.model) : route.model;
    if (seen.has(`${route.slug}:${model}`)) return [];
    seen.add(`${route.slug}:${model}`);
    return [{ ...route, protocol: route.protocol === "gemini" ? "gemini" as const : "openai" as const, model }];
  });
  if (routes.length) return routes;
  const key = (await getSystemSettings()).ai_api_key || env.GEMINI_API_KEY;
  return key ? CAPTURE_DEFAULT_MODELS.map((model, index) => ({ slug: "gemini", protocol: "gemini" as const, baseUrl: "", apiKey: key, model, priority: index })) : [];
}

const userPromptSchema = z.string().max(20_000);

export async function readCaptureWithModel(text: PreparedCaptureText, user: CaptureModelUser): Promise<CaptureModelRead> {
  const labelled = labelAmounts(preparedCaptureMessage(text));
  const userPrompt = userPromptSchema.parse(captureUserPrompt(labelled, user.sender ?? null));
  const settings = await getSystemSettings();
  if (settings.sms_ai_enabled === "false") return { outcome: "disabled" };
  const plan = asPlan(user.plan ?? undefined);
  const dailyCap = positive(settings.capture_ai_daily_cost_cap_usd, 50, 100000);
  const tokenCap = plan === "free" ? positive(settings.capture_ai_tokens_free, 2_000_000, 2_000_000_000) : 0;
  const capacity = positive(settings.capture_ai_concurrency, 64, 1000);
  if (dailyCap === null || tokenCap === null || capacity === null) return { outcome: "configuration" };
  const routes = await captureRoutes(plan);
  if (!routes.length) return { outcome: "configuration" };
  const maxOutput = 600;
  const inputTokens = estimateTokensFromText(userPrompt) + estimateTokensFromText(CAPTURE_SYSTEM_PROMPT);
  let outcome: "failed" | "invalid_reply" = "failed";
  let priced = 0;
  for (const route of routes.slice(0, 3)) {
    const rates = await ratesFor(route.slug, route.model);
    if (!rates || ![rates.input, rates.output, rates.cached ?? rates.input].every((value) => Number.isFinite(value) && value >= 0)) continue;
    priced++;
    const worstCost = costAtRates(rates, { promptTokens: inputTokens, completionTokens: maxOutput });
    const reservation = await reserveCaptureCall({
      userId: user.userId, userType: user.userType, tokens: inputTokens + maxOutput, costUsd: Math.max(worstCost, 0.00000001),
      dailyCapUsd: dailyCap, monthlyTokens: Math.floor(tokenCap), concurrency: Math.floor(capacity),
    });
    if (!reservation.ok) return { outcome: reservation.reason };
    let attempts: LlmAttempt[] = [];
    let sent = false;
    try {
      const consent = await captureConsentsOf(user, undefined, CAPTURE_AUTOMATIC_CONSENT_TEXT_VERSION);
      if (!consent.capture || !consent.aiReading) return { outcome: "disabled" };
      sent = true;
      const response = await executeLlmChain([route], {
        systemPrompt: CAPTURE_SYSTEM_PROMPT, userPrompt, schema: CAPTURE_MODEL_REPLY_SCHEMA as StructuredSchema,
        maxOutputTokens: maxOutput, temperature: 0, lowThinking: true, timeoutMs: 12000, deadlineMs: 20000,
      });
      attempts = response.attempts.length ? response.attempts : [{ slug: route.slug, model: route.model, ok: true, latencyMs: response.latencyMs,
        promptTokens: response.promptTokens, completionTokens: response.completionTokens, cachedTokens: response.cachedTokens, totalTokens: response.totalTokens }];
      const check = checkCaptureReply(parseCaptureReply(response.text), labelled);
      if (check.ok) return { outcome: "read", check, proposal: proposeCapturePosting(check), model: route.model, provider: route.slug };
      outcome = "invalid_reply";
    } catch (error) {
      attempts = error instanceof LlmChainError ? error.attempts : [];
      // No provider errors or reply bodies are logged: they can echo the request.
      if (outcome !== "invalid_reply") outcome = "failed";
    } finally {
      let costUsd = 0, tokens = 0;
      for (const attempt of attempts) {
        const promptTokens = attempt.promptTokens ?? 0, completionTokens = attempt.completionTokens ?? 0;
        if (promptTokens + completionTokens === 0) continue;
        const cost = costAtRates(rates, { promptTokens, completionTokens, cachedTokens: attempt.cachedTokens });
        costUsd += cost;
        tokens += attempt.totalTokens ?? promptTokens + completionTokens;
        await recordAiLedger({ userId: user.userId, userType: user.userType, channel: "capture", providerSlug: route.slug, modelId: route.model,
          promptTokens, completionTokens, cachedTokens: attempt.cachedTokens, costUsd: cost,
          latencyMs: attempt.latencyMs, httpStatus: attempt.ok ? 200 : attempt.status ?? 0, metadata: { promptVersion: CAPTURE_PROMPT_VERSION } });
      }
      await settleCaptureCall(reservation.reservation, tokens > 0 ? { tokens, costUsd } : sent ? null : { tokens: 0, costUsd: 0 });
    }
  }
  return { outcome: priced ? outcome : "unpriced" };
}
