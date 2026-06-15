import dotenv from "dotenv";
import { db } from "./api/queries/connection";
import { systemSettings } from "./db/schema";

dotenv.config();

async function main() {
  const settingsToUpdate = [
    { key: "ai_api_key", value: process.env.GEMINI_API_KEY || "" },
    { key: "voice_call_model", value: "gemini-2.5-flash" },
    { key: "voice_call_enabled_free", value: "true" },
    { key: "voice_call_limit_free", value: "5" },
    { key: "voice_call_duration_free", value: "120" },
    { key: "voice_call_enabled_pro", value: "true" },
    { key: "voice_call_limit_pro", value: "60" },
    { key: "voice_call_duration_pro", value: "600" },
    { key: "ai_model_free", value: "gemini-2.5-flash" },
    { key: "ai_model_pro", value: "gemini-2.5-flash" },
    { key: "ai_model_ultra", value: "gemini-2.5-pro" },
    { key: "ai_model_reports", value: "gemini-2.5-flash" },

    // Add default token limits if not exist
    { key: "free_token_limit", value: "50000" },
    { key: "pro_token_limit", value: "500000" },
    { key: "ultra_token_limit", value: "2000000" },

    // Feature toggles
    { key: "free_ai_parse", value: "true" },
    { key: "pro_ai_parse", value: "true" },
    { key: "ultra_ai_parse", value: "true" },
  ];

  for (const setting of settingsToUpdate) {
    await db
      .insert(systemSettings)
      .values(setting)
      .onDuplicateKeyUpdate({ set: { value: setting.value } });
  }

  console.log("✅ API Key and Models updated successfully in the database!");
  process.exit(0);
}

main().catch(console.error);
