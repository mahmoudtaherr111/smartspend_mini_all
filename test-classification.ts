import { runPipelineV2Compat } from "./api/lib/pipeline-v2";

async function test() {
  const result = await runPipelineV2Compat({
    text: "اديت سلوى 30 جنيه. (صحبتي)",
    plan: "pro",
    apiKey: process.env.GEMINI_API_KEY || "",
    apiKey2: process.env.GEMINI_API_KEY_2 || "",
    modelName: "gemini-2.5-flash",
    userDict: {},
    profileContext: "",
    proContext: {
      totalIncome: 0,
      totalExpense: 0,
      currentDate: new Date().toISOString(),
      plan: "pro",
      isSmoker: false,
    },
    isSmoker: false,
    providedAmount: undefined,
  });

  console.log(JSON.stringify(result, null, 2));
}

test().catch(console.error);
