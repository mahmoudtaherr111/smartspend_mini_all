import Groq from "groq-sdk";

export async function callGroqAPI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
): Promise<{ text: string; tokensUsed: number }> {
  try {
    const groq = new Groq({ apiKey });
    
    const response = await groq.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: Math.min(maxTokens, 4096),
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    return {
      text: response.choices[0]?.message?.content || "",
      tokensUsed: response.usage?.total_tokens || 0,
    };
  } catch (error: any) {
    throw new Error(`Groq SDK error: ${error.message || String(error)}`);
  }
}
