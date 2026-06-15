export async function callFireworksAPI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<{ text: string; tokensUsed: number; cachedTokens?: number }> {
  try {
    const url = "https://api.fireworks.ai/inference/v1/chat/completions";
    const payload = {
      model,
      max_tokens: Math.min(maxTokens, 4096),
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000); // 25 seconds timeout for reasoning models

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
      throw new Error(`HTTP error! Status: ${response.status}, Details: ${errorText}`);
    }

    const data: any = await response.json();
    const text = data.choices?.[0]?.message?.content || "";
    const tokensUsed = data.usage?.total_tokens || 0;
    const promptTokens = data.usage?.prompt_tokens || 0;
    const completionTokens = data.usage?.completion_tokens || 0;
    const cachedTokens = data.usage?.prompt_tokens_details?.cached_tokens || 0;

    console.log(`[Fireworks API Usage] Total: ${tokensUsed}, Prompt: ${promptTokens}, Completion: ${completionTokens}, Cached: ${cachedTokens}`);

    return { text, tokensUsed, cachedTokens };
  } catch (error: any) {
    throw new Error(`Fireworks API error: ${error.message || String(error)}`);
  }
}
