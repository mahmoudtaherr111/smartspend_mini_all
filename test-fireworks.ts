import "dotenv/config";
import { runSmartPipeline } from "./api/lib/smart-pipeline";

async function run() {
  console.log("=== Smart Pipeline Fireworks AI Test (Caching & Reasoning) ===");
  try {
    const res = await runSmartPipeline({
      text: "دفعت سبعمية وخمسين جنيه لمحل ملابس",
      userId: 1,
      userType: "local",
      userPlan: "pro",
      userDict: [],
      apiKey: "",
      apiKey2: "",
      modelName: "accounts/fireworks/models/deepseek-v4-flash",
      maxTokens: 2048,
      provider: "fireworks",
      fireworksApiKey: process.env.FIREWORKS_API_KEY || "", 
      userProfileContext: {
        knownPeople: [
          { name: "أحمد", relationship: "أخويا", category: "تحويل", subCategory: "تحويلات شخصية" }
        ]
      }
    });

    console.log("\nParsed By:", res.parsedBy);
    console.log("Tokens Used:", res.tokensUsed);
    console.log("Cached Tokens:", (res as any).cachedTokens);
    console.log("Items found:", res.items.length);
    res.items.forEach(item => {
      console.log(`- [${item.type}] ${item.category}/${item.subCategory} : ${item.amount} (${item.description}) [Conf: ${item.confidence}] [Person: ${item.person_mentioned}]`);
    });
    process.exit(0);
  } catch (err) {
    console.error("Test failed:", err);
    process.exit(1);
  }
}

run();
