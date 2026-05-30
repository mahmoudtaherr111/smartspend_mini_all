import WebSocket from "ws";

async function main() {
  const apiKey = "YOUR_GEMINI_API_KEY_HERE";
  const modelName = "gemini-2.5-flash-native-audio-latest";
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

  const ws = new WebSocket(url);

  ws.on("open", () => {
    ws.send(
      JSON.stringify({
        setup: {
          model: `models/${modelName}`,
        },
      })
    );
  });

  ws.on("message", (data) => {
    try {
        const msg = JSON.parse(data.toString());
        if (msg.setupComplete) {
            console.log("Setup complete! Sending inlineData audio...");
            
            // tiny valid wav base64
            const validWavBase64 = "UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=";
            
            ws.send(JSON.stringify({
              clientContent: {
                 turns: [
                   { 
                     role: "user", 
                     parts: [
                       { text: "Transcribe the audio:" },
                       { inlineData: { mimeType: "audio/wav", data: validWavBase64 } }
                     ] 
                   }
                 ],
                 turnComplete: true
              }
            }));
        }
        
        if (msg.serverContent) {
            if (msg.serverContent.modelTurn) {
                console.log("Server TEXT:", msg.serverContent.modelTurn.parts[0].text);
            }
            if (msg.serverContent.turnComplete) {
                console.log("Turn Complete. Closing WS.");
                ws.close();
            }
        }
    } catch (e: any) {
        console.log("JSON Parse Error:", e.message);
    }
  });

  ws.on("close", (code) => {
    console.log(`Closed: ${code}`);
  });
}

main();
