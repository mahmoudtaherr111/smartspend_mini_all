import dotenv from "dotenv";
import WebSocket from "ws";
dotenv.config();

const keys = [
  process.env.GEMINI_API_KEY || "",
  process.env.OTHER_GEMINI_API_KEY || ""
].filter(Boolean);

const models = [
  "models/gemini-2.5-flash-native-audio-preview-12-2025",
  "models/gemini-3.1-flash-live-preview"
];

const versions = ["v1alpha", "v1beta"];

async function testCombination(key: string, version: string, model: string): Promise<{ success: boolean; code?: number; reason?: string }> {
  return new Promise((resolve) => {
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${version}.GenerativeService.BidiGenerateContent?key=${key}`;
    const ws = new WebSocket(url);
    let done = false;

    const finish = (success: boolean, code?: number, reason?: string) => {
      if (done) return;
      done = true;
      try { ws.close(); } catch(e){}
      resolve({ success, code, reason });
    };

    ws.on("open", () => {
      ws.send(JSON.stringify({
        setup: {
          model: model,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Aoede" }
              }
            }
          }
        }
      }));
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.setupComplete) {
          finish(true);
        } else if (msg.error) {
          finish(false, 0, JSON.stringify(msg.error));
        }
      } catch(e) {}
    });

    ws.on("close", (code, reason) => {
      finish(false, code, reason.toString());
    });

    ws.on("error", (err) => {
      finish(false, -1, err.message);
    });

    setTimeout(() => finish(false, -2, "Timeout"), 6000);
  });
}

async function run() {
  console.log("=== STARTING USER SPECIFIC LIVE MODEL TESTS ===\n");
  for (let kIdx = 0; kIdx < keys.length; kIdx++) {
    const key = keys[kIdx];
    const keyLabel = kIdx === 0 ? "User's Key" : "DB/Env Key";
    console.log(`\n--- Using Key: ${keyLabel} (${key.substring(0, 10)}...) ---`);
    for (const version of versions) {
      for (const model of models) {
        console.log(`Testing model "${model}" with ${version}...`);
        const res = await testCombination(key, version, model);
        if (res.success) {
          console.log(`  ✅ SUCCESS!`);
        } else {
          console.log(`  ❌ FAILED. Code: ${res.code}, Reason: ${res.reason}`);
        }
      }
    }
  }
}

run();
