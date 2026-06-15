import dotenv from "dotenv";
import WebSocket from "ws";
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || "";
const modelId = "models/gemini-2.0-flash";
const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

const ws = new WebSocket(url);

ws.on("open", () => {
  console.log("Connected to Gemini Live API");
  const setupMessage = {
    setup: {
      model: modelId,
      generationConfig: {
        responseModalities: ["AUDIO"],
      },
    },
  };
  ws.send(JSON.stringify(setupMessage));
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  console.log("Received:", JSON.stringify(msg, null, 2));
  if (msg.setupComplete) {
    console.log("Setup complete! Exiting.");
    process.exit(0);
  }
});

ws.on("error", (err) => {
  console.error("Error:", err);
});

ws.on("close", (code, reason) => {
  console.log(`Closed: ${code} - ${reason.toString()}`);
  process.exit(1);
});

setTimeout(() => {
  console.log("Timeout!");
  process.exit(1);
}, 5000);
