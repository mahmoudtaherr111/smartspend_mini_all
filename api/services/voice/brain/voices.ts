/**
 * The voices a user can pick. The assistant speaks of itself in the grammatical gender of its voice
 * ("أنا فاهمة" or "أنا فاهم"), so each voice carries one. The default is chosen by listening to Egyptian speech.
 */
export type VoiceGender = "female" | "male";

export const VOICE_CHOICES: Record<string, { gender: VoiceGender; labelAr: string }> = {
  Kore: { gender: "female", labelAr: "صوت ست هادي" },
  Aoede: { gender: "female", labelAr: "صوت ست دافي" },
  Charon: { gender: "male", labelAr: "صوت راجل هادي" },
  Puck: { gender: "male", labelAr: "صوت راجل حيوي" },
};

export const DEFAULT_VOICE = "Kore";

export function resolveVoice(requested: string | undefined | null): string {
  return requested && Object.hasOwn(VOICE_CHOICES, requested) ? requested : DEFAULT_VOICE;
}
