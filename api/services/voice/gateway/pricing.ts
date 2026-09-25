/**
 * What a call costs us at the provider, from the token counts it reports.
 *
 * These are Google's published Live API rates (gemini-3.8-live and -extended-thinking, paid tier), checked
 * 2026-09-22 on https://ai.google.dev/gemini-api/docs/pricing — a provider cost for the admin's cost view and the
 * daily cost cap, not a price anyone pays us. The context is billed again on every turn, so the input counts of
 * every response add up; thinking tokens are billed as text output.
 */
import type { EngineUsage } from "../engine/types";

const PER_MILLION_USD = {
  input: { text: 0.75, audio: 3.0, image: 1.0, video: 1.0 } as Record<string, number>,
  output: { text: 4.5, audio: 12.0 } as Record<string, number>,
};

export interface UsageTotals {
  input: Record<string, number>;
  output: Record<string, number>;
  thoughts: number;
}

export function emptyUsage(): UsageTotals {
  return { input: {}, output: {}, thoughts: 0 };
}

export function addUsage(totals: UsageTotals, usage: EngineUsage): UsageTotals {
  const add = (into: Record<string, number>, from: Record<string, number>) => {
    for (const [modality, tokens] of Object.entries(from)) into[modality] = (into[modality] ?? 0) + tokens;
  };
  add(totals.input, usage.input);
  add(totals.output, usage.output);
  totals.thoughts += usage.thoughts;
  return totals;
}

/** USD for the given totals; a modality without a published rate is priced as audio, the dearest of each side. */
export function usageCostUsd(totals: UsageTotals): number {
  let usd = 0;
  for (const [modality, tokens] of Object.entries(totals.input)) {
    usd += (tokens * (PER_MILLION_USD.input[modality] ?? PER_MILLION_USD.input.audio)) / 1_000_000;
  }
  for (const [modality, tokens] of Object.entries(totals.output)) {
    usd += (tokens * (PER_MILLION_USD.output[modality] ?? PER_MILLION_USD.output.audio)) / 1_000_000;
  }
  usd += (totals.thoughts * PER_MILLION_USD.output.text) / 1_000_000;
  return Number(usd.toFixed(8));
}

/**
 * Google's paid rates for the text models the call's tools use (think, market_price, the post-call summary), USD per
 * million tokens, output including thinking; checked 2026-09-25 on the same page. 3.8 Flash's rates double on
 * 2027-01-01. Search grounding is free for the first 5,000 requests a month and is not counted here. A model not
 * listed is priced as the dearest one.
 */
const TEXT_PER_MILLION_USD: Record<string, { input: number; output: number }> = {
  "gemini-3.8-flash": { input: 0.75, output: 3.75 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5 },
};

export function textModelCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rate = TEXT_PER_MILLION_USD[model] ?? TEXT_PER_MILLION_USD["gemini-3.8-flash"];
  return Number(((inputTokens * rate.input + outputTokens * rate.output) / 1_000_000).toFixed(8));
}
