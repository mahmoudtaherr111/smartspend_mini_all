import { GoogleGenerativeAI } from "@google/generative-ai";

async function test() {
  const apiKey = "YOUR_GEMINI_API_KEY_HERE";
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });
  try {
    const res = await model.generateContent("Hello");
    console.log("Success:", res.response.text());
  } catch (e: any) {
    console.error("Error:", e.message);
  }
}
test();
