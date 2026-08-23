async function main() {
  console.log("==================================================");
  console.log(" TESTING ALL NVIDIA CLASSIFICATION MODELS        ");
  console.log("==================================================\n");

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error("NVIDIA_API_KEY environment variable is not set.");
    process.exit(1);
  }
  const url = "https://integrate.api.nvidia.com/v1/chat/completions";

  const candidates = [
    "deepseek-ai/deepseek-v4-flash",
    "deepseek-ai/deepseek-v4-pro",
    "meta/llama-3.3-70b-instruct",
    "meta/llama-3.1-8b-instruct",
    "nvidia/llama-3.1-nemotron-70b-instruct",
    "google/gemma-3-12b-it",
    "mistralai/mistral-large-2-instruct",
  ];

  for (const modelId of candidates) {
    try {
      const start = Date.now();
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [
            { role: "system", content: "أنت مصنف مصاريف. رجّع JSON: {\"category\": \"مصاريف شخصية\"}" },
            { role: "user", content: "صرفت 150 جنيه فودافون كاش كروت شحن" }
          ],
          max_tokens: 100,
          temperature: 0.1,
          response_format: { type: "json_object" }
        }),
      });

      const latency = Date.now() - start;

      if (res.ok) {
        const data: any = await res.json();
        const content = data.choices?.[0]?.message?.content?.trim();
        console.log(`✅ [${modelId}] (${latency}ms): SUCCESS -> ${content}`);
      } else {
        const text = await res.text();
        console.log(`❌ [${modelId}] (${latency}ms): FAILED (${res.status}) -> ${text}`);
      }
    } catch (err: any) {
      console.log(`❌ [${modelId}]: ERROR -> ${err.message}`);
    }
  }
}

main().catch(console.error);
