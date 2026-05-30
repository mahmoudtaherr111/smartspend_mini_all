import WebSocket from "ws";

function createSilentWavBase64(durationSeconds: number, sampleRate = 16000) {
  const numSamples = durationSeconds * sampleRate;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = numSamples * numChannels * (bitsPerSample / 8);
  const chunkSize = 36 + dataSize;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(chunkSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); 
  buffer.writeUInt16LE(1, 20); 
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer; // return buffer instead of base64
}

async function main() {
  const apiKey = "YOUR_GEMINI_API_KEY_HERE";
  const modelName = "gemini-2.5-flash-native-audio-latest";
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

  const audioBuffer = createSilentWavBase64(10);
  console.log("Generated WAV size in bytes:", audioBuffer.length);

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
            console.log("Setup complete! Sending realtimeInput audio chunks...");
            
            // First send text instruction
            ws.send(JSON.stringify({
              clientContent: {
                 turns: [
                   { 
                     role: "user", 
                     parts: [
                       { text: "Transcribe the audio:" }
                     ] 
                   }
                 ],
                 turnComplete: false
              }
            }));
            
            // Send audio in chunks
            const chunkSize = 128 * 1024;
            for (let i = 0; i < audioBuffer.length; i += chunkSize) {
                const chunk = audioBuffer.subarray(i, i + chunkSize).toString("base64");
                ws.send(JSON.stringify({
                  realtimeInput: {
                     mediaChunks: [{ mimeType: "audio/wav", data: chunk }]
                  }
                }));
            }
            
            // Send turn complete
            ws.send(JSON.stringify({
              clientContent: { turnComplete: true }
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

  ws.on("close", (code, reason) => {
    console.log(`Closed: ${code} - ${reason.toString()}`);
  });
}

main();
