import WebSocket from "ws";
import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || "";

async function fetchModels(): Promise<string[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json() as any;
  if (data.models && Array.isArray(data.models)) {
    return data.models.map((m: any) => m.name);
  }
  return [];
}

async function testModel(modelId: string, apiVersion: string): Promise<boolean> {
  return new Promise((resolve) => {
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    const ws = new WebSocket(url);
    let done = false;

    const finish = (success: boolean) => {
      if (done) return;
      done = true;
      try { ws.close(); } catch(e){}
      resolve(success);
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
          finish(false);
        }
      } catch(e) {}
    });

    ws.on("close", () => {
      finish(false);
    });

    ws.on("error", () => {
      finish(false);
    });

    setTimeout(() => finish(false), 3000);
  });
}

async function main() {
  console.log("Fetching all models...");
  const models = await fetchModels();
  console.log(`Found ${models.length} models to test.`);

  console.log("\nTesting with v1beta...");
  for (const model of models) {
    process.stdout.write(`Testing ${model}... `);
    const ok = await testModel(model, "v1beta");
    if (ok) {
      console.log("✅ WORKS!");
    } else {
      console.log("❌ failed");
    }
  }

  console.log("\nTesting with v1alpha...");
  for (const model of models) {
    process.stdout.write(`Testing ${model}... `);
    const ok = await testModel(model, "v1alpha");
    if (ok) {
      console.log("✅ WORKS!");
    } else {
      console.log("❌ failed");
    }
  }

  console.log("\nDone testing.");
}

main();
