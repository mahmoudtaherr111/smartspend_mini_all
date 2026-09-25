/**
 * What an AI call cost at the provider, for every provider and model the app uses: the prices the admin entered for
 * a model in the console (`ai_models`, the source of truth for any provider the admin subscribes to), else the prices
 * a provider publishes for the models the app uses by default, else nothing — an unpriced call is recorded as such
 * rather than guessed. Output includes thinking tokens, as every provider here bills them.
 */
import { and, eq } from "drizzle-orm";
import { PUBLISHED_RATES } from "../../contracts/ai-models";
import { aiModels, aiProviders } from "../../db/schema";
import { db } from "../queries/connection";
import { mapModelName } from "./model-mapper";
import { getSystemSettings } from "./settings-cache";
import { createLogger } from "./log";

const log = createLogger("ai-pricing");

export interface ModelRates {
  /** USD per million input tokens not served from a cache. */
  input: number;
  /** USD per million output tokens, thinking included. */
  output: number;
  /** USD per million input tokens served from the provider's cache. */
  cached: number;
  source: "admin" | "published";
}

export { PUBLISHED_RATES };

const CACHE_MS = 60_000;
let adminRates: { at: number; byKey: Map<string, ModelRates> } | null = null;

async function loadAdminRates(): Promise<Map<string, ModelRates>> {
  if (adminRates && Date.now() - adminRates.at < CACHE_MS) return adminRates.byKey;
  const byKey = new Map<string, ModelRates>();
  try {
    const rows = await db
      .select({
        slug: aiProviders.slug,
        modelId: aiModels.modelId,
        input: aiModels.inputPricePer1M,
        output: aiModels.outputPricePer1M,
        cached: aiModels.cachedPricePer1M,
      })
      .from(aiModels)
      .innerJoin(aiProviders, eq(aiProviders.id, aiModels.providerId))
      .where(and(eq(aiModels.isActive, true), eq(aiProviders.isActive, true)));
    for (const row of rows) {
      // A model saved without prices (both zero) is unpriced, not free.
      if (Number(row.input) === 0 && Number(row.output) === 0) continue;
      const rates: ModelRates = { input: Number(row.input), output: Number(row.output), cached: Number(row.cached), source: "admin" };
      byKey.set(`${row.slug}:${row.modelId}`, rates);
      // The same model under any provider, for callers that know only the model.
      if (!byKey.has(`*:${row.modelId}`)) byKey.set(`*:${row.modelId}`, rates);
    }
  } catch (error) {
    log.warn({ event: "ai_pricing.admin_rates_unreadable", err: error }, "Admin model prices could not be read");
  }
  adminRates = { at: Date.now(), byKey };
  return byKey;
}

/** Forget the cached admin prices (after the admin edits a model). */
export function invalidateAiPricing(): void {
  adminRates = null;
}

/** The rates for a model, or null when neither the admin nor a published price knows it. */
export async function ratesFor(providerSlug: string | null | undefined, modelId: string): Promise<ModelRates | null> {
  const admin = await loadAdminRates();
  const fromAdmin = (providerSlug ? admin.get(`${providerSlug}:${modelId}`) : undefined) ?? admin.get(`*:${modelId}`);
  if (fromAdmin) return fromAdmin;
  const published = PUBLISHED_RATES[modelId] ?? PUBLISHED_RATES[mapModelName(modelId)];
  if (!published) return null;
  return { input: published.input, output: published.output, cached: published.cached ?? published.input, source: "published" };
}

export interface CallUsage {
  promptTokens: number;
  completionTokens: number;
  cachedTokens?: number;
  /** Thinking tokens, when the provider reports them apart from the answer. */
  reasoningTokens?: number;
}

/** USD for the usage at the given rates; cached input is billed at the cached rate. */
export function costAtRates(rates: ModelRates, usage: CallUsage): number {
  const cached = Math.min(usage.cachedTokens ?? 0, usage.promptTokens);
  const input = Math.max(0, usage.promptTokens - cached);
  const output = usage.completionTokens + (usage.reasoningTokens ?? 0);
  return Number(((input * rates.input + cached * rates.cached + output * rates.output) / 1_000_000).toFixed(8));
}

export interface CallCost {
  usd: number;
  egp: number;
  /** False when no price is known: the cost is recorded as zero and marked so. */
  priced: boolean;
  rateSource: ModelRates["source"] | null;
}

/** The provider's price for one call, in USD and in EGP at the admin's rate (`usd_to_egp_rate`). */
export async function aiCallCost(providerSlug: string | null | undefined, modelId: string, usage: CallUsage): Promise<CallCost> {
  const [rates, settings] = await Promise.all([ratesFor(providerSlug, modelId), getSystemSettings()]);
  const rate = Number(settings.usd_to_egp_rate) || 48.5;
  if (!rates) return { usd: 0, egp: 0, priced: false, rateSource: null };
  const usd = costAtRates(rates, usage);
  return { usd, egp: Number((usd * rate).toFixed(6)), priced: true, rateSource: rates.source };
}
