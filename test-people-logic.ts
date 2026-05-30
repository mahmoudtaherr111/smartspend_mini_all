import { runSmartPipeline } from "./api/lib/smart-pipeline";

async function main() {
  const input = {
    text: "النهاردة نزلت اشتريت ب 500 جنيه أكل وبعدها رحت اتعشيت في مطعم ب 350 جنيه وبعدين أديت مروان 500 جنيه وعملنا نزلنا السينما مع محمد وبعدين مثلاً رحت أديت لعلاء 500 جنيه",
    userId: 1,
    userType: "oauth",
    userPlan: "pro",
    userDict: [
        { word: "مروان", category: "العائلة", subCategory: "الإخوة" },
        { word: "محمد", category: "أصدقاء", subCategory: "عام" }
    ],
    userProfileContext: {
        promptSummary: "User Profile",
        personalContextPrompt: "",
        knownPeople: [
            { name: "مروان", category: "العائلة", subCategory: "الإخوة", relationship: "أخ" },
            { name: "محمد", category: "أصدقاء", subCategory: "عام", relationship: "صديق" }
        ]
    },
    apiKey: process.env.GEMINI_API_KEY || "",
    apiKey2: process.env.GEMINI_API_KEY_2 || "",
    modelName: "gemini-2.5-flash",
    maxTokens: 4096,
  };

  console.log("Running pipeline for people logic test...");
  const res = await runSmartPipeline(input);
  
  console.log("Tokens Used:", res.tokensUsed);
  console.log("Decision:", res.decision);
  console.log("Clarification Question:", res.clarificationQuestion);
  console.log("Items:", JSON.stringify(res.items, null, 2));
}

main().catch(console.error);
