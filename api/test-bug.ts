import { runSmartPipeline } from "./lib/smart-pipeline";
import { normalizeV2 } from "./lib/normalizer-v2";
import { decomposeHybridFree } from "./lib/narrative-decomposer";

async function debugBug() {
  const text = "4200 جنيه اكل 650 جنيه مياه و جبت تشيرت ب2400 و رحت لعبت بلاي ستيشن ب200 جنيه";
  console.log("=== Debugging User Bug ===");
  console.log("Original Text:", text);
  console.log("Normalized for AI:", normalizeV2(text).forAI);
  console.log("Normalized for Rules:", normalizeV2(text).forRules);
  
  const decomp = await decomposeHybridFree(text, process.env.GEMINI_API_KEY || "");
  console.log("Decomposer Method:", decomp.method);
  console.log("Decomposer isComplex:", decomp.isComplex);
  console.log("Segments:", JSON.stringify(decomp.segments, null, 2));

  console.log("\nRunning Pipeline:");
  const res = await runSmartPipeline({
    text,
    provider: "gemini",
    apiKey: process.env.GEMINI_API_KEY || "",
    modelName: "gemini-2.0-flash",
  });

  console.log("Pipeline Decision:", res.decision);
  console.log("Clarification Question:", res.clarificationQuestion);
  console.log("Tokens Used:", res.tokensUsed);
  console.log("Items:", JSON.stringify(res.items, null, 2));
}

debugBug().catch(console.error);
