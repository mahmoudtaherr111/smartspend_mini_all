import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function fixSystemSettings() {
  const url = process.env.DATABASE_URL || "mysql://root:@localhost:3306/test";
  console.log(`Connecting to database...`);

  try {
    const connection = await mysql.createConnection(url);
    console.log("Connected successfully!");

    // Update the ai_model_pro and ai_model_reports to gemini-3.5-flash
    await connection.query(
      "UPDATE `system_settings` SET `value` = 'gemini-3.5-flash' WHERE `key` = 'ai_model_pro'"
    );
    await connection.query(
      "UPDATE `system_settings` SET `value` = 'gemini-3.5-flash' WHERE `key` = 'ai_model_reports'"
    );
    await connection.query(
      "UPDATE `system_settings` SET `value` = 'gemini-2.5-flash' WHERE `key` = 'ai_model_free'"
    );

    await connection.end();
    console.log("✅ System settings models updated successfully!");
  } catch (err) {
    console.error("💥 Failed to connect or fix settings:", err.message);
  }
}

fixSystemSettings();
