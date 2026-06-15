import dotenv from "dotenv";
import WebSocket from "ws";
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || "";

// Test ALL possible model names across all API versions
const modelsToTest = [
  // Exact names user provided
  "models/gemini-2.5-flash-native-audio-preview-12-2025",
  "models/gemini-3.1-flash-live-preview",
  // Without models/ prefix
  "gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-3.1-flash-live-preview",
  // Other common live models that might work
  "models/gemini-2.0-flash-live-001",
  "gemini-2.0-flash-live-001",
  "models/gemini-2.0-flash-exp",
  "gemini-2.0-flash-exp",
  "models/gemini-2.5-flash-preview-native-audio-dialog",
  "gemini-2.5-flash-preview-native-audio-dialog",
  "models/gemini-2.0-flash",
  "gemini-2.0-flash",
  // Live API variants
  "models/gemini-live-2.5-flash-preview",
  "gemini-live-2.5-flash-preview",
];

const versions = ["v1alpha", "v1beta"];

async function testModel(version: string, model: string): Promise<{ success: boolean; reason?: string }> {
  return new Promise((resolve) => {
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${version}.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    const ws = new WebSocket(url);
    let done = false;

    const finish = (success: boolean, reason?: string) => {
      if (done) return;
      done = true;
      try { ws.close(); } catch(e){}
      resolve({ success, reason });
    };

    ws.on("open", () => {
      ws.send(JSON.stringify({
        setup: {
          model,
          generationConfig: { responseModalities: ["AUDIO"] }
        }
      }));
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.setupComplete) finish(true);
        else if (msg.error) finish(false, JSON.stringify(msg.error).substring(0, 120));
      } catch(e) {}
    });

    ws.on("close", (code, reason) => finish(false, `${code}: ${reason.toString().substring(0, 100)}`));
    ws.on("error", (err) => finish(false, err.message));
    setTimeout(() => finish(false, "TIMEOUT"), 7000);
  });
}

async function run() {
  console.log("=== COMPREHENSIVE MODEL SEARCH ===\n");
  const working: string[] = [];

  for (const version of versions) {
    console.log(`\n--- API Version: ${version} ---`);
    for (const model of modelsToTest) {
      process.stdout.write(`  ${model} ... `);
      const res = await testModel(version, model);
      if (res.success) {
        console.log("✅ WORKS!");
        working.push(`${version}/${model}`);
      } else {
        console.log(`❌ ${res.reason}`);
      }
    }
  }

  console.log("\n\n=== WORKING MODELS ===");
  if (working.length === 0) {
    console.log("❌ No working models found!");
  } else {
    working.forEach(m => console.log(`✅ ${m}`));
  }
}

run();
