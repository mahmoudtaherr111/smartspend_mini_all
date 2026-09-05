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
  const url = "https://integrate.api.nvidia.com/v1/chat/completions";
  const targetModel = model || "meta/llama-3.2-11b-vision-instruct";

  const executeRequest = async (includeJsonFormat: boolean) => {
    const payload: any = {
      model: targetModel,
      max_tokens: Math.min(maxTokens, 4096),
      temperature: 0.1,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    };

    if (includeJsonFormat) {
      payload.response_format = { type: "json_object" };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
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
        // If response_format caused 400 error, retry once without it
        if (includeJsonFormat && (response.status === 400 || response.status === 422)) {
          return null; // trigger retry
        }
        throw new Error(`NVIDIA API Error (${response.status}): ${errorText}`);
      }

      const data: any = await response.json();
      const text = data.choices?.[0]?.message?.content || "";
      const tokensUsed = data.usage?.total_tokens || 0;
      const cachedTokens = data.usage?.prompt_tokens_details?.cached_tokens || 0;

      console.log(`[NVIDIA API Usage] Model: ${targetModel}, Total Tokens: ${tokensUsed}`);
      return { text, tokensUsed, cachedTokens };
    } catch (err: any) {
      clearTimeout(timeoutId);
      throw err;
    }
  };

  try {
    const firstTry = await executeRequest(true);
    if (firstTry) return firstTry;
    // Retry without response_format
    const secondTry = await executeRequest(false);
    if (secondTry) return secondTry;
    throw new Error("NVIDIA API failed to return a valid response.");
  } catch (error: any) {
    throw new Error(`NVIDIA NIM API Client Error: ${error.message || String(error)}`);
  }
}
