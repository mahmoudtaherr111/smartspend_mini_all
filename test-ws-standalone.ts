import WebSocket from "ws";

async function main() {
  const apiKey = "YOUR_GEMINI_API_KEY_HERE";
  const modelName = "gemini-2.5-flash-native-audio-latest"; // using the EXACT name
  const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;

  console.log("Connecting to:", url);
  const ws = new WebSocket(url);

  ws.on("open", () => {
    console.log("Opened! Sending setup...");
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
            console.log("Setup complete! Sending audio message...");
            ws.send(
                JSON.stringify({
                    clientContent: {
                        turns: [
                            {
                                role: "user",
                                parts: [
                                    { text: "Say the word SUCCESS." }
                                ],
                            },
                        ],
                        turnComplete: true,
                    },
                })
            );
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
