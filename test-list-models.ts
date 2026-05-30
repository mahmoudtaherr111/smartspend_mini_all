import dotenv from "dotenv";
dotenv.config();

async function run() {
  const apiKey = process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY_HERE";
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

  console.log("Fetching available models directly from Google Generative Language REST API using native fetch...");
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Error: ${res.status} ${res.statusText}`);
      const text = await res.text();
      console.error(text);
      return;
    }

    const data = await res.json() as any;
    console.log("\n--- AVAILABLE MODELS ---");
    if (data.models && Array.isArray(data.models)) {
      data.models.forEach((m: any) => {
        console.log(`- ID: ${m.name.replace("models/", "")} | Name: ${m.displayName} | Supports: ${m.supportedGenerationMethods.join(", ")}`);
      });
    } else {
      console.log("No models returned or unexpected format:", data);
    }
  } catch (err: any) {
    console.error("Fetch failed:", err.message);
  }
}

run();
