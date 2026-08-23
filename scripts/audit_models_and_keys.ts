import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import mysql from "mysql2/promise";
import { MODEL_CATALOG, DEPRECATED_MODEL_MAP, resolveApiKey } from "../api/lib/ai-provider-registry";
import { callFireworksAPI } from "../api/lib/fireworks-client";

// Read .env manually
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const k = trimmed.substring(0, eqIdx).trim();
      const v = trimmed.substring(eqIdx + 1).trim();
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }
  }
}

async function main() {
  console.log("==================================================");
  console.log("    SMARTSPEND AI & MODEL AUDIT SCRIPT            ");
  console.log("==================================================\n");

  // 1. Check Database system_settings
  let dbSettings: Record<string, string> = {};
  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL!);
    const [rows] = await connection.execute<any[]>("SELECT `key`, `value` FROM `system_settings`");
    for (const r of rows) {
      dbSettings[r.key] = r.value;
    }
    await connection.end();
    console.log("✅ Successfully connected to MySQL DB.");
    console.log("Found system_settings keys count:", Object.keys(dbSettings).length);
  } catch (err: any) {
    console.error("⚠️ MySQL Connection Error:", err.message);
  }

  console.log("\n--- API KEYS IN SYSTEM ---");
  const geminiKey1 = dbSettings.ai_api_key || process.env.GEMINI_API_KEY || "";
  const geminiKey2 = dbSettings.ai_api_key_2 || "";
  const groqKey = dbSettings.groq_api_key || process.env.GROQ_API_KEY || "";
  const fireworksKey = dbSettings.fireworks_api_key || process.env.FIREWORKS_API_KEY || "";

  console.log("Gemini Key 1:", geminiKey1 ? `${geminiKey1.substring(0, 10)}... (${geminiKey1.length} chars)` : "❌ MISSING");
  console.log("Gemini Key 2:", geminiKey2 ? `${geminiKey2.substring(0, 10)}... (${geminiKey2.length} chars)` : "❌ MISSING");
  console.log("Groq Key:    ", groqKey ? `${groqKey.substring(0, 10)}... (${groqKey.length} chars)` : "❌ MISSING");
  console.log("Fireworks Key:", fireworksKey ? `${fireworksKey.substring(0, 10)}... (${fireworksKey.length} chars)` : "❌ MISSING");

  console.log("\n==================================================");
  console.log(" 1. TESTING GEMINI MODELS & KEYS");
  console.log("==================================================");

  if (geminiKey1) {
    console.log("\nTesting Gemini Key 1...");
    const genAI = new GoogleGenerativeAI(geminiKey1);
    
    // List actual models available via API key
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey1}`);
      if (res.ok) {
        const data: any = await res.json();
        const available = (data.models || []).map((m: any) => m.name.replace("models/", ""));
        console.log(`\n📋 Live Available Gemini Models from API (${available.length}):`);
        console.log(available.join(", "));
      } else {
        const errText = await res.text();
        console.error(`❌ List models failed (${res.status}): ${errText}`);
      }
    } catch (e: any) {
      console.error("❌ Fetch list models error:", e.message);
    }

    const geminiTestModels = [
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.1-pro",
      "gemini-3.1-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-flash",
      "gemini-1.5-pro",
      "gemini-3.5-pro",
    ];

    for (const modelId of geminiTestModels) {
      try {
        const model = genAI.getGenerativeModel({ model: modelId });
        const result = await model.generateContent("مرحبا، قل 'شغال' فقط.");
        const text = result.response.text().trim();
        console.log(`  ✅ [${modelId}]: SUCCESS -> "${text}"`);
      } catch (err: any) {
        console.log(`  ❌ [${modelId}]: FAILED -> ${err.message}`);
      }
    }
  }

  console.log("\n==================================================");
  console.log(" 2. TESTING GROQ MODELS & KEYS");
  console.log("==================================================");

  if (!groqKey) {
    console.log("❌ Groq API key is NOT set (neither in DB nor in .env).");
  } else {
    const groq = new Groq({ apiKey: groqKey });
    const groqTestModels = [
      "deepseek-r1-distill-llama-70b",
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "qwen/qwen3-32b",
      "gemma2-9b-it",
      "openai/gpt-oss-120b",
      "openai/gpt-oss-20b",
      "whisper-large-v3",
    ];

    for (const modelId of groqTestModels) {
      try {
        if (modelId.startsWith("whisper")) {
          console.log(`  ℹ️ [${modelId}]: Audio model (skipping chat completion test)`);
          continue;
        }
        const response = await groq.chat.completions.create({
          model: modelId,
          messages: [{ role: "user", content: "Hi, reply 'OK' only." }],
          max_tokens: 10,
        });
        const text = response.choices[0]?.message?.content?.trim() || "";
        console.log(`  ✅ [${modelId}]: SUCCESS -> "${text}"`);
      } catch (err: any) {
        console.log(`  ❌ [${modelId}]: FAILED -> ${err.message}`);
      }
    }
  }

  console.log("\n==================================================");
  console.log(" 3. TESTING FIREWORKS MODELS & KEYS");
  console.log("==================================================");

  if (!fireworksKey) {
    console.log("❌ Fireworks API key is NOT set (neither in DB nor in .env).");
  } else {
    const fireworksModels = [
      "accounts/fireworks/models/deepseek-v4-flash",
      "accounts/fireworks/models/deepseek-v4-pro",
      "accounts/fireworks/models/qwen3-embedding-8b",
      "accounts/fireworks/models/deepseek-r1",
      "accounts/fireworks/models/deepseek-v3",
    ];

    for (const modelId of fireworksModels) {
      if (modelId.includes("embedding")) {
        console.log(`  ℹ️ [${modelId}]: Embedding model (skipping chat completion test)`);
        continue;
      }
      try {
        const res = await callFireworksAPI(
          fireworksKey,
          modelId,
          "أنت مساعد مفيد",
          "رد بكلمة 'تم' فقط داخل JSON: {\"status\": \"تم\"}",
          50
        );
        console.log(`  ✅ [${modelId}]: SUCCESS -> "${res.text.trim()}" (Tokens: ${res.tokensUsed})`);
      } catch (err: any) {
        console.log(`  ❌ [${modelId}]: FAILED -> ${err.message}`);
      }
    }
  }

  console.log("\n==================================================");
  console.log(" 4. DB SYSTEM SETTINGS SNAPSHOT");
  console.log("==================================================");
  console.log("Free Routing Ranges DB:", dbSettings.free_routing_ranges || "(Not in DB)");
  console.log("Pro Routing Ranges DB: ", dbSettings.pro_routing_ranges || "(Not in DB)");
  console.log("AI Model Free DB:      ", dbSettings.ai_model_free || "(Not in DB)");
  console.log("AI Model Pro DB:       ", dbSettings.ai_model_pro || "(Not in DB)");
  console.log("AI Model Ultra DB:     ", dbSettings.ai_model_ultra || "(Not in DB)");
  console.log("AI Model Reports DB:   ", dbSettings.ai_model_reports || "(Not in DB)");
}

main().catch(console.error);
