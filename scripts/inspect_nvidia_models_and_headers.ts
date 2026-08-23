async function main() {
  console.log("==================================================");
  console.log("     NVIDIA API HEADERS & MODEL INSPECTION        ");
  console.log("==================================================\n");

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error("NVIDIA_API_KEY environment variable is not set.");
    process.exit(1);
  }

  // 1. Send request and capture ALL HTTP response headers
  const url = "https://integrate.api.nvidia.com/v1/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "meta/llama-3.3-70b-instruct",
      messages: [{ role: "user", content: "Hi! Reply 'OK'." }],
      max_tokens: 10,
    }),
  });

  console.log(`HTTP Status: ${res.status} ${res.statusText}`);
  console.log("\n📋 All Response Headers from NVIDIA API:");
  res.headers.forEach((val, key) => {
    console.log(`  ${key}: ${val}`);
  });

  if (res.ok) {
    const data = await res.json();
    console.log("\nResponse Body:", JSON.stringify(data));
  }

  // 2. Fetch full list of all 102 models and filter top LLMs & Vision models
  console.log("\n==================================================");
  console.log(" 📋 FULL LIST OF WORKING NVIDIA NIM MODELS");
  console.log("==================================================");

  const modelsRes = await fetch("https://integrate.api.nvidia.com/v1/models", {
    headers: { "Authorization": `Bearer ${apiKey}` },
  });

  if (modelsRes.ok) {
    const data: any = await modelsRes.json();
    const models: any[] = data.data || [];
    console.log(`Total Models: ${models.length}\n`);

    const modelIds = models.map((m) => m.id);
    
    // Categorize
    const llamaModels = modelIds.filter(m => m.includes("llama"));
    const deepseekModels = modelIds.filter(m => m.includes("deepseek"));
    const gemmaModels = modelIds.filter(m => m.includes("gemma"));
    const mistralModels = modelIds.filter(m => m.includes("mistral") || m.includes("mixtral"));
    const qwenModels = modelIds.filter(m => m.includes("qwen"));
    const nvidiaNativeModels = modelIds.filter(m => m.startsWith("nvidia/"));

    console.log("🦙 Llama Models:", llamaModels);
    console.log("🐳 DeepSeek Models:", deepseekModels);
    console.log("💎 Gemma Models:", gemmaModels);
    console.log("🌪️ Mistral/Mixtral Models:", mistralModels);
    console.log("⚡ Qwen Models:", qwenModels);
    console.log("🟢 NVIDIA Native Models:", nvidiaNativeModels);
  }
}

main().catch(console.error);
