import WebSocket from "ws";
import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;

const models = [
  "models/gemini-2.5-flash-native-audio-dlog",
  "models/gemini-3-flash-live"
];

async function testWS(model: string, name: string, version: string) {
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${version}.GenerativeService.BidiGenerateContent?key=${apiKey}`;
  console.log(`\nTesting ${name}: ${model} on ${version}`);
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    ws.on("open", () => {
      ws.send(JSON.stringify({
        setup: { model: model }
      }));
    });
    ws.on("message", (data) => {
      console.log(`[${name}] Received:`, data.toString().substring(0, 100));
      const msg = JSON.parse(data.toString());
      if (msg.setupComplete) {
        console.log(`[${name}] SETUP COMPLETE! SUCCESS for ${model}`);
        ws.close();
        resolve(true);
      } else if (msg.error) {
        console.log(`[${name}] ERROR:`, msg.error);
        ws.close();
        resolve(false);
      }
    });
    ws.on("error", (err) => {
      console.log(`[${name}] WS Error:`, err.message);
      resolve(false);
    });
    ws.on("close", (code, reason) => {
      console.log(`[${name}] Closed: ${code} ${reason.toString()}`);
      resolve(false);
    });
  });
}

async function main() {
  for (const m of models) {
    await testWS(m, m, "v1alpha");
    await testWS(m, m, "v1beta");
  }
}

main();
