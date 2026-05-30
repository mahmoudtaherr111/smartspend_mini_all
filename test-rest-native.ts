import { GoogleGenerativeAI } from "@google/generative-ai";

async function main() {
  const apiKey = "YOUR_GEMINI_API_KEY_HERE";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-native-audio-latest" });

  const audioBase64 = Buffer.alloc(100 * 1024, 0).toString("base64"); // 100KB dummy

  try {
    const result = await model.generateContent([
      { text: "Transcribe this audio strictly as text." },
      {
        inlineData: {
          mimeType: "audio/mp3",
          data: audioBase64,
        },
      },
    ]);
    console.log("REST SUCCESS:", result.response.text());
  } catch (e: any) {
    console.log("REST ERROR:", e.message);
  }
}

main();
