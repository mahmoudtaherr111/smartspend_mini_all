async function main() {
  console.log("==================================================");
  console.log("    TESTING NVIDIA AI (NIM) API KEY LIVE         ");
  console.log("==================================================\n");

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error("NVIDIA_API_KEY environment variable is not set.");
    process.exit(1);
  }
  console.log(`Key: ${apiKey.substring(0, 15)}... (${apiKey.length} chars)`);

  // NVIDIA NIM API endpoint is OpenAI-compatible: https://integrate.api.nvidia.com/v1/chat/completions
  const url = "https://integrate.api.nvidia.com/v1/chat/completions";

  // Test with popular NVIDIA hosted models like meta/llama-3.3-70b-instruct or deepseek-ai/deepseek-r1
  const modelsToTest = [
    "meta/llama-3.3-70b-instruct",
    "deepseek-ai/deepseek-r1",
    "nvidia/llama-3.1-nemotron-70b-instruct",
    "meta/llama3-70b-instruct",
  ];

  for (const modelId of modelsToTest) {
    try {
      console.log(`Testing NVIDIA Model: [${modelId}]...`);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: "user", content: "Hi! Reply 'NVIDIA OK'." }],
          max_tokens: 20,
          temperature: 0.1,
        }),
      });

      if (res.ok) {
        const data: any = await res.json();
        const text = data.choices?.[0]?.message?.content?.trim() || "";
        console.log(`  ✅ [${modelId}]: SUCCESS -> "${text}"`);
      } else {
        const errText = await res.text().catch(() => "");
        console.log(`  ❌ [${modelId}]: FAILED (${res.status}) -> ${errText}`);
      }
    } catch (err: any) {
      console.log(`  ❌ [${modelId}]: ERROR -> ${err.message}`);
    }
  }

  // Also list available models from NVIDIA API if supported
  try {
    console.log("\nFetching live model list from NVIDIA API...");
    const res = await fetch("https://integrate.api.nvidia.com/v1/models", {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
    });
    if (res.ok) {
      const data: any = await res.json();
      const modelNames = (data.data || []).slice(0, 15).map((m: any) => m.id);
      console.log(`📋 NVIDIA Available Models (${data.data?.length || 0}):`);
      console.log(modelNames.join("\n"));
    } else {
      console.log(`❌ List models failed: ${res.status}`);
    }
  } catch (e: any) {
    console.log("❌ List models error:", e.message);
  }
}

main().catch(console.error);
