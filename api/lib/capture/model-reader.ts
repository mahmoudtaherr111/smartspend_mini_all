/** sms-v4 transport: only qualified admin routes, prepared text and durable capture-only reservations. */
import { createHash } from "node:crypto";
import { z } from "zod";
import { resolveAdminRoutes } from "../ai-gateway";
import { recordAiLedger } from "../ai-ledger";
import { costAtRates, ratesFor } from "../ai-pricing";
import { asPlan, estimateTokensFromText } from "../ai-usage-policy";
import { executeLlmChain, LlmChainError, type LlmAttempt, type LlmRoute, type StructuredSchema } from "../llm-router";
import { mapModelName } from "../model-mapper";
import { getSystemSettings } from "../settings-cache";
import { reserveCaptureCall, settleCaptureCall } from "./admission";
import { CAPTURE_MODEL_REPLY_SCHEMA, CAPTURE_PROMPT_VERSION, CAPTURE_SYSTEM_PROMPT, checkCaptureReply, parseCaptureReply, proposeCapturePosting, type CaptureReplyCheck, type CapturePostingProposal } from "./model-contract";
import { preparedCapturePrompt, type PreparedCaptureText } from "./privacy";
import { CAPTURE_AUTOMATIC_CONSENT_TEXT_VERSION, captureConsentsOf } from "./consent";

export const CAPTURE_PROMPT_DIGEST = createHash("sha256").update(CAPTURE_SYSTEM_PROMPT).update(JSON.stringify(CAPTURE_MODEL_REPLY_SCHEMA)).digest("hex");
const qualificationSchema = z.strictObject({
  version: z.literal(CAPTURE_PROMPT_VERSION), digest: z.literal(CAPTURE_PROMPT_DIGEST),
  routes: z.array(z.strictObject({ slug: z.string().min(1).max(64), model: z.string().min(1).max(128) })).min(2).max(32),
  pairs: z.array(z.string().regex(/^[a-z0-9_-]+:[a-z_]+$/)).min(1).max(1000),
  dataProcessingApproved: z.literal(true),
});
export function captureQualification(settings: Record<string, string>) {
  try {
    const parsed = qualificationSchema.safeParse(JSON.parse(settings.capture_model_qualified ?? "null"));
    return parsed.success && new Set(parsed.data.routes.map((row) => row.slug)).size >= 2 ? parsed.data : null;
  } catch { return null; }
}
export interface CaptureModelUser { userId: number; userType: "oauth" | "local"; plan?: string | null; sourceSlug: string | null }
export type CaptureModelRead =
  | { outcome: "read"; check: Extract<CaptureReplyCheck, { ok: true }>; proposal: CapturePostingProposal; model: string; provider: string }
  | { outcome: "disabled" | "unqualified" | "unpriced" | "configuration" | "capacity" | "daily_cap" | "monthly_budget" | "gone" | "failed" | "invalid_reply" };
const positive = (value: string | undefined, fallback: number, max: number) => {
  if (value === undefined) return fallback;
  const number = Number(value); return Number.isFinite(number) && number > 0 && number <= max ? number : null;
};

export async function readCaptureWithModel(text: PreparedCaptureText, user: CaptureModelUser): Promise<CaptureModelRead> {
  const userPrompt = preparedCapturePrompt(text);
  const settings = await getSystemSettings();
  if (settings.sms_ai_enabled === "false") return { outcome: "disabled" };
  const qualified = captureQualification(settings);
  if (!qualified || !user.sourceSlug || !qualified.pairs.some((pair) => pair.startsWith(`${user.sourceSlug}:`))) return { outcome: "unqualified" };
  const plan = asPlan(user.plan ?? undefined);
  const dailyCap = positive(settings.capture_ai_daily_cost_cap_usd, 50, 100000);
  const tokenCap = plan === "free" ? positive(settings.capture_ai_tokens_free, 2_000_000, 2_000_000_000) : 0;
  const capacity = positive(settings.capture_ai_concurrency, 64, 1000);
  if (dailyCap === null || tokenCap === null || capacity === null) return { outcome: "configuration" };
  const admin = await resolveAdminRoutes("sms", plan);
  const configured = admin.preferred ? [admin.preferred, ...admin.routes.filter((row) => row.slug !== admin.preferred!.slug)] : admin.routes;
  const seen = new Set<string>();
  const routes: LlmRoute[] = configured.flatMap((route) => {
    const model = mapModelName(route.model);
    if (seen.has(route.slug) || !qualified.routes.some((row) => row.slug === route.slug && row.model === model)) return [];
    seen.add(route.slug);
    return [{ ...route, protocol: route.protocol === "gemini" ? "gemini" as const : "openai" as const, model }];
  });
  if (routes.length < 2) return { outcome: "unqualified" };
  const maxOutput = 1800;
  const inputTokens = estimateTokensFromText(userPrompt) + estimateTokensFromText(CAPTURE_SYSTEM_PROMPT);
  if (inputTokens + maxOutput > 12000) return { outcome: "invalid_reply" };
  let outcome: "failed" | "invalid_reply" = "failed";
  let unresolved: CaptureModelRead | null = null;
  let priced = 0;
  for (const route of routes.slice(0, 2)) {
    const rates = await ratesFor(route.slug, route.model);
    if (!rates || ![rates.input, rates.output, rates.cached ?? rates.input].every((value) => Number.isFinite(value) && value >= 0)) continue;
    priced++;
    const worstCost = costAtRates(rates, { promptTokens: inputTokens, completionTokens: maxOutput });
    const reservation = await reserveCaptureCall({
      userId: user.userId, userType: user.userType, tokens: inputTokens + maxOutput, costUsd: Math.max(worstCost, 0.00000001),
      dailyCapUsd: dailyCap, monthlyTokens: Math.floor(tokenCap), concurrency: Math.floor(capacity),
    });
    if (!reservation.ok) return unresolved ?? { outcome: reservation.reason };
    let attempts: LlmAttempt[] = [];
    let sent = false;
    try {
      const consent = await captureConsentsOf(user, undefined, CAPTURE_AUTOMATIC_CONSENT_TEXT_VERSION);
      if (!consent.capture || !consent.aiReading) return { outcome: "disabled" };
      sent = true;
      const response = await executeLlmChain([route], {
        systemPrompt: CAPTURE_SYSTEM_PROMPT, userPrompt, schema: CAPTURE_MODEL_REPLY_SCHEMA as StructuredSchema,
        maxOutputTokens: maxOutput, temperature: 0, lowThinking: true, timeoutMs: 8000, deadlineMs: 15000,
      });
      attempts = response.attempts.length ? response.attempts : [{ slug: route.slug, model: route.model, ok: true, latencyMs: response.latencyMs,
        promptTokens: response.promptTokens, completionTokens: response.completionTokens, cachedTokens: response.cachedTokens, totalTokens: response.totalTokens }];
      const check = checkCaptureReply(parseCaptureReply(response.text), text.text);
      if (check.ok) {
        const read: CaptureModelRead = { outcome: "read", check, proposal: proposeCapturePosting(check), model: route.model, provider: route.slug };
        if (read.proposal.status !== "waiting" || read.proposal.reason !== "unknown") return read;
        unresolved = read;
      }
      outcome = "invalid_reply";
    } catch (error) {
      attempts = error instanceof LlmChainError ? error.attempts : [];
      // No provider errors or reply bodies are logged: they can echo the request.
      outcome = "failed";
    } finally {
      let costUsd = 0, tokens = 0;
      for (const attempt of attempts) {
        const promptTokens = attempt.promptTokens ?? 0, completionTokens = attempt.completionTokens ?? 0;
        if (promptTokens + completionTokens === 0) continue;
        costUsd += costAtRates(rates, { promptTokens, completionTokens, cachedTokens: attempt.cachedTokens });
        tokens += attempt.totalTokens ?? promptTokens + completionTokens;
        await recordAiLedger({ userId: user.userId, userType: user.userType, channel: "capture", providerSlug: route.slug, modelId: route.model,
          promptTokens, completionTokens, cachedTokens: attempt.cachedTokens, costUsd: costAtRates(rates, { promptTokens, completionTokens, cachedTokens: attempt.cachedTokens }),
          latencyMs: attempt.latencyMs, httpStatus: attempt.ok ? 200 : attempt.status ?? 0, metadata: { promptVersion: CAPTURE_PROMPT_VERSION } });
      }
      await settleCaptureCall(reservation.reservation, tokens > 0 ? { tokens, costUsd } : sent ? null : { tokens: 0, costUsd: 0 });
    }
  }
  return unresolved ?? { outcome: priced ? outcome : "unpriced" };
}
