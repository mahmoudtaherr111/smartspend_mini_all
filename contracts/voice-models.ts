/**
 * The Gemini models the voice call can be set to use, shared by the server (model-mapper, entitlements) and the admin
 * console's voice section. Checked against Google's API on 2026-09-24/25; see docs/decisions/0006-gemini-model-chain.md.
 */

/**
 * Live models for the call itself. The plain one is the default; the extended-thinking one reasons in the background
 * and is the coach call's model. Both have the same per-token prices; what a call costs is measured from its tokens
 * (thinking included), never a fixed factor from an earlier test.
 */
export const VOICE_LIVE_MODELS = [
  { id: "gemini-3.8-live", label: "Gemini 3.8 Live (الافتراضي)" },
  { id: "gemini-3.8-live-extended-thinking", label: "Gemini 3.8 Live Extended Thinking (بيفكر في الخلفية)" },
] as const;

/** Google's text models, strongest first: the chain a busy model falls back along. */
export const GEMINI_TEXT_MODELS = [
  { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash (الأقوى، أبطأ)" },
  { id: "gemini-3.5-flash-lite", label: "Gemini 3.5 Flash Lite (سريع)" },
  { id: "gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite (الأرخص)" },
] as const;

export const VOICE_THINKING_LEVELS = ["low", "medium", "high"] as const;
