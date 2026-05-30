async function main() {
  const apiKey = "YOUR_GEMINI_API_KEY_HERE";
  const model = "models/gemini-2.5-flash-native-audio";
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.BidiService/BidiGenerateContent?key=${apiKey}`;

  console.log("Connecting to WebSocket...");
  const ws = new WebSocket(url);

  ws.onopen = () => {
    console.log("Connected. Sending setup...");
    ws.send(JSON.stringify({
      setup: {
        model: model,
        generationConfig: {
          responseModalities: ["TEXT"]
        }
      }
    }));
  };

  ws.onmessage = (event) => {
    console.log("Received message:", event.data);
    try {
      const data = JSON.parse(event.data);
      
      // Wait for setup complete
      if (data.setupComplete) {
        console.log("Setup complete. Sending content...");
        ws.send(JSON.stringify({
          clientContent: {
            turns: [
              {
                role: "user",
                parts: [
                  { text: "Reply with the word 'SUCCESS' if you hear me." }
                ]
              }
            ],
            turnComplete: true
          }
        }));
      }

      if (data.serverContent?.modelTurn) {
        const parts = data.serverContent.modelTurn.parts;
        for (const part of parts) {
          if (part.text) {
            console.log("TEXT RESPONSE:", part.text);
          }
        }
      }

      if (data.serverContent?.turnComplete) {
        console.log("Turn complete. Closing...");
        ws.close();
      }
    } catch (e: any) {
      console.error("Error parsing message:", e);
    }
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
  };

  ws.onclose = () => {
    console.log("WebSocket closed.");
  };
}

main().catch(console.error);
