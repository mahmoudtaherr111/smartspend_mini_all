import { percentile } from "./protocol";
import type { UsageSample } from "./protocol";

/** An explicit, dated measurement input, never a subscription entitlement or a runtime fallback. */
export interface ProviderRates {
  source: string;
  checkedAt: string;
  inputPerMillion: Record<string, number>;
  outputPerMillion: Record<string, number>;
}

export interface TurnMeasurement {
  id: string;
  firstAudioMs: number | null;
  durationMs: number | null;
  inputAudioSeconds: number;
  outputAudioSeconds: number;
  inputTranscriptCharacters: number;
  outputTranscriptCharacters: number;
  usage: UsageSample[];
  tools: string[];
  completed: boolean;
}

function pricedModalities(tokens: Record<string, number> | null, rates: Record<string, number>): number | null {
  if (!tokens) return null;
  let price = 0;
  for (const [modality, amount] of Object.entries(tokens)) {
    const rate = rates[modality];
    if (rate === undefined || !Number.isFinite(rate) || rate < 0) return null;
    price += amount * rate / 1_000_000;
  }
  return price;
}

export function summarizeMeasurements(turns: TurnMeasurement[], rates: ProviderRates | null) {
  const samples = turns.flatMap(turn => turn.usage);
  const missing = turns.filter(turn => !turn.usage.length).length;
  const complete = turns.length > 0 && turns.every(turn => turn.completed);
  // More than one event in a turn may be incremental OR repeated/cumulative. Do not silently sum it.
  const unambiguous = complete && missing === 0 && turns.every(turn => turn.usage.length === 1);
  let observedUsd = 0;
  let pricedVisibleModalitiesUsd = 0;
  let modalityCoverage = true;
  for (const sample of samples) {
    const input = rates ? pricedModalities(sample.promptModalities, rates.inputPerMillion) : null;
    const output = rates ? pricedModalities(sample.responseModalities, rates.outputPerMillion) : null;
    if (input !== null) pricedVisibleModalitiesUsd += input;
    if (output !== null) pricedVisibleModalitiesUsd += output;
    if (input === null || output === null) modalityCoverage = false;
    else observedUsd += input + output;
  }
  const promptSequence = turns.map(turn => turn.usage.at(-1)?.prompt ?? null);
  const audioSequence = turns.map(turn => turn.usage.at(-1)?.promptModalities?.audio ?? null);
  const modalityCountsMatch = samples.every(sample =>
    sample.prompt !== null && sample.response !== null && sample.promptModalities !== null && sample.responseModalities !== null &&
    Object.values(sample.promptModalities).reduce((a, b) => a + b, 0) === sample.prompt &&
    Object.values(sample.responseModalities).reduce((a, b) => a + b, 0) === sample.response &&
    (sample.cached ?? 0) === 0 && (sample.thoughts ?? 0) === 0,
  );
  const exactCostAvailable = unambiguous && modalityCoverage && modalityCountsMatch;
  const seconds = turns.reduce((sum, turn) => sum + turn.inputAudioSeconds + turn.outputAudioSeconds, 0);
  return {
    completedTurns: turns.filter(turn => turn.completed).length,
    observedTurns: turns.length,
    usageEvents: samples.length,
    turnsMissingUsage: missing,
    promptSequence,
    audioPromptSequence: audioSequence,
    firstAudioP50Ms: percentile(turns.flatMap(turn => turn.firstAudioMs === null ? [] : [turn.firstAudioMs]), 0.5),
    firstAudioP95Ms: percentile(turns.flatMap(turn => turn.firstAudioMs === null ? [] : [turn.firstAudioMs]), 0.95),
    inputAudioSeconds: turns.reduce((sum, turn) => sum + turn.inputAudioSeconds, 0),
    outputAudioSeconds: turns.reduce((sum, turn) => sum + turn.outputAudioSeconds, 0),
    observedModalityUsd: modalityCoverage && samples.length ? observedUsd : null,
    sumOfReportedModalitiesUsd: rates && samples.length ? pricedVisibleModalitiesUsd : null,
    estimatedSessionUsd: exactCostAvailable ? observedUsd : null,
    estimatedUsdPerAudioMinute: exactCostAvailable && seconds > 0 ? observedUsd * 60 / seconds : null,
    costStatus: exactCostAvailable ? "estimated_from_provider_usage" : "incomplete_do_not_use_for_pricing",
    billingConclusion: "Context is rebilled per turn per Google documentation; prompt growth alone does not prove invoice amounts.",
    billingSource: "https://ai.google.dev/gemini-api/docs/live-api/best-practices#pricing-and-billing",
    limitations: [
      "Provider-only lab with synthetic fixtures: does not establish application correctness or release readiness.",
      "Latency is measured at this machine, not a mobile network; text-input runs cannot establish speech latency.",
      "Modality totals can exclude transcription/thought/tool tokens; incomplete costs are not filled with zero.",
      "The sum of visible modality costs may include multiple generation events and is not a verified invoice total.",
      "Audio duration is measured from PCM byte counts; no raw audio is saved.",
    ],
  };
}
