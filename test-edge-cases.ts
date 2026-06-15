import { runSmartPipeline } from "./api/lib/smart-pipeline";

async function run() {
    const inputs = [
        "اشتريت لبن ب 50 وسددت ديون عليا ب 1000 لعماد",
        "دفعت 150 غسيل عربية و 50 بنزين",
        "استلفت من عمي 1000",
        "حولت 450 جنيه لأبانوب و 550 لجرجس"
    ];

    for (const text of inputs) {
        console.log(`\nTesting: ${text}`);
        try {
            const res = await runSmartPipeline({
                text: text,
                userId: 1,
                userType: "user",
                userPlan: "free",
                userDict: [],
                apiKey: process.env.GEMINI_API_KEY || "",
                groqApiKey: "",
                modelName: "gemini-3.1-flash-lite", // or whatever model
                maxTokens: 2000,
                monthlyContext: { totalIncome: 5000, totalExpense: 2000 },
                userProfileContext: { knownPeople: [] },
                provider: "gemini"
            });
            console.log(`Decision: ${res.decision}`);
            console.log(JSON.stringify(res.items, null, 2));
        } catch (err) {
            console.error("Error:", err);
        }
    }
}

run();
