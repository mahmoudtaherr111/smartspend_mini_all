import { object } from "./protocol";
import { mapModelName } from "../../api/lib/model-mapper";

/** Generate artificial evaluation speech in memory. No microphone, user audio, or disk audio. */
export async function synthesizeLabSpeech(apiKey: string, model: string, text: string, voice = "Kore") {
  if (!/^[a-z0-9.-]+$/.test(model)) throw new Error("invalid_tts_model");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${mapModelName(model)}:generateContent`, {
    method: "POST", headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({
      contents: [{ parts: [{ text: `انطق الجملة الآتية بالمصري الطبيعي من غير إضافة أي كلمة: ${text}` }] }],
      generationConfig: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
    }),
  });
  if (!response.ok) throw new Error(`tts_http_${response.status}`);
  const body = object(await response.json());
  const candidates = body.candidates;
  const parts = object(Array.isArray(candidates) ? object(candidates[0]).content : null).parts;
  const chunks: Buffer[] = [];
  let sampleRate = 0;
  if (Array.isArray(parts)) for (const part of parts) {
    const data = object(object(part).inlineData);
    if (typeof data.data !== "string" || typeof data.mimeType !== "string") continue;
    const mime = data.mimeType.toLowerCase();
    if (!mime.startsWith("audio/l16") && !mime.startsWith("audio/pcm")) throw new Error("tts_unsupported_audio");
    const rate = Number(mime.match(/rate\s*=\s*(\d+)/)?.[1] ?? 24_000);
    if (Number(mime.match(/channels\s*=\s*(\d+)/)?.[1] ?? 1) !== 1) throw new Error("tts_must_be_mono");
    if (![16000, 24000].includes(rate) || (sampleRate && sampleRate !== rate)) throw new Error("tts_unsupported_rate");
    sampleRate = rate;
    chunks.push(Buffer.from(data.data, "base64"));
  }
  const pcm = Buffer.concat(chunks);
  if (!pcm.length || pcm.length % 2 || pcm.length > sampleRate * 2 * 30) throw new Error("tts_audio_missing_or_too_long");
  return { pcm, sampleRate };
}
