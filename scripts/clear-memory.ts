import { db } from "../api/db/queries/connection";
import { classificationLogs } from "../api/db/schema";
import { sql } from "drizzle-orm";

async function clearInaccurateMuscleMemory() {
  console.log("Starting muscle memory cleanup...");
  try {
    // Keep highly trusted logs (confidence >= 95) and delete the inaccurate ones
    const result = await db.execute(
      sql`DELETE FROM ${classificationLogs} WHERE confidence < 95 OR was_corrected = true`,
    );
    console.log(`Successfully cleared inaccurate muscle memory logs.`);
  } catch (error) {
    console.error("Failed to clear muscle memory:", error);
  } finally {
    process.exit(0);
  }
}

clearInaccurateMuscleMemory();
