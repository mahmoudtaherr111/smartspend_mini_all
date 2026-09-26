/** Provider-only measurements. This module never connects to an application account. */
import { mapModelName } from "../../api/lib/model-mapper";
export type LiveModel = "gemini-3.8-live" | "gemini-3.8-live-extended-thinking";
export type JsonObject = Record<string, unknown>;
export const object = (value: unknown): JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
export const field = (value: JsonObject, camel: string, snake: string): unknown => value[camel] ?? value[snake];

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function modalities(value: unknown): Record<string, number> | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const result: Record<string, number> = {};
  for (const item of value) {
    const entry = object(item);
    const tokens = count(field(entry, "tokenCount", "token_count"));
    if (tokens === null || typeof entry.modality !== "string") return null;
    const name = entry.modality.toLowerCase();
    result[name] = (result[name] ?? 0) + tokens;
  }
  return result;
}

export interface UsageSample {
  prompt: number | null;
  response: number | null;
  total: number | null;
  thoughts: number | null;
  cached: number | null;
  promptModalities: Record<string, number> | null;
  responseModalities: Record<string, number> | null;
}

export function readUsage(message: JsonObject): UsageSample | null {
  const raw = field(message, "usageMetadata", "usage_metadata");
  if (!raw) return null;
  const usage = object(raw);
  return {
    prompt: count(field(usage, "promptTokenCount", "prompt_token_count")),
    response: count(field(usage, "responseTokenCount", "response_token_count")),
    total: count(field(usage, "totalTokenCount", "total_token_count")),
    thoughts: count(field(usage, "thoughtsTokenCount", "thoughts_token_count")),
    cached: count(field(usage, "cachedContentTokenCount", "cached_content_token_count")),
    promptModalities: modalities(field(usage, "promptTokensDetails", "prompt_tokens_details")),
    responseModalities: modalities(field(usage, "responseTokensDetails", "response_tokens_details")),
  };
}

export function isInteractionComplete(model: LiveModel, message: JsonObject): boolean {
  // generationComplete finishes generation, not necessarily playback, transcription, or async tools.
  if (model.endsWith("extended-thinking")) {
    const content = object(field(message, "serverContent", "server_content"));
    return (field(message, "interactionStatus", "interaction_status") ?? field(content, "interactionStatus", "interaction_status")) === "IDLE";
  }
  return field(object(field(message, "serverContent", "server_content")), "turnComplete", "turn_complete") === true;
}

export interface SetupOptions {
  model: LiveModel;
  systemInstruction: string;
  tools?: JsonObject[];
  thinking: "low" | "medium" | "high";
  compression: boolean;
  triggerTokens: number;
  targetTokens: number;
  manualVad?: boolean;
}

export function buildSetup(options: SetupOptions): JsonObject {
  return { setup: {
    model: `models/${mapModelName(options.model)}`,
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Puck" } } },
      ...(options.model.endsWith("extended-thinking")
        ? { thinkingConfig: { thinkingLevel: options.thinking.toUpperCase() } } : {}),
    },
    systemInstruction: { parts: [{ text: options.systemInstruction }] },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: {},
    ...(options.manualVad ? { realtimeInputConfig: { automaticActivityDetection: { disabled: true } } } : {}),
    ...(options.compression ? { contextWindowCompression: {
      triggerTokens: String(options.triggerTokens), slidingWindow: { targetTokens: String(options.targetTokens) },
    } } : {}),
    ...(options.tools?.length ? { tools: [{ functionDeclarations: options.tools.map(tool => ({ ...tool, behavior: "NON_BLOCKING" })) }] } : {}),
  } };
}

export function toolReply(model: LiveModel, id: string, name: string, result: JsonObject): JsonObject {
  return { id, name, response: {
    ...result,
    // The extended-thinking model rejects scheduling configuration.
    ...(model.endsWith("extended-thinking") ? {} : { scheduling: "WHEN_IDLE" }),
  } };
}

export function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  return [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * fraction) - 1)];
}
