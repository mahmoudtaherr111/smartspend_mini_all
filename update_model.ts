import { db } from "./api/queries/connection";
import { systemSettings } from "./db/schema";
import { eq } from "drizzle-orm";

async function updateDB() {
  const model = "gemini-2.5-flash-native-audio-preview-12-2025";

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
