import "dotenv/config";
import { db } from "./api/queries/connection";
import { systemSettings } from "./db/schema";
import { runMultiAgentPipeline } from "./api/lib/multi-agent-pipeline";
import { resolveRoutingConfig } from "./api/ai-router";

async function main() {
  const text = "100 جنيه أكل في مطعم";
  console.log(`Running pipeline for text: "${text}"`);

  const settings = await db.select().from(systemSettings);
  const cfgFull: Record<string, string> = {};
  settings.forEach((s) => {
    if (s.value) cfgFull[s.key] = s.value;
  });

  const plan = "free";
  const tokensUsed = 0; // matching range 1 (starts at 0, now Groq)

  const routing = await resolveRoutingConfig(plan, tokensUsed, cfgFull);
  console.log("Routing Resolved:", JSON.stringify(routing, null, 2));

  try {
    const result = await runMultiAgentPipeline({
      text,
      userId: 1,
      userType: "local",
      userPlan: plan,
      userDict: [],
      apiKey: routing.apiKey,
      apiKey2: "",
      modelName: routing.model,
      maxTokens: 512,
      monthlyContext: { totalIncome: 0, totalExpense: 0 },
      provider: routing.provider,
      groqApiKey: routing.provider === "groq" ? routing.apiKey : "",
    });
    console.log("Pipeline Result:", JSON.stringify(result, null, 2));
  } catch (err: any) {
    console.error("Pipeline Error:", err.stack || err.message || err);
  }
  process.exit(0);
}

main().catch(console.error);
