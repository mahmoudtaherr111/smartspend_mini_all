import dotenv from "dotenv";
dotenv.config();

async function testModel(modelName: string, apiKey: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const payload = {
    contents: [
      {
        parts: [
          { text: "Hello! Just say 'OK' if you can hear me." }
        ]
      }
    ]
  };

  console.log(`\nTesting model: ${modelName}...`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    console.log(`- Response Status: ${res.status} ${res.statusText}`);
    
    // Log rate limit or quota headers if Google returns them
    console.log("- Headers:");
    res.headers.forEach((value, key) => {
      if (key.includes("rate") || key.includes("quota") || key.includes("limit") || key.includes("remaining")) {
        console.log(`  ${key}: ${value}`);
      }
    });

    const data = await res.json() as any;
    if (res.ok) {
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      console.log(`- SUCCESS! AI Response: "${text}"`);
    } else {
      console.error(`- FAILED:`, data.error || data);
    }
  } catch (err: any) {
    console.error(`- Fetch failed:`, err.message);
  }
}

async function run() {
  const apiKey = "YOUR_GEMINI_API_KEY_HERE";
  console.log("=== STARTING LIVE API KEY VERIFICATION ===");
  
  // Test 1: Stable Production Flash
  await testModel("gemini-2.5-flash", apiKey);

  // Test 2: Custom / New Flash 3.5
  await testModel("gemini-3.5-flash", apiKey);

  // Test 3: Gemini 3.1 Flash Lite
  await testModel("gemini-3.1-flash-lite", apiKey);
  
  // Test 4: Audio Native (if it supports generateContent)
  await testModel("gemini-2.5-flash-native-audio-latest", apiKey);

  console.log("\n=== TESTING COMPLETED ===");
}

run();
