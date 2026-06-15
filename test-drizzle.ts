import { getDb } from "./api/queries/connection";
import { pendingClarifications } from "./db/schema";
import { eq, desc } from "drizzle-orm";

async function main() {
  const db = getDb();
  const rows = await db.select().from(pendingClarifications).orderBy(desc(pendingClarifications.id)).limit(1);
  const row = rows[0];
  console.log("TypeOf contextData:", typeof row.contextData);
  if (typeof row.contextData === "string") {
    console.log("It is a string!");
  } else {
    console.log("It is an object!");
    console.log("pendingNames:", row.contextData.pendingNames);
    console.log("Is array?", Array.isArray(row.contextData.pendingNames));
  }
}

main().catch(console.error);
