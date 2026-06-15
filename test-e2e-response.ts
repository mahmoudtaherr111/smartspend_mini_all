import dotenv from "dotenv";
import WebSocket from "ws";
dotenv.config();

// ✅ Confirmed working: models/gemini-2.5-flash-native-audio-preview-12-2025 and models/gemini-3.1-flash-live-preview
const apiKey = process.env.GEMINI_API_KEY || "";

async function testModelWithText(modelId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    const ws = new WebSocket(url);
    let phase = "connecting";
    const receivedMessages: string[] = [];

    console.log(`\n========== TESTING: ${modelId} ==========`);

    ws.on("open", () => {
      phase = "setup";
      console.log("[1] WebSocket OPEN. Sending setup...");
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
            parts: [{ text: "أنت مساعد مالي مصري ودود. رد بإيجاز." }]
          }
        }
      }));
    });

    ws.on("message", (raw) => {
      const text = raw.toString();
      let msg: any;
      try {
        msg = JSON.parse(text);
      } catch(e) {
        console.log(`[MSG] Non-JSON message received (${text.length} bytes):`, text.substring(0, 200));
        return;
      }

      if (msg.setupComplete) {
        phase = "active";
        console.log("[2] ✅ setupComplete received! Sending text message...");
        // Send a text message to trigger a response
        ws.send(JSON.stringify({
          clientContent: {
            turns: [{
              role: "user",
              parts: [{ text: "إزيك؟ قولي على المصروفات بشكل مختصر جداً." }]
            }],
            turnComplete: true
          }
        }));
        console.log("[3] Text message sent. Waiting for response...");
        return;
      }

      if (msg.error) {
        console.error("[ERROR] Gemini returned error:", JSON.stringify(msg.error));
        return;
      }

      if (msg.serverContent) {
        const turn = msg.serverContent.modelTurn;
        const interrupted = msg.serverContent.interrupted;
        const generationComplete = msg.serverContent.generationComplete;
        const turnComplete = msg.serverContent.turnComplete;

        if (interrupted) console.log("[GEMINI] ⚡ Interrupted");
        if (turnComplete) console.log("[GEMINI] ✅ Turn complete");
        if (generationComplete) console.log("[GEMINI] ✅ Generation complete");

        if (turn && turn.parts) {
          for (const part of turn.parts) {
            if (part.text) {
              console.log("[GEMINI TEXT]:", part.text);
              receivedMessages.push(part.text);
            }
            if (part.inlineData) {
              const audioBytes = Buffer.from(part.inlineData.data, "base64").length;
              console.log(`[GEMINI AUDIO]: ${audioBytes} bytes of audio (${part.inlineData.mimeType})`);
              receivedMessages.push(`[AUDIO:${audioBytes}bytes]`);
            }
          }
        }
      }

      // Log anything else
      const keys = Object.keys(msg).filter(k => !["setupComplete", "serverContent", "error"].includes(k));
      if (keys.length > 0) {
        console.log("[OTHER MSG KEYS]:", keys.join(", "), JSON.stringify(msg).substring(0, 300));
      }
    });

    ws.on("close", (code, reason) => {
      console.log(`[CLOSED] Code: ${code}, Reason: ${reason.toString()}`);
      console.log(`\n=== SUMMARY for ${modelId} ===`);
      console.log(`Phase when closed: ${phase}`);
      console.log(`Messages received: ${receivedMessages.length}`);
      receivedMessages.forEach((m, i) => console.log(`  [${i+1}] ${m}`));
      if (receivedMessages.length === 0) {
        console.log("❌ NO RESPONSE from AI - model is silent!");
      } else {
        console.log("✅ AI RESPONDED SUCCESSFULLY");
      }
      resolve();
    });

    ws.on("error", (err) => {
      console.error("[WS ERROR]:", err.message);
      reject(err);
    });

    // Auto-close after 15 seconds
    setTimeout(() => {
      console.log("[TIMEOUT] Closing after 15 seconds...");
      ws.close();
    }, 15000);
  });
}

async function run() {
  console.log("=== FULL END-TO-END RESPONSE TEST ===\n");
  
  await testModelWithText("models/gemini-2.5-flash-native-audio-preview-12-2025");
  await testModelWithText("models/gemini-3.1-flash-live-preview");
  
  console.log("\n=== DONE ===");
}

run().catch(console.error);
