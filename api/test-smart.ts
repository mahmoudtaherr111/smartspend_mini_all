import { runSmartPipeline } from "./lib/smart-pipeline";
import { config } from "dotenv";

config({ path: "../.env" });

async function runTests() {
  console.log("=== Smart Pipeline Tests ===\n");
  
  const testCases = [
    "بنزين 200", // Simple Rule Engine match
    "أوبر 50 وكهربا 300", // Rule Engine multi-segment
    "النهاردا صرفت 200 بقالة وركبت أوبر بـ 50 ودفعت قسط فاليو 1500 وأبويا إداني 1000 واتعشيت بره بـ 150", // Hybrid
    "نزلت اتمشيت أنا ومروان ضربنا كشري وقعدنا على القهوة ورجعت ركبت أوبر بـ 50", // Hybrid complex
    "نزلت النهاردا وعملت كذا حاجة وصرفت شوية فلوس ع حاجات مختلفة ودفعت حاجات وأخدت حاجة وحولت لمروان واشتريت حاجتين", // Full AI complex
  ];
  
  const mockContext = {
    knownPeople: [
      { name: "مروان", relationship: "صاحبي", category: "العائلة", subCategory: "أصدقاء" },
      { name: "أبويا", relationship: "أبويا", category: "العائلة", subCategory: "الوالدين" }
    ]
  };

  for (let i = 0; i < testCases.length; i++) {
    const text = testCases[i];
    console.log(`\n--- Test Case ${i + 1} ---`);
    console.log(`Text: "${text}"`);
    
    try {
      const result = await runSmartPipeline({
        text,
        userId: 1,
        userType: "user",
        userPlan: "pro",
        userDict: [],
        apiKey: process.env.GEMINI_API_KEY || "",
        groqApiKey: process.env.GROQ_API_KEY || "",
        modelName: "gemini-2.0-flash", // Will be mapped to gemini-2.0-flash
        maxTokens: 2000,
        monthlyContext: { totalIncome: 5000, totalExpense: 2000 },
        userProfileContext: mockContext,
        provider: "gemini"
      });
      
      console.log(`Parsed By: ${result.parsedBy}`);
      console.log(`Overall Confidence: ${result.overallConfidence}`);
      console.log(`Alert Message: ${result.alertMessage}`);
      console.log(`Tokens Used: ${result.tokensUsed}`);
      console.log(`Items found: ${result.items.length}`);
      
      for (const item of result.items) {
        console.log(`- [${item.type}] ${item.category}/${item.subCategory} : ${item.amount} (${item.description}) [Conf: ${item.confidence}]`);
      }
    } catch (e) {
      console.error("Test failed:", e);
    }
  }
}

runTests().then(() => console.log("\nDone."));
