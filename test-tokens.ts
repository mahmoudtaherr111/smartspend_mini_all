import { runSmartPipeline } from "./api/lib/smart-pipeline";

async function main() {
  const input = {
    text: "النهاردة نزلت ركبت اوبر ب 50 وبعدين شحنت رصيد ب 100 وجبت كارت كهربا ب 200 ودفعت الايجار 3000 واديت البواب 50 وبعدين نزلت بالليل قعدت على القهوة ب 150 واشتريت لبس ب 2000 واديت لاخويا 500 سلف عشان كان محتاجهم وطلبت دليفري ب 300",
    userId: 1,
    userType: "oauth",
    userPlan: "pro",
    userDict: [],
    apiKey: process.env.GEMINI_API_KEY || "",
    apiKey2: process.env.GEMINI_API_KEY_2 || "",
    modelName: "gemini-2.5-flash",
    maxTokens: 4096,
  };

  console.log("Running pipeline for 9 complex transactions...");
  const res = await runSmartPipeline(input);
  
  console.log("Tokens Used:", res.tokensUsed);
  console.log("Decision:", res.decision);
  console.log("Parsed By:", res.parsedBy);
  console.log("Alert:", res.alertMessage);
  console.log("Items:", JSON.stringify(res.items, null, 2));
}

main().catch(console.error);
