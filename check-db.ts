import { config } from "dotenv";
config();
import { getDb } from "./api/queries/connection";
import { systemSettings } from "./db/schema";

async function run() {
  const db = getDb();
  const settings = await db.select().from(systemSettings);
  console.log(settings.map((s) => `${s.key}: ${s.value}`));
}
run().catch(console.error);
