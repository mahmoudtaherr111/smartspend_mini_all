import fs from "fs";
import mysql from "mysql2/promise";
import "dotenv/config";

async function run() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  const sql = fs.readFileSync("db/migrations/0011_chunky_mercury.sql", "utf-8");
  const queries = sql.split("--> statement-breakpoint");
  for (const query of queries) {
    if (query.trim()) {
      console.log("Executing:", query.trim().substring(0, 50) + "...");
      await connection.query(query);
    }
  }
  await connection.end();
  console.log("Done!");
}
run().catch(console.error);
