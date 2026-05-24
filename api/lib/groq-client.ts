export async function callGroqAPI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<{ text: string; tokensUsed: number }> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: Math.min(maxTokens, 4096),
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    throw new Error(`Groq API error ${response.status}: ${errBody.slice(0, 300)}`);
  }

  const data = await response.json() as any;
  return {
    text: data?.choices?.[0]?.message?.content ?? "",
    tokensUsed: data?.usage?.total_tokens ?? 0,
  };
}
