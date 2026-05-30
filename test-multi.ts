import { runMultiAgentPipeline } from "./api/lib/multi-agent-pipeline";
import { config } from "dotenv";
config();

async function test() {
  const result = await runMultiAgentPipeline({
    text: "رحت السوبر ماركت صرفت 1500 جنيه طلبات للبيت وبعدين رحت اشتريت ب 500 جنيه خضار وبعدين اشتريت ب 1000 جنيه لحمة وبعدين ب 500 جنيه بانيه وبعدين رحت اشتريت بنطلون ب 5000 وبعدين رحت اشتريت كوتشي ب 1000 جنيه وبعدين بعد ما خلصت ده كله وأنا مروح جبت حلويات زي شيبسي ومولتو ب 700 جنيه",
    userId: 1,
    userType: "local",
    userPlan: "free",
    userDict: [],
    apiKey: process.env.GEMINI_API_KEY || "",
    modelName: "gemini-2.5-flash",
    provider: "gemini",
  });
  console.log(JSON.stringify(result, null, 2));
}
test().catch(console.error);
