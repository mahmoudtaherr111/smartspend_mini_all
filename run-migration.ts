import "dotenv/config";
import * as mysql from "mysql2/promise";
import fs from "fs";
import path from "path";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("No DATABASE_URL");
  const connection = await mysql.createConnection(url);
  const sql = fs.readFileSync(path.join(process.cwd(), "db/migrations/0008_bent_carnage.sql"), "utf-8");
  const statements = sql.split("--> statement-breakpoint");
  for (const stmt of statements) {
    if (stmt.trim()) {
      try {
        console.log("Executing:", stmt.substring(0, 50) + "...");
        await connection.query(stmt);
      } catch (e: any) {
        console.log("Error or already exists:", e.message);
      }
    }
  }
  console.log("Done");
  await connection.end();
}
main().catch(console.error);
