/**
 * Comprehensive voice call diagnostic test
 * Tests the EXACT same flow as the backend service
 */
import WebSocket from "ws";
import dotenv from "dotenv";
import * as fs from "fs";
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY!;

const MODELS_TO_TEST = [
  "models/gemini-2.0-flash-exp",
  "models/gemini-2.0-flash",
  "models/gemini-2.5-flash",
  "models/gemini-3.5-flash",
  "models/gemini-3.1-flash-lite",
  "models/gemini-2.5-pro",
];

async function testModel(modelId: string): Promise<{ success: boolean; modelId: string; error?: string }> {
  return new Promise((resolve) => {
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    const ws = new WebSocket(url);
    let done = false;

    const finish = (success: boolean, error?: string) => {
      if (done) return;
      done = true;
      try { ws.close(); } catch(e){}
      resolve({ success, modelId, error });
    };

    ws.on("open", () => {
      ws.send(JSON.stringify({
        setup: {
          model: modelId,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Aoede" }
              }
            }
          },
          systemInstruction: {
            parts: [{ text: "You are a helpful assistant." }]
          }
        }
      }));
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.setupComplete) {
          console.log(`✅ SUCCESS: ${modelId}`);
          finish(true);
        } else if (msg.error) {
          console.log(`❌ ERROR (msg): ${modelId} - ${JSON.stringify(msg.error)}`);
          finish(false, JSON.stringify(msg.error));
        } else {
          console.log(`   ${modelId} got msg: ${JSON.stringify(msg).substring(0, 100)}`);
        }
      } catch(e) {}
    });

    ws.on("close", (code, reason) => {
      if (!done) {
        console.log(`❌ CLOSED: ${modelId} - ${code} ${reason.toString().substring(0, 100)}`);
        finish(false, `${code}: ${reason.toString()}`);
      }
    });

    ws.on("error", (err) => {
      console.log(`❌ WS ERROR: ${modelId} - ${err.message}`);
      finish(false, err.message);
    });

    setTimeout(() => finish(false, "Timeout"), 8000);
  });
}

async function main() {
  console.log("\n=== SMARTSPEND VOICE CALL DIAGNOSTIC ===\n");
  console.log(`API Key: ${apiKey ? apiKey.substring(0, 8) + "..." : "MISSING"}\n`);
  
  const results: Array<{success: boolean; modelId: string; error?: string}> = [];

  for (const model of MODELS_TO_TEST) {
    console.log(`\nTesting: ${model}`);
    const result = await testModel(model);
    results.push(result);
    await new Promise(r => setTimeout(r, 500));
  }

  console.log("\n\n=== SUMMARY ===");
  for (const r of results) {
    const icon = r.success ? "✅" : "❌";
    console.log(`${icon} ${r.modelId}`);
    if (!r.success) console.log(`   → ${r.error}`);
  }

  const working = results.filter(r => r.success);
  if (working.length > 0) {
    console.log(`\n🎉 Working models found: ${working.map(r => r.modelId).join(", ")}`);
  } else {
    console.log("\n⚠️  No models worked with this API key.");
    console.log("The API key may not have access to the Live API (BidiGenerateContent).");
    console.log("Please check: https://aistudio.google.com/ and verify the key has Live API access.");
  }
}

main();
