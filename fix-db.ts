import "dotenv/config";
import mysql from "mysql2/promise";

async function run() {
  const db = await mysql.createConnection(process.env.DATABASE_URL!);
  try {
    await db.query("ALTER TABLE expenses ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'confirmed'");
    console.log("Added status");
  } catch(e: any) {
    console.log("Status already exists or error:", e.message);
  }
  process.exit(0);
}

run();
