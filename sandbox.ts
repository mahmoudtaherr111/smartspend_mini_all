import { config } from "dotenv";
config(); // Load .env first

process.env.DATABASE_URL = process.env.DATABASE_URL || "mysql://mock:3306/db";
process.env.GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "mock_id";
process.env.GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "mock_secret";
process.env.JWT_SECRET = process.env.JWT_SECRET || "mock_jwt";

async function run() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.AI_API_KEY || "";
  if (!apiKey) {
    console.error("No API Key found in .env");
    return;
  }

  // Dynamic import prevents hoisting so env is mocked first
  const { aiClassify } = await import("./api/lib/ai-classifier.ts");

  const cases = [
    "اديت مروان 500 جنيه",
    "خدت من مروان 1000",
    "نزلت الصبح جبت فطار ب 50 وبعدين ركبت مواصلات ب 20 ورحت الشغل شربت قهوة ب 40 وبعد الشغل رحت كارفور جبت طلبات بيت ب 300 وبعدين طيرت 100 فكة واديت اختي مريم 200",
    "قبضت جمعيتي 2000 ودفعت قسط الكلية 1000"
  ];
  
  for (const c of cases) {
    console.log(`\n======================================================`);
    console.log(`[Testing Case]: "${c}"`);
    console.log(`======================================================`);
    
    // Simulate amount parsing logic
    const amounts = c.match(/\d+/g) || [];
    const amountCount = amounts.length;
    
    const contextObj = {
       totalIncome: 5000,
       totalExpense: 1000,
       currentDate: new Date().toISOString(),
       userProfileContext: "المستخدم شغال فريلانسر.",
       personalContext: "مروان = أخويا \n مريم = أختي \n الكلية = جامعة",
       amountCount: amountCount
    };

    try {
      const result = await aiClassify(c, apiKey, "", "gemini-1.5-flash", 800, contextObj);
      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      console.error("Error during classification:", e);
    }
  }
}

run().catch(console.error);
