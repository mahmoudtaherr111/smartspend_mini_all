/**
 * DeepSeek / OpenAI-Compatible Chat Client
 *
 * Supports any OpenAI-compatible API (DeepSeek, Fireworks, OpenRouter, etc.)
 * with function calling / tool use support.
 */

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none" | { type: "function"; function: { name: string } };
  max_tokens?: number;
  temperature?: number;
}

export interface ChatCompletionResponse {
  text: string;
  toolCalls: ToolCall[] | null;
  tokensUsed: number;
  promptTokens: number;
  completionTokens: number;
  model: string;
  finishReason: string;
}

/**
 * Call an OpenAI-compatible chat completions API with tool support.
 */
export async function callChatCompletionAPI(
  baseUrl: string,
  apiKey: string,
  request: ChatCompletionRequest,
): Promise<ChatCompletionResponse> {
  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const payload: Record<string, unknown> = {
    model: request.model,
    messages: request.messages,
    max_tokens: Math.min(request.max_tokens || 2048, 8192),
    temperature: request.temperature ?? 0.7,
  };

  if (request.tools && request.tools.length > 0) {
    payload.tools = request.tools;
    payload.tool_choice = request.tool_choice || "auto";
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      const statusMsg = response.status === 429
        ? "الـ API وصل الحد الأقصى. جرب تاني بعد شوية."
        : response.status === 401
          ? "مفتاح الـ API غير صالح."
          : `خطأ من السيرفر (${response.status})`;
      console.error(`[DeepSeek] HTTP ${response.status}: ${errorText.slice(0, 300)}`);
      throw new Error(statusMsg);
    }

    const data: any = await response.json();
    const choice = data.choices?.[0];
    const message = choice?.message;

    const text = message?.content || "";
    const toolCalls: ToolCall[] | null =
      message?.tool_calls && message.tool_calls.length > 0
        ? message.tool_calls.map((tc: any) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          }))
        : null;

    const tokensUsed = data.usage?.total_tokens || 0;
    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;

    console.log(
      `[DeepSeek] Model: ${data.model || request.model} | Tokens: ${tokensUsed} (P:${promptTokens} C:${completionTokens}) | Tools: ${toolCalls ? toolCalls.map((t) => t.function.name).join(",") : "none"}`,
    );

    return {
      text,
      toolCalls,
      tokensUsed,
      promptTokens,
      completionTokens,
      model: data.model || request.model,
      finishReason: choice?.finish_reason || "stop",
    };
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      throw new Error("الرد من الـ AI أخد وقت طويل. جرب تاني.");
    }
    throw error;
  }
}
