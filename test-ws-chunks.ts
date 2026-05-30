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
    const msg = JSON.parse(data.toString());
    if (msg.setupComplete) {
        console.log("Setup complete! Sending chunks via realtimeInput...");
        
        // Generate pseudo-audio bytes
        const audioBuffer = Buffer.alloc(300 * 1024, 1); // 300KB
        const chunkSize = 128 * 1024; // 128KB chunks
        
        // First send text instruction
        ws.send(JSON.stringify({
          clientContent: {
             turns: [{ role: "user", parts: [{ text: "Transcribe the audio:" }] }],
             turnComplete: false
          }
        }));
        
        for (let i = 0; i < audioBuffer.length; i += chunkSize) {
            const chunkBuffer = audioBuffer.subarray(i, i + chunkSize);
            const base64Chunk = chunkBuffer.toString("base64");
            
            ws.send(JSON.stringify({
              realtimeInput: {
                 mediaChunks: [{ mimeType: "audio/wav", data: base64Chunk }]
              }
            }));
        }
        
        // Finally, send turnComplete
        ws.send(JSON.stringify({
          clientContent: { turnComplete: true }
        }));
    }
    
    if (msg.serverContent) {
        if (msg.serverContent.modelTurn) {
            console.log("Server TEXT:", msg.serverContent.modelTurn.parts[0].text);
        }
        if (msg.serverContent.turnComplete) {
            console.log("Turn Complete.");
            ws.close();
        }
    }
  });

  ws.on("close", (code) => {
    console.log(`Closed: ${code}`);
  });
}

main();
