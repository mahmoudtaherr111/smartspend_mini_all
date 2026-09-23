/**
 * A text model for the call's work outside the live session (the post-call summary): Google's REST API with the same
 * keys as the call (the second key when the first is refused) and the model an admin picked in system settings, then
 * the fallback models when that one is overloaded (Google answers 503 during demand spikes). It does not go through
 * the AI gateway's routes, which serve the chat and reports and fall back to per-plan defaults.
 */
import { env } from "../../lib/env";
import { mapModelName } from "../../lib/model-mapper";
import { getSystemSettings } from "../../lib/settings-cache";

export interface TextModelAnswer {
  text: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface TextModelRequest {
  /** The system setting that names the model, and the model when it is empty. */
  modelSetting: "voice_memory_model";
  defaultModel: string;
  /** Tried in order when the chosen model is overloaded or does not answer in time. */
  fallbackModels?: string[];
  system: string;
  prompt: string;
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

/** A refused key is worth trying the next one; any other failure is the request's own. */
const KEY_REFUSED = new Set([401, 403, 429]);

export async function askTextModel(request: TextModelRequest): Promise<TextModelAnswer> {
  const settings = await getSystemSettings();
  const chosen = mapModelName(settings[request.modelSetting] || request.defaultModel);
  const models = [...new Set([chosen, ...(request.fallbackModels ?? []).map(mapModelName)])];
  const keys = [settings.ai_api_key || env.GEMINI_API_KEY || "", settings.ai_api_key_2 || ""].filter(Boolean);
  if (!keys.length) throw new Error("no_api_key");

  let failure: Error = new Error("no_answer");
  for (const model of models) {
    try {
      return await askModel(model, keys, request);
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
      // Only an overloaded or silent model is worth trying the next one; a bad request fails the same everywhere.
      if (!/^text_model_(http_5[0-9][0-9]|timeout)$/.test(failure.message)) throw failure;
    }
  }
  throw failure;
}

async function askModel(model: string, keys: string[], request: TextModelRequest): Promise<TextModelAnswer> {
  let failure: Error = new Error("no_answer");
  for (const key of keys) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      signal: AbortSignal.timeout(request.timeoutMs ?? 30_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ role: "user", parts: [{ text: request.prompt }] }],
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
      candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    };
    const text = (body.candidates?.[0]?.content?.parts ?? [])
      .filter((part) => !part.thought)
      .map((part) => part.text ?? "")
      .join("");
    return {
      text,
      model,
      inputTokens: body.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: (body.usageMetadata?.candidatesTokenCount ?? 0) + (body.usageMetadata?.thoughtsTokenCount ?? 0),
    };
  }
  throw failure;
}
