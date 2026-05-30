import { GoogleGenerativeAI } from "@google/generative-ai";

async function main() {
  const apiKey = "YOUR_GEMINI_API_KEY_HERE";
  const genAI = new GoogleGenerativeAI(apiKey);

  const models = [
    "gemini-2.5-flash",
    "gemini-2.5-flash-native-audio",
    "gemini-3.1-flash-live-preview"
  ];

  for (const m of models) {
    try {
      console.log(`Testing model: ${m}`);
      const model = genAI.getGenerativeModel({ model: m });
      const res = await model.generateContent("Hello, are you working?");
      console.log(`[SUCCESS] ${m}: ${res.response.text().slice(0, 50)}...`);
    } catch (e: any) {
      console.error(`[ERROR] ${m}: ${e.message}`);
    }
  }
}

main().catch(console.error);
