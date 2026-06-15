import { runSmartPipeline } from "./api/lib/smart-pipeline";

async function test() {
  const text = "اديت يحيى (اخويا) 500 جنيه واديت منه 200 جنيه واديت علاء 600 جنيه";

  console.log(`\n--- Test ---`);
  console.log(`Input: ${text}`);
  try {
    const result = await runSmartPipeline({
      text,
      userId: 1,
      userType: "user",
      userPlan: "free",
      userDict: [],
      apiKey: process.env.GEMINI_API_KEY || "",
      apiKey2: process.env.GEMINI_API_KEY || "",
      modelName: "gemini-2.5-flash",
      maxTokens: 2000,
      userProfileContext: {
        promptSummary: "",
        knownPeople: []
      },
      pipelineSettings: {}
    });
    
    console.log("Decision:", result.decision);
    console.log("Clarification:", result.clarificationQuestion);
    console.log("Items:", JSON.stringify(result.items, null, 2));
  } catch (e) {
    console.error(e);
  }
}

test();
