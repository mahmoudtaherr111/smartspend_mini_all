import "dotenv/config";

// Mock process.env before anything else is loaded
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "postgres://dummy:dummy@localhost:5432/dummy";
process.env.GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID || "dummy_client_id";
process.env.GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET || "dummy_client_secret";
process.env.JWT_SECRET = process.env.JWT_SECRET || "dummy_jwt_secret";
process.env.GEMINI_API_KEY =
  process.env.GEMINI_API_KEY || "YOUR_GEMINI_API_KEY_HERE";

import { aiClassify } from "./api/lib/ai-classifier";
import { aiClassifyPro } from "./api/lib/ai-classifier-pro";

async function run() {
  const apiKey = process.env.GEMINI_API_KEY!;

  if (apiKey.includes("dummy")) {
    console.error("Please ensure GEMINI_API_KEY is in .env");
  }

  const input1 = "صرفت 500 جنيه اكل و 450 جنيه شرب ميّة و 1000 جنيه لبس";
  const input2 = "اديت احمد 400";

  try {
    console.log("=== Testing Free Classifier for Multi-Transaction ===");
    const res1 = await aiClassify(input1, apiKey, "", "gemini-2.5-flash", 512, {
      plan: "free",
    } as any);
    console.log(JSON.stringify(res1, null, 2));

    console.log("\n=== Testing Free Classifier for Ambiguous Name ===");
    const res2 = await aiClassify(input2, apiKey, "", "gemini-2.5-flash", 512, {
      plan: "free",
    } as any);
    console.log(JSON.stringify(res2, null, 2));

    console.log("\n=== Testing PRO Classifier for Ambiguous Name ===");
    const res3 = await aiClassifyPro(
      input2,
      apiKey,
      "",
      "gemini-2.5-pro",
      512,
      { plan: "pro" } as any,
    );
    console.log(JSON.stringify(res3, null, 2));
  } catch (err) {
    console.error(err);
  }
}

run();
