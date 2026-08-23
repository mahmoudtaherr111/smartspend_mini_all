async function main() {
  console.log("==================================================");
  console.log(" 🕒 TESTING NVIDIA RATE LIMIT COOLDOWN RECOVERY  ");
  console.log("==================================================\n");

  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    console.error("NVIDIA_API_KEY environment variable is not set.");
    process.exit(1);
  }
  const url = "https://integrate.api.nvidia.com/v1/chat/completions";

  console.log("Pinging NVIDIA API now to test if key has recovered from 429...");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "meta/llama-3.3-70b-instruct",
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 5,
    }),
  });

  if (res.ok) {
    const data = await res.json();
    console.log("✅ Key has FULLY RECOVERED! HTTP 200 OK Response:", JSON.stringify(data));
  } else {
    const text = await res.text();
    console.log(`⏳ Still cooling down (Status ${res.status}):`, text);
  }
}

main().catch(console.error);
