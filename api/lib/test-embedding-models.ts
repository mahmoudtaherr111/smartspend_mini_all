import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(apiKey);

async function testModel(modelName: string) {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const res = await model.embedContent("Hello");
    console.log(`✅ Success with ${modelName}`);
  } catch (e) {
    console.error(`❌ Failed with ${modelName}:`, (e as Error).message);
  }
}

async function run() {
  await testModel("gemini-embedding-001");
  await testModel("gemini-embedding-2");
  await testModel("text-embedding-004");
}

run();
