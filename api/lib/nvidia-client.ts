/**
 * NVIDIA NIM AI Client for SmartSpend AI
 * Executes chat completions via NVIDIA AI Foundation / NIM API (OpenAI compatible)
 */
export async function callNvidiaAPI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 512,
): Promise<{ text: string; tokensUsed: number; cachedTokens?: number }> {
  try {
    const url = "https://integrate.api.nvidia.com/v1/chat/completions";
    const payload = {
      model: model || "deepseek-ai/deepseek-v4-flash",
      max_tokens: Math.min(maxTokens, 4096),
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`NVIDIA API Error (${response.status}): ${errorText}`);
    }

    const data: any = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    const tokensUsed = data.usage?.total_tokens || 0;
    const cachedTokens = data.usage?.prompt_tokens_details?.cached_tokens || 0;

    console.log(`[NVIDIA API Usage] Model: ${model}, Total Tokens: ${tokensUsed}`);
    return { text, tokensUsed, cachedTokens };
  } catch (error: any) {
    throw new Error(`NVIDIA NIM API Client Error: ${error.message || String(error)}`);
  }
}
