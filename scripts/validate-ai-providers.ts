/**
 * SmartSpend AI — Live AI Provider Validator
 *
 * Validates that all configured API keys are valid and all model names
 * referenced in the codebase actually exist at each provider.
 *
 * Usage:  npx tsx scripts/validate-ai-providers.ts
 * Or:     npm run check:ai
 *
 * Exit codes:
 *   0 — All checks passed
 *   1 — At least one critical check failed
 */

import "dotenv/config";
import { MODEL_CATALOG, isPlaceholderKey, DEPRECATED_MODEL_MAP } from "../api/lib/ai-provider-registry";

const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const GROQ_KEY = process.env.GROQ_API_KEY || "";
const FIREWORKS_KEY = process.env.FIREWORKS_API_KEY || "";

let hasErrors = false;

function ok(msg: string) { console.log(`  ✅ ${msg}`); }
function warn(msg: string) { console.log(`  ⚠️  ${msg}`); }
function fail(msg: string) { console.log(`  ❌ ${msg}`); hasErrors = true; }

// ── Gemini Validation ──────────────────────────────────────────────
async function validateGemini() {
  console.log("\n🔷 Gemini API");

  if (isPlaceholderKey(GEMINI_KEY)) {
    warn("GEMINI_API_KEY is not set or is a placeholder — skipping live check");
    return;
  }

  ok("GEMINI_API_KEY is configured");

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_KEY}`,
    );
    if (!res.ok) {
      fail(`API returned ${res.status} — key may be invalid or expired`);
      return;
    }
    const data = await res.json();
    const apiModels = (data.models || []).map((m: any) =>
      (m.name || "").replace("models/", ""),
    );
    const apiSet = new Set(apiModels);
    ok(`API returned ${apiModels.length} models`);

    // Check each Gemini catalog entry
    const geminiCatalog = MODEL_CATALOG.filter((m) => m.provider === "gemini");
    for (const entry of geminiCatalog) {
      if (apiSet.has(entry.id)) {
        ok(`${entry.id} — available`);
      } else {
        // Audio models may use different naming in the models list
        if (entry.id.includes("native-audio")) {
          warn(`${entry.id} — not in models list (may require special API access)`);
        } else {
          fail(`${entry.id} — NOT FOUND in API response!`);
        }
      }
    }
  } catch (err) {
    fail(`Network error: ${err instanceof Error ? err.message : err}`);
  }
}

// ── Groq Validation ────────────────────────────────────────────────
async function validateGroq() {
  console.log("\n🟢 Groq API");

  if (isPlaceholderKey(GROQ_KEY)) {
    warn("GROQ_API_KEY is not set — skipping live check (Groq is optional)");
    return;
  }

  ok("GROQ_API_KEY is configured");

  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${GROQ_KEY}` },
    });
    if (!res.ok) {
      fail(`API returned ${res.status} — key may be invalid`);
      return;
    }
    const data = await res.json();
    const apiModels = (data.data || []).map((m: any) => m.id);
    const apiSet = new Set(apiModels);
    ok(`API returned ${apiModels.length} models`);

    const groqCatalog = MODEL_CATALOG.filter((m) => m.provider === "groq");
    for (const entry of groqCatalog) {
      if (apiSet.has(entry.id)) {
        ok(`${entry.id} — available`);
      } else {
        fail(`${entry.id} — NOT FOUND in API response!`);
      }
    }
  } catch (err) {
    fail(`Network error: ${err instanceof Error ? err.message : err}`);
  }
}

// ── Fireworks Validation ───────────────────────────────────────────
async function validateFireworks() {
  console.log("\n🟠 Fireworks AI");

  if (isPlaceholderKey(FIREWORKS_KEY)) {
    warn("FIREWORKS_API_KEY is not set — skipping live check (Fireworks is optional)");
    return;
  }

  ok("FIREWORKS_API_KEY is configured");

  // Fireworks doesn't have a simple models list endpoint that returns all serverless models,
  // so we test each model by sending a minimal completion request
  const fireworksCatalog = MODEL_CATALOG.filter(
    (m) => m.provider === "fireworks" && !m.purposes.includes("embedding"),
  );

  for (const entry of fireworksCatalog) {
    try {
      const res = await fetch("https://api.fireworks.ai/inference/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIREWORKS_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: entry.id,
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 1,
        }),
      });
      if (res.ok) {
        ok(`${entry.id} — available`);
      } else {
        const errData = await res.json().catch(() => ({}));
        fail(`${entry.id} — returned ${res.status}: ${JSON.stringify(errData).slice(0, 100)}`);
      }
    } catch (err) {
      fail(`${entry.id} — network error: ${err instanceof Error ? err.message : err}`);
    }
  }

  // Test embedding model separately
  const embeddingModels = MODEL_CATALOG.filter(
    (m) => m.provider === "fireworks" && m.purposes.includes("embedding"),
  );
  for (const entry of embeddingModels) {
    try {
      const res = await fetch("https://api.fireworks.ai/inference/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIREWORKS_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: entry.id,
          input: "test",
        }),
      });
      if (res.ok) {
        ok(`${entry.id} — available`);
      } else {
        fail(`${entry.id} — returned ${res.status}`);
      }
    } catch (err) {
      fail(`${entry.id} — network error: ${err instanceof Error ? err.message : err}`);
    }
  }
}

// ── Deprecated Model Check ─────────────────────────────────────────
function checkDeprecatedReferences() {
  console.log("\n🔍 Deprecated Model Map Integrity");
  for (const [oldName, newName] of Object.entries(DEPRECATED_MODEL_MAP)) {
    const entry = MODEL_CATALOG.find((m) => m.id === newName);
    if (entry) {
      ok(`${oldName} → ${newName}`);
    } else {
      fail(`${oldName} → ${newName} — but "${newName}" is NOT in MODEL_CATALOG!`);
    }
  }
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║  SmartSpend AI — Provider & Model Validator     ║");
  console.log("╚══════════════════════════════════════════════════╝");

  checkDeprecatedReferences();
  await validateGemini();
  await validateGroq();
  await validateFireworks();

  console.log("\n" + "═".repeat(52));
  if (hasErrors) {
    console.log("❌ SOME CHECKS FAILED — see errors above");
    process.exit(1);
  } else {
    console.log("✅ ALL CHECKS PASSED");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
