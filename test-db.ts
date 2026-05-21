import "dotenv/config";
import { db } from "./api/queries/connection";
import { systemSettings } from "./db/schema";

async function main() {
  try {
    const settings = await db.select().from(systemSettings);
    console.log("System Settings:", JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error("Error fetching system settings:", err);
  }
  process.exit(0);
}

main().catch(console.error);
