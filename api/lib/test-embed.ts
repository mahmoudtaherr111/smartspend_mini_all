import { GoogleGenerativeAI } from "@google/generative-ai";
import * as dotenv from "dotenv";
dotenv.config();

async function test() {
  const apiKey = process.env.GEMINI_API_KEY;
  console.log("API Key exists:", !!apiKey);
  console.log("API Key prefix:", apiKey?.slice(0, 7));
  
  const genAI = new GoogleGenerativeAI(apiKey || "");
  
  const models = ["embedding-001", "models/embedding-001"];
  for (const m of models) {
    try {
      const model = genAI.getGenerativeModel({ model: m }, { apiVersion: "v1" });
      const res = await model.embedContent("test");
      console.log(`✅ Success with ${m} (v1 request option):`, res.embedding.values.slice(0, 5));
    } catch (e: any) {
      console.error(`❌ Failed with ${m} (v1 request option):`, e.message);
    }
  }
}

test();
