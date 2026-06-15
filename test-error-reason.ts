import dotenv from "dotenv";
import WebSocket from "ws";
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || "";
const modelId = "models/gemini-2.0-flash";

const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
const ws = new WebSocket(url);

ws.on("open", () => {
  console.log("WebSocket opened successfully.");
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
  console.log("Message received:", data.toString());
});

ws.on("close", (code, reason) => {
  console.log(`WebSocket closed. Code: ${code}, Reason: ${reason.toString()}`);
});

ws.on("error", (err) => {
  console.error("WebSocket error:", err.message);
});
