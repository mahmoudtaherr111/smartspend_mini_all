import dotenv from "dotenv";
import WebSocket from "ws";
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || "";

const modelsToTest = [
  "gemini-2.0-flash-exp",
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-3.0-flash",
  "gemini-3.1-flash",
];

async function testModel(modelName) {
  return new Promise((resolve) => {
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    const ws = new WebSocket(url);
    let resolved = false;

    ws.on("open", () => {
      ws.send(JSON.stringify({
        setup: {
          model: `models/${modelName}`,
          generationConfig: { responseModalities: ["AUDIO"] },
        }
      }));
    });

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.setupComplete) {
        if (!resolved) {
          resolved = true;
          console.log(`[SUCCESS] ${modelName} works with v1beta!`);
          ws.close();
          resolve(true);
        }
      }
    });

    ws.on("close", (code, reason) => {
      if (!resolved) {
        resolved = true;
        console.log(`[FAILED] ${modelName} v1beta: ${code} - ${reason.toString()}`);
        resolve(false);
      }
    });

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log(`[TIMEOUT] ${modelName} v1beta`);
        ws.close();
        resolve(false);
      }
    }, 3000);
  });
}

async function run() {
  for (const m of modelsToTest) {
    await testModel(m);
  }
}

run();
