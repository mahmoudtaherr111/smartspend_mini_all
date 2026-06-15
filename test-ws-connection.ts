import dotenv from "dotenv";
import WebSocket from "ws";
dotenv.config();

async function testModel(modelName: string, apiVersion: "v1alpha" | "v1beta"): Promise<boolean> {
  const apiKey = process.env.GEMINI_API_KEY || "";
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${apiVersion}.GenerativeService.BidiGenerateContent?key=${apiKey}`;

  console.log(`Connecting with: ${modelName} on ${apiVersion}...`);
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    let success = false;

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          setup: {
            model: `models/${modelName}`,
            generationConfig: {
              responseModalities: ["audio"],
            }
          },
        })
      );
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.setupComplete) {
          console.log(`✅ SUCCESS: ${modelName} on ${apiVersion} setup completed!`);
          success = true;
          ws.close();
        }
      } catch {}
    });

    ws.on("close", (code, reason) => {
      if (!success) {
        console.log(`❌ FAILED: ${modelName} on ${apiVersion} closed with ${code} - ${reason.toString()}`);
      }
      resolve(success);
    });

    ws.on("error", () => {
      resolve(false);
    });
  });
}

async function main() {
  const modelsToTest = [
    "gemini-2.0-flash-exp",
    "gemini-2.0-flash",
    "gemini-2.0-realtime-preview"
  ];

  const versions: ("v1alpha" | "v1beta")[] = ["v1alpha", "v1beta"];

  for (const version of versions) {
    for (const model of modelsToTest) {
      const ok = await testModel(model, version);
      if (ok) {
        console.log(`🎉 Model is compatible: ${model} on ${version}`);
      }
      console.log("-----------------------------------------");
    }
  }
}

main();
