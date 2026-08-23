import Groq from "groq-sdk";

async function main() {
  console.log("==================================================");
  console.log("       TESTING USER GROQ API KEY LIVE            ");
  console.log("==================================================\n");

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error("GROQ_API_KEY environment variable is not set.");
    process.exit(1);
  }
  const groq = new Groq({ apiKey });

  // Test 1: Chat Completion
  try {
    console.log("Testing Chat Completion on Groq (llama-3.3-70b-versatile)...");
    const chatRes = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: "Hi! Reply 'OK'." }],
      max_tokens: 10,
    });
    console.log("✅ Llama 3.3 70B Response:", chatRes.choices[0]?.message?.content?.trim());
  } catch (err: any) {
    console.error("❌ Llama 3.3 Test Failed:", err.message);
  }

  // Test 2: Whisper Large V3 Turbo with 1 second PCM audio silence
  try {
    console.log("\nTesting Groq Whisper (whisper-large-v3-turbo)...");
    const sampleRate = 16000;
    const numSamples = sampleRate * 1; // 1 second
    const dataSize = numSamples * 2; // 16-bit
    const buffer = Buffer.alloc(44 + dataSize);

    // RIFF header
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write("WAVE", 8);
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16); // Subchunk1Size
    buffer.writeUInt16LE(1, 20);  // AudioFormat (PCM)
    buffer.writeUInt16LE(1, 22);  // NumChannels (Mono)
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
    buffer.writeUInt16LE(2, 32);  // BlockAlign
    buffer.writeUInt16LE(16, 34); // BitsPerSample
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataSize, 40);

    const blob = new Blob([buffer], { type: "audio/wav" });
    const formData = new FormData();
    formData.append("file", blob, "audio.wav");
    formData.append("model", "whisper-large-v3-turbo");
    formData.append("language", "ar");

    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
      },
      body: formData as any,
    });

    if (res.ok) {
      const data = await res.json();
      console.log("✅ Groq Whisper V3 Turbo Response:", JSON.stringify(data));
    } else {
      const errText = await res.text();
      console.error(`❌ Whisper Test Failed (${res.status}):`, errText);
    }
  } catch (err: any) {
    console.error("❌ Whisper Error:", err.message);
  }
}

main().catch(console.error);
