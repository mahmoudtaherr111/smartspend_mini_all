import dotenv from "dotenv";
import WebSocket from "ws";
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || "";

const versions = ["v1alpha", "v1beta"];
const models = [
  "gemini-2.5-flash-native-audio-dlog",
  "models/gemini-2.5-flash-native-audio-dlog",
  "gemini-3-flash-live",
  "models/gemini-3-flash-live",
  "gemini-2.5-flash-native-audio-dialog",
  "models/gemini-2.5-flash-native-audio-dialog",
  "gemini-3-flash-live-preview",
  "models/gemini-3-flash-live-preview"
];

async function testCombination(version: string, model: string): Promise<{ success: boolean; code?: number; reason?: string }> {
  return new Promise((resolve) => {
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${version}.GenerativeService.BidiGenerateContent?key=${apiKey}`;
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
  console.log("=== STARTING TARGETED WEBSOCKET TESTS FOR SPECIAL MODELS ===\n");
  
  for (const version of versions) {
    console.log(`--- Testing with API version: ${version} ---`);
    for (const model of models) {
      process.stdout.write(`Testing model: "${model}" ... `);
      const res = await testCombination(version, model);
      if (res.success) {
        console.log("✅ SUCCESS! Established connection successfully.");
      } else {
        console.log(`❌ FAILED. Close Code: ${res.code}, Reason: "${res.reason}"`);
      }
    }
    console.log("");
  }
  
  console.log("=== TARGETED TESTING COMPLETED ===");
}

run();
