process.env.DATABASE_URL = "mysql://root:password@localhost:3306/smartspend";
process.env.GOOGLE_CLIENT_ID = "test";
process.env.GOOGLE_CLIENT_SECRET = "test";
process.env.JWT_SECRET = "test";
process.env.GEMINI_API_KEY = "test";
process.env.GROQ_API_KEY = "test";
import { runPipeline } from "./api/lib/classification-pipeline";

async function runTest() {
  const input = "اديت مروان 200";
  console.log(`\n===========================================`);
  console.log(`[TEST] Testing: "${input}" (Unknown person)`);
  console.log(`===========================================`);

  const result = await runPipeline({
    text: input,
    userId: 1,
    userType: "local",
    userPlan: "free",
    apiKey: "test",
    apiKey2: "",
    modelName: "gemini-2.5-flash",
    maxTokens: 512,
    skipClarification: false,
    userDict: [],
    monthlyContext: { totalIncome: 0, totalExpense: 0 },
    userProfileContext: {
      promptSummary: "Test Profile",
      personalContextPrompt: "",
      knownPeople: [],
    },
    provider: "gemini",
    groqApiKey: "test",
  });

  console.log("\n[RESULT]");
  console.log(`Decision: ${result.decision}`);
  console.log(`Clarification Question: ${result.clarificationQuestion}`);
  console.log(`Items:`, JSON.stringify(result.items, null, 2));

  console.log(`\n===========================================`);
  const input2 = "اديت مروان 200 (اخويا)";
  console.log(`[TEST] Testing: "${input2}" (Clarified)`);
  console.log(`===========================================`);

  const result2 = await runPipeline({
    text: input2,
    userId: 1,
    userType: "local",
    userPlan: "free",
    apiKey: "test",
    apiKey2: "",
    modelName: "gemini-2.5-flash",
    maxTokens: 512,
    skipClarification: false,
    userDict: [],
    monthlyContext: { totalIncome: 0, totalExpense: 0 },
    userProfileContext: {
      promptSummary: "Test Profile",
      personalContextPrompt: "",
      knownPeople: [],
    },
    provider: "gemini",
    groqApiKey: "test",
  });

  console.log("\n[RESULT 2]");
  console.log(`Decision: ${result2.decision}`);
  console.log(`Items:`, JSON.stringify(result2.items, null, 2));
}

runTest().catch(console.error);
