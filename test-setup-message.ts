import WebSocket from "ws";
import dotenv from "dotenv";
dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const model = "models/gemini-3-flash-live";

async function testSetup() {
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
  const ws = new WebSocket(url);
  ws.on("open", () => {
    ws.send(JSON.stringify({
      setup: {
        model: model,
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede",
              },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: "You are a helpful assistant." }],
        },
      },
    }));
  });
  ws.on("message", (data) => {
    console.log("Received:", data.toString().substring(0, 200));
  });
  ws.on("close", (code, reason) => {
    console.log(`Closed: ${code} ${reason.toString()}`);
  });
}
testSetup();
