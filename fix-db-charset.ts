import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function fixCharset() {
  const url = process.env.DATABASE_URL || "mysql://root:@localhost:3306/test";
  console.log(`Connecting to database...`);

  try {
    const connection = await mysql.createConnection(url);
    console.log("Connected successfully!");

    // Get the database name
    const dbName = url.split('/').pop().split('?')[0];

    console.log(`Fixing database ${dbName} charset...`);
    await connection.query(
      `ALTER DATABASE \`${dbName}\` CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci;`
    );

    console.log("Converting ai_summaries table...");
    try {
      await connection.query(
        "ALTER TABLE `ai_summaries` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
      );
    } catch (e) {
      console.log("Error converting ai_summaries:", e.message);
    }

    console.log("Converting monthly_reports table...");
    try {
      await connection.query(
        "ALTER TABLE `monthly_reports` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
      );
    } catch (e) {
      console.log("Error converting monthly_reports:", e.message);
    }

    console.log("Converting classification_logs table...");
    try {
      await connection.query(
        "ALTER TABLE `classification_logs` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
      );
    } catch (e) {
      console.log("Error converting classification_logs:", e.message);
    }

    console.log("Converting expenses table...");
    try {
      await connection.query(
        "ALTER TABLE `expenses` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
      );
    } catch (e) {
      console.log("Error converting expenses:", e.message);
    }

    await connection.end();
    console.log("✅ Database charset fixed successfully!");
  } catch (err) {
    console.error("💥 Failed to connect or fix charset:", err.message);
  }
}

fixCharset();
