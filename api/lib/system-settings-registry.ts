/**
 * One declaration per setting: its key, its default, and whether it is a secret.
 *
 * This replaces three hand-maintained lists that had to agree and did not:
 *
 *   - the defaults literal inside `getSettings`,
 *   - the `allowedKeys` set inside `updateSettings`,
 *   - the fields the admin components actually render.
 *
 * Eight keys the UI offers — `nvidia_api_key`, `chatbot_api_key`, `chatbot_base_url`,
 * `chatbot_model`, `chatbot_max_history`, `rag_api_key`, `rag_model`, `enable_rag` —
 * were in the third list and neither of the first two. An admin typed a key, clicked
 * save, and got a success toast; the value was dropped with a `console.warn` nobody
 * reads, and NVIDIA classification silently kept using the environment variable. That
 * is not a missing entry to add, it is a design that guarantees the next one.
 *
 * Deriving both server behaviours from this file makes the drift impossible rather than
 * fixed: a key that is not declared cannot be saved, and a key that is declared is
 * always saveable.
 */
import { env } from "./env";

export interface SettingDef {
  key: string;
  /** Evaluated lazily so environment-derived defaults are read at call time. */
  default: string | (() => string);
  /**
   * Never leaves the server in cleartext. `getSettings` sends a mask, and a mask sent
   * back is ignored rather than written — otherwise saving an untouched form would
   * overwrite every key with dots.
   */
  secret?: boolean;
}

const FREE_ROUTING_DEFAULT = JSON.stringify([
  { from: 0, to: 20000, provider: "groq", key_slot: "groq", model: "llama-3.1-8b-instant" },
  { from: 20000, to: 50000, provider: "gemini", key_slot: "key1", model: "gemini-2.0-flash" },
  {
    from: 50000,
    to: null,
    action: "block",
    message:
      "استهلكت رصيدك الشهري من الذكاء الاصطناعي 🔒\nيتجدد تلقائياً في بداية الشهر الجاي، أو رقّي لباقة Pro للحصول على حد أعلى!",
  },
]);

const PRO_ROUTING_DEFAULT = JSON.stringify([
  { from: 0, to: 150000, provider: "groq", key_slot: "groq", model: "llama-3.3-70b-versatile" },
  { from: 150000, to: 500000, provider: "gemini", key_slot: "key1", model: "gemini-1.5-pro" },
  {
    from: 500000,
    to: null,
    action: "block",
    message: "وصلت لحد باقة Pro الشهري 🔒\nيتجدد تلقائياً في بداية الشهر الجاي.",
  },
]);

const AI_SYSTEM_PROMPT_DEFAULT =
  "[Persona] مستشار مالي مصري ذكي ومتعاطف. لغتك عامية مصرية راقية ومبسطة، وتتحدث وكأنك إنسان حقيقي.\n[Rules]\n1. لا تستخدم العناوين الآلية (مثل التطبيع أو السببية).\n2. واجه المستخدم بالأرقام الحقيقية.\n3. قدم نصائح عملية مصممة خصيصاً للمستخدم بناءً على سلوكه المالي.";

export const SETTINGS: SettingDef[] = [
  // ── Provider API keys ──
  { key: "ai_api_key", default: () => env.GEMINI_API_KEY || "", secret: true },
  { key: "ai_api_key_2", default: "", secret: true },
  { key: "groq_api_key", default: "", secret: true },
  { key: "fireworks_api_key", default: () => env.FIREWORKS_API_KEY || "", secret: true },
  // Previously renderable and unsaveable: the field existed, the write was discarded.
  { key: "nvidia_api_key", default: "", secret: true },

  // ── AI voice call ──
  { key: "voice_call_model", default: "gemini-2.5-flash" },
  { key: "voice_call_enabled_free", default: "true" },
  { key: "voice_call_limit_free", default: "2" },
  { key: "voice_call_duration_free", default: "60" },
  { key: "voice_call_enabled_pro", default: "true" },
  { key: "voice_call_limit_pro", default: "30" },
  { key: "voice_call_duration_pro", default: "300" },
  { key: "voice_call_enabled_ultra", default: "true" },
  { key: "voice_call_limit_ultra", default: "999999" },
  { key: "voice_call_duration_ultra", default: "1200" },

  // ── Legacy model selectors (reports + ultra fallback) ──
  { key: "ai_model_free", default: () => env.GEMINI_MODEL_FREE || "gemini-2.0-flash" },
  { key: "ai_model_pro", default: () => env.GEMINI_MODEL_PRO || "gemini-1.5-flash" },
  { key: "ai_model_ultra", default: "gemini-1.5-pro" },
  { key: "ai_model_reports", default: () => env.GEMINI_MODEL_REPORTS || "gemini-1.5-flash" },

  // ── Dynamic token routing ──
  { key: "free_routing_ranges", default: FREE_ROUTING_DEFAULT },
  { key: "pro_routing_ranges", default: PRO_ROUTING_DEFAULT },

  // ── Token limits ──
  { key: "free_token_limit", default: "50000" },
  { key: "pro_token_limit", default: "500000" },
  { key: "ultra_token_limit", default: "2000000" },
  { key: "free_daily_limit", default: "10" },
  { key: "pro_daily_limit", default: "100" },
  { key: "ultra_daily_limit", default: "500" },
  { key: "free_max_per_request", default: "256" },
  { key: "pro_max_per_request", default: "512" },
  { key: "ultra_max_per_request", default: "1024" },

  // ── Feature toggles ──
  { key: "free_ai_analysis", default: "false" },
  { key: "pro_ai_analysis", default: "true" },
  { key: "ultra_ai_analysis", default: "true" },
  { key: "free_ai_parse", default: "true" },
  { key: "pro_ai_parse", default: "true" },
  { key: "ultra_ai_parse", default: "true" },

  // ── Voice / STT ──
  { key: "voice_limit_free", default: "300" },
  { key: "voice_limit_pro", default: "1800" },
  { key: "voice_limit_ultra", default: "0" },
  { key: "voice_per_req_free", default: "60" },
  { key: "voice_per_req_pro", default: "180" },
  { key: "voice_per_req_ultra", default: "300" },
  { key: "free_stt_provider", default: "gemini" },
  { key: "free_stt_model", default: "gemini-3.5-flash" },
  { key: "free_stt_key_slot", default: "key1" },
  { key: "pro_stt_provider", default: "gemini" },
  { key: "pro_stt_model", default: "gemini-2.5-flash" },
  { key: "pro_stt_key_slot", default: "key1" },
  { key: "stt_api_key", default: "", secret: true },
  { key: "stt_api_key_2", default: "", secret: true },
  { key: "stt_model", default: "gemini-1.5-flash" },
  { key: "stt_fallback_model", default: "gemini-2.0-flash" },
  { key: "stt_processing_mode", default: "standard" },

  // ── Reports ──
  { key: "report_provider_free", default: "gemini" },
  { key: "report_model_free", default: "gemini-1.5-flash" },
  { key: "report_key_slot_free", default: "key1" },
  { key: "report_provider_pro", default: "gemini" },
  { key: "report_model_pro", default: "gemini-1.5-pro" },
  { key: "report_key_slot_pro", default: "key1" },
  { key: "report_limit_free", default: "30" },
  { key: "report_limit_pro", default: "14" },
  { key: "report_limit_ultra", default: "1" },
  { key: "report_words_free", default: "550" },
  { key: "report_words_pro", default: "850" },
  { key: "report_words_ultra", default: "1500" },
  { key: "report_max_tokens_free", default: "1800" },
  { key: "report_max_tokens_pro", default: "3500" },
  { key: "report_max_tokens_ultra", default: "8192" },
  { key: "report_subcats_free", default: "15" },
  { key: "report_subcats_pro", default: "20" },
  { key: "report_subcats_ultra", default: "20" },
  { key: "report_top_items_pro", default: "10" },
  { key: "report_top_items_ultra", default: "10" },

  // ── Classification decision thresholds ──
  { key: "confidence_auto_save", default: "85" },
  { key: "confidence_review", default: "60" },
  { key: "parser_fast_decomposition_enabled", default: "true" },
  { key: "parser_person_memory_enabled", default: "true" },
  { key: "parser_local_verifier_enabled", default: "true" },
  { key: "parser_auto_save_threshold", default: "90" },
  { key: "parser_review_threshold", default: "50" },
  { key: "parser_escalate_threshold", default: "85" },

  // ── Prompt settings ──
  { key: "ai_response_length", default: "medium" },
  { key: "ai_focus", default: "balanced" },
  { key: "ai_system_prompt", default: AI_SYSTEM_PROMPT_DEFAULT },
  { key: "ai_advanced_instructions", default: "" },
  { key: "ai_report_structure_override", default: "" },

  // ── Chatbot (renderable and unsaveable before this file) ──
  { key: "chatbot_api_key", default: "", secret: true },
  { key: "chatbot_base_url", default: "" },
  { key: "chatbot_model", default: "" },
  { key: "chatbot_max_history", default: "10" },

  // ── RAG (renderable and unsaveable before this file) ──
  { key: "enable_rag", default: "true" },
  { key: "rag_api_key", default: "", secret: true },
  { key: "rag_model", default: "" },

  // ── Misc ──
  { key: "sms_limit_free", default: "5" },
  { key: "sms_limit_pro", default: "999999" },
  { key: "sms_limit_ultra", default: "999999" },
  { key: "promo_code_discount", default: "20" },
  { key: "offline_limit_free", default: "3" },
  { key: "offline_limit_pro", default: "30" },
  { key: "pipeline_version", default: "v1" },
  { key: "whatsapp_otp_enabled", default: "true" },
];

export const SETTING_KEYS: ReadonlySet<string> = new Set(SETTINGS.map((s) => s.key));
export const SECRET_KEYS: ReadonlySet<string> = new Set(
  SETTINGS.filter((s) => s.secret).map((s) => s.key),
);

export function settingDefaults(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const def of SETTINGS) {
    out[def.key] = typeof def.default === "function" ? def.default() : def.default;
  }
  return out;
}

/** The dots the client sees in place of a secret. */
const MASK = "••••••••";

/**
 * Enough for an admin to confirm WHICH key is installed without the value leaving the
 * server. `getSettings` used to return every API key in cleartext to the browser, so
 * anyone who could open the admin page — or read its response from a proxy, a log, or a
 * cached devtools session — had the production Gemini key.
 */
export function maskSecretValue(value: string): string {
  if (!value) return "";
  return value.length <= 4 ? MASK : `${MASK}${value.slice(-4)}`;
}

/**
 * True when the client echoed back what we sent it.
 *
 * Without this, an admin who edits one unrelated field and saves would write the mask
 * over every API key on the system — turning a display fix into an outage.
 */
export function isMaskedValue(value: string): boolean {
  return typeof value === "string" && value.startsWith(MASK);
}

/** Applies the mask to a full settings map, leaving non-secrets untouched. */
export function maskSettingsForClient(config: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(config)) {
    out[key] = SECRET_KEYS.has(key) ? maskSecretValue(value) : value;
  }
  return out;
}
