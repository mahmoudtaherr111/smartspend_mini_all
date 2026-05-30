import { runUnifiedPipeline } from "./api/lib/unified-pipeline";

async function test() {
  const input = {
    text: "النهارده اديت لمروان 1000 جنيه سلف ودفعت لفاتورة الكهربا 300 جنيه وكمان جالي 500 من مريم",
    userId: 1,
    userType: "user",
    userPlan: "free",
    userDict: [],
    apiKey: process.env.GEMINI_API_KEY || "", // Ensure you have this set in .env
    apiKey2: "",
    modelName: "gemini-2.5-flash",
    maxTokens: 1024,
    monthlyContext: { totalIncome: 0, totalExpense: 0 },
    userProfileContext: {
      knownPeople: [
        {
          name: "مروان",
          category: "أصدقاء",
          subCategory: "مروان",
          relationship: "صاحبي",
        },
      ],
    },
  };

  const res = await runUnifiedPipeline(input as any);
  console.log(JSON.stringify(res, null, 2));
}

test().catch(console.error);
