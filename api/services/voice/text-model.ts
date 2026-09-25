/**
 * A text model for the call's work outside the live session (the post-call summary, a price lookup): Google's REST API
 * with the same keys as the call (the second key when the first is refused) and the model an admin picked in system
 * settings, then the other models of the shared chain when that one is overloaded or out of quota (Google answers 503
 * during demand spikes, 429 once a model's daily quota is spent) or too slow. It does not go through the AI gateway's
 * routes, which serve the chat and reports and fall back to per-plan defaults.
 */
import { env } from "../../lib/env";
import { geminiFallbackChain } from "../../lib/model-mapper";
import { getSystemSettings } from "../../lib/settings-cache";

export interface TextModelAnswer {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** The first web page a grounded answer came from. */
  webSource?: string;
}

export interface TextModelRequest {
  /** The system setting that names the model, and the model when it is empty. */
  modelSetting: "voice_memory_model" | "voice_price_model";
  defaultModel: string;
  system?: string;
  prompt: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** How long one model may take (30 seconds by default). */
  timeoutMs?: number;
  /** The whole answer's time budget across the models tried, for a caller that is waiting on the line. */
  deadlineMs?: number;
  /** Ground the answer in Google Search, for facts of today such as a price. */
  search?: boolean;
}

/** A refused key is worth trying the next one; any other failure is the request's own. */
const KEY_REFUSED = new Set([401, 403, 429]);

export async function askTextModel(request: TextModelRequest): Promise<TextModelAnswer> {
  const startedAt = Date.now();
  const settings = await getSystemSettings();
  // The chosen model, then the others of the shared chain (api/lib/model-mapper.ts#geminiFallbackChain).
  const models = geminiFallbackChain(settings[request.modelSetting] || request.defaultModel);
  const keys = [settings.ai_api_key || env.GEMINI_API_KEY || "", settings.ai_api_key_2 || ""].filter(Boolean);
  if (!keys.length) throw new Error("no_api_key");

  let failure: Error = new Error("no_answer");
  for (const model of models) {
    const left = request.deadlineMs ? startedAt + request.deadlineMs - Date.now() : Number.POSITIVE_INFINITY;
    if (left < 500) break;
    try {
      return await askModel(model, keys, request, Math.min(request.timeoutMs ?? 30_000, left));
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
      // Only an overloaded or silent model is worth trying the next one; a bad request fails the same everywhere.
      if (!/^text_model_(http_429|http_5[0-9][0-9]|timeout)$/.test(failure.message)) throw failure;
    }
  }
  throw failure;
}

async function askModel(model: string, keys: string[], request: TextModelRequest, timeoutMs: number): Promise<TextModelAnswer> {
  let failure: Error = new Error("no_answer");
  for (const key of keys) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
        contents: [{ role: "user", parts: [{ text: request.prompt }] }],
        ...(request.search ? { tools: [{ googleSearch: {} }] } : {}),
        generationConfig: {
          temperature: request.temperature ?? 0.2,
          maxOutputTokens: request.maxTokens ?? 1_500,
          ...(request.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    }).catch((error: unknown) => {
      const name = error instanceof Error ? error.name : "";
      throw new Error(name === "TimeoutError" || name === "AbortError" ? "text_model_timeout" : "text_model_unreachable");
    });
    if (!response.ok) {
      failure = new Error(`text_model_http_${response.status}`);
      if (KEY_REFUSED.has(response.status)) continue;
      throw failure;
    }
    const body = (await response.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string; thought?: boolean }> };
        groundingMetadata?: { groundingChunks?: Array<{ web?: { title?: string } }> };
      }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    };
    const candidate = body.candidates?.[0];
    const text = (candidate?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("");
    return {
      text,
      model,
      inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: (body.usageMetadata?.candidatesTokenCount ?? 0) + (body.usageMetadata?.thoughtsTokenCount ?? 0),
      webSource: candidate?.groundingMetadata?.groundingChunks?.find((chunk) => chunk.web?.title)?.web?.title,
    };
  }
  throw failure;
}
