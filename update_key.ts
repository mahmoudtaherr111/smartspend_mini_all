import dotenv from "dotenv";
import { db } from "./api/queries/connection";
import { systemSettings } from "./db/schema";
import { eq } from "drizzle-orm";

dotenv.config();

async function updateDB() {
  const apiKey = process.env.GEMINI_API_KEY || "";
  const model = "gemini-2.5-flash"; // default

  // update or insert ai_api_key
  const existingKey = await db.select().from(systemSettings).where(eq(systemSettings.key, "ai_api_key"));
  if (existingKey.length > 0) {
    await db.update(systemSettings).set({ value: apiKey }).where(eq(systemSettings.key, "ai_api_key"));
  } else {
    await db.insert(systemSettings).values({ key: "ai_api_key", value: apiKey });
  }

  // update or insert voice_call_model
  const existingModel = await db.select().from(systemSettings).where(eq(systemSettings.key, "voice_call_model"));
  if (existingModel.length > 0) {
    await db.update(systemSettings).set({ value: model }).where(eq(systemSettings.key, "voice_call_model"));
  } else {
    await db.insert(systemSettings).values({ key: "voice_call_model", value: model });
  }

  console.log("Database updated successfully.");
  process.exit(0);
}

updateDB().catch(console.error);
