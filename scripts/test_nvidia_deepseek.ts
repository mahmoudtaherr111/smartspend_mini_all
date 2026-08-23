async function main() {
  console.log("==================================================");
  console.log(" TESTING NVIDIA DEEPSEEK-V4-FLASH MODEL LIVE     ");
  console.log("==================================================\n");

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error("NVIDIA_API_KEY environment variable is not set.");
    process.exit(1);
  }
  const url = "https://integrate.api.nvidia.com/v1/chat/completions";
  const modelId = "deepseek-ai/deepseek-v4-flash";

  console.log(`Key: ${apiKey.substring(0, 15)}...`);
  console.log(`Model: ${modelId}`);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: "system", content: "أنت محرك تصنيف معاملات مالي مصري. رد بـ JSON فقط." },
          { role: "user", content: "صرفت 150 جنيه فودافون كاش كروت شحن" }
        ],
        max_tokens: 150,
        temperature: 0.1,
        response_format: { type: "json_object" }
      }),
    });

    if (res.ok) {
      const data: any = await res.json();
      console.log("✅ SUCCESS! Response Status:", res.status);
      console.log("Output Content:\n", data.choices?.[0]?.message?.content);
      console.log("\nTokens Used:", data.usage);
    } else {
      const errText = await res.text();
      console.error(`❌ FAILED (${res.status}):`, errText);
    }
  } catch (err: any) {
    console.error("❌ ERROR:", err.message);
  }
}

main().catch(console.error);
