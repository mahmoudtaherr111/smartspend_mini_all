import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./db/schema";
import "dotenv/config";

async function main() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = await connection.query("SHOW TABLES;");
  console.log("Tables:", JSON.stringify(rows, null, 2));
  
  const [columns] = await connection.query("SHOW COLUMNS FROM expenses;");
  console.log("Expenses Columns:", JSON.stringify(columns, null, 2));
  
  await connection.end();
}

main().catch(console.error);
