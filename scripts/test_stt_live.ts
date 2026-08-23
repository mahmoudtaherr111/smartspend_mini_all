import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Read .env manually
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const k = trimmed.substring(0, eqIdx).trim();
      const v = trimmed.substring(eqIdx + 1).trim();
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }
  }
}

async function main() {
  console.log("==================================================");
  console.log("    TESTING STT (SPEECH TO TEXT) PIPELINE         ");
  console.log("==================================================\n");

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ Missing GEMINI_API_KEY");
    return;
  }

  // Create a minimal silent WAV/PCM base64 header audio chunk to test Gemini multimodal audio endpoint
  // A valid 44-byte WAV header containing 0.1s silence
  const wavHeader = Buffer.from([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
    0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00,
    0x02, 0x00, 0x10, 0x00, 0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00
  ]);
  const base64Audio = wavHeader.toString("base64");

  const sttModels = ["gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-2.5-flash"];

  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelId of sttModels) {
    try {
      console.log(`Testing STT on model: [${modelId}]...`);
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent([
        "حوّل الصوت لنص مصري عامي. أرقام بأرقام. لا تضف شرح.",
        {
          inlineData: {
            data: base64Audio,
            mimeType: "audio/wav",
          },
        },
      ]);
      const text = result.response.text();
      console.log(`  ✅ [${modelId}]: SUCCESS -> "${text.trim() || "(Audio processed successfully - silence)"}"`);
    } catch (err: any) {
      console.log(`  ❌ [${modelId}]: FAILED -> ${err.message}`);
    }
  }
}

main().catch(console.error);
