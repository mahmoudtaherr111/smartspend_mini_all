import { runSmartPipeline } from "./smart-pipeline";
import dotenv from "dotenv";

dotenv.config();

const testText = "صرفت 1500 جنيه جبت بيهم فراخ وصرفت 350 جنيه جبت بيهم لعبت بيهم بالستيكشن بصراحة وبعدها جبت إزازة مية ب50 جنيه وشحنت كارت فكة في دافوم ب40 جنيه";

async function run() {
  console.log(`🔍 Testing: ${testText}\n`);
  const result = await runSmartPipeline({
    text: testText,
    userId: 1,
    userType: "premium",
    userPlan: "premium",
    userDict: [],
    apiKey: process.env.GEMINI_API_KEY!,
    apiKey2: process.env.GEMINI_API_KEY!,
    modelName: process.env.GEMINI_MODEL_FREE || "gemini-2.5-flash",
    maxTokens: 200,
    pipelineSettings: { enable_rag: "true" }
  });

  console.log("=== FINAL ITEMS ===");
  console.log(JSON.stringify(result.items, null, 2));
  console.log("\n=== METRICS ===");
  console.log(`Tokens: ${result.tokensUsed}, Time: ${result.processingTimeMs}ms, Model: ${result.modelUsed}, Decision: ${result.decision}`);
  if (result.log) {
    console.log("\n=== LOGS ===");
    console.log(JSON.stringify(result.log, null, 2));
  }
}

run();
