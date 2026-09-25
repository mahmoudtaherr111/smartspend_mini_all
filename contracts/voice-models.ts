/**
 * The Gemini models the voice call can be set to use, shared by the server (model-mapper, entitlements) and the admin
 * console's voice section. Checked against Google's API on 2026-09-24/25; see docs/decisions/0006-gemini-model-chain.md.
 */

/** Live models for the call itself. The plain one is the default; the other is an option an admin can try per plan. */
export const VOICE_LIVE_MODELS = [
  { id: "gemini-3.8-live", label: "Gemini 3.8 Live (الافتراضي، أسرع وأرخص)" },
  { id: "gemini-3.8-live-extended-thinking", label: "Gemini 3.8 Live Extended Thinking (أبطأ وحوالي ٢.٧ ضعف التكلفة)" },
] as const;

/** Google's text models, strongest first: the chain a busy model falls back along. */
export const GEMINI_TEXT_MODELS = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash (الأقوى، أبطأ)" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite (سريع)" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite (الأرخص)" },
] as const;

export const VOICE_THINKING_LEVELS = ["low", "medium", "high"] as const;
