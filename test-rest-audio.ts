import dotenv from "dotenv";
dotenv.config();

async function testModelRest(modelName: string) {
  const apiKey = process.env.GEMINI_API_KEY || "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  console.log(`\nTesting REST generateContent for: ${modelName}`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: "صباح الخير، قل كلمة واحدة: نجاح" }],
          },
        ],
        generationConfig: {
          responseModalities: ["audio"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: "Aoede",
              },
            },
          },
        },
      }),
    });

    console.log("Status:", res.status, res.statusText);
    const data = await res.json() as any;

    if (data.candidates && data.candidates[0]?.content?.parts) {
      const parts = data.candidates[0].content.parts;
      console.log(`✅ SUCCESS for ${modelName}! Parts count:`, parts.length);
      parts.forEach((p: any, idx: number) => {
        if (p.text) console.log(`Part ${idx} TEXT:`, p.text);
        if (p.inlineData) console.log(`Part ${idx} AUDIO: ${p.inlineData.mimeType}, data length = ${p.inlineData.data.length}`);
      });
    } else {
      console.log("No content parts. Candidate:", JSON.stringify(data.candidates, null, 2));
    }
  } catch (err: any) {
    console.error("Failed:", err.message);
  }
}

async function main() {
  const models = [
    "gemini-2.5-flash-preview-tts",
    "gemini-3.1-flash-tts-preview",
    "gemini-2.5-flash",
    "gemini-3.5-flash"
  ];
  for (const m of models) {
    await testModelRest(m);
    console.log("-----------------------------------------");
  }
}

main();
