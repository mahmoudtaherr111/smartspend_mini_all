import mysql from "mysql2/promise";
import fs from "fs";
import path from "path";
import "dotenv/config";

async function main() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL!);
  const migrationsDir = path.join(process.cwd(), "db/migrations");
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith(".sql")).sort();

  for (const file of files) {
    console.log(`Applying ${file}...`);
    const content = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    const statements = content.split("--> statement-breakpoint");
    
    for (let statement of statements) {
      statement = statement.trim();
      if (!statement) continue;
      try {
        await connection.query(statement);
      } catch (e: any) {
        if (e.code === "ER_TABLE_EXISTS_ERROR" || e.code === "ER_DUP_FIELDNAME") {
          console.warn(`Skipping statement in ${file} (already exists): ${e.message}`);
        } else {
          console.error(`Error in ${file}: ${e.message}`);
          // throw e; // Don't throw, just continue for now
        }
      }
    }
  }
  
  await connection.end();
  console.log("Migration script finished.");
}

main().catch(console.error);
