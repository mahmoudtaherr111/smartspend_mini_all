import dotenv from "dotenv";
dotenv.config();
import { db } from "./api/queries/connection";
import { apiKeyErrors } from "./db/schema";
import { desc } from "drizzle-orm";

async function run() {
  console.log("Checking recent API key/model errors...");
  try {
    const errors = await db
      .select()
      .from(apiKeyErrors)
      .orderBy(desc(apiKeyErrors.createdAt))
      .limit(10);

    console.log("--- RECENT ERRORS ---");
    errors.forEach((e) => {
      console.log(`- Time: ${e.createdAt} | Provider: ${e.provider} | Key: ${e.keyLabel} | Type: ${e.errorType} | Msg: ${e.message}`);
    });
  } catch (err: any) {
    console.error("Query failed:", err.message);
  }
}

run();
