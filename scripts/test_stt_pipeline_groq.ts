import fs from "fs";
import path from "path";

// Read .env FIRST before importing env or router
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
  const { runSTTPipeline } = await import("../api/ai-router");

  console.log("==================================================");
  console.log(" TESTING INTEGRATED STT PIPELINE VIA GROQ WHISPER ");
  console.log("==================================================\n");

  const groqKey = process.env.GROQ_API_KEY || "";
  console.log(`Loaded Groq Key: ${groqKey.substring(0, 12)}...`);

  // 1-second WAV buffer
  const sampleRate = 16000;
  const numSamples = sampleRate * 1;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  const base64Audio = buffer.toString("base64");

  const sttModelsToTest = ["whisper-large-v3-turbo", "whisper-large-v3"];

  for (const modelId of sttModelsToTest) {
    try {
      console.log(`Testing runSTTPipeline with [${modelId}]...`);
      const res = await runSTTPipeline(base64Audio, "audio/wav", groqKey, modelId);
      console.log(`  ✅ [${modelId}]: SUCCESS -> Model: ${res.modelUsed}, Output text: "${res.text}"`);
    } catch (err: any) {
      console.error(`  ❌ [${modelId}]: FAILED ->`, err.message);
    }
  }
}

main().catch(console.error);
