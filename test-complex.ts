import { runSmartPipeline } from "./api/lib/smart-pipeline";

async function test() {
  const sentences = [
    "اديت محمود (صاحبي) 500 وخدت من علي (زميلي) 200 واديت منى (اختي) 1000 وخدت من سارة (قريبتي) 500 ونزلت الجيم دفعت 300 ودفعت بنزين 200 وغيرت كاوتش ب 1500",
    "قبضت المرتب 10000 واديت امي (امي) 2000 وخدت من ابويا (ابويا) 500 سلف واديت اخويا (اخويا) 300 ودفعت فاتورة الكهربا 400 والنت 350"
  ];

  for (const [i, text] of sentences.entries()) {
    console.log(`\n--- Test ${i + 1} ---`);
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
}

test();
