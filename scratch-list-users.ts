import dotenv from "dotenv";
dotenv.config();
import { db } from "./api/queries/connection";
import { localUsers, users } from "./db/schema";

async function run() {
  console.log("Listing users...");
  try {
    const localDbUsers = await db.select().from(localUsers);
    console.log("--- LOCAL USERS ---");
    console.log(JSON.stringify(localDbUsers, null, 2));

    const oauthUsers = await db.select().from(users);
    console.log("--- OAUTH USERS ---");
    console.log(JSON.stringify(oauthUsers, null, 2));
  } catch (err: any) {
    console.error("Query failed:", err.stack);
  }
  process.exit(0);
}

run();
