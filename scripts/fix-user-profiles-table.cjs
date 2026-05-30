const mysql = require("mysql2/promise");
require("dotenv").config();

async function main() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  const columns = [
    "ADD COLUMN basic_info JSON NULL",
    "ADD COLUMN financial_info JSON NULL",
    "ADD COLUMN lifestyle_info JSON NULL",
    "ADD COLUMN onboarding_answers JSON NULL",
    "ADD COLUMN ai_inferred_attributes JSON NULL",
    "ADD COLUMN preferences JSON NULL",
    "ADD COLUMN avatar_id VARCHAR(100) NULL",
    "ADD COLUMN profile_version INT DEFAULT 2",
    "ADD COLUMN last_ai_refresh_at DATETIME NULL",
  ];

  for (const col of columns) {
    try {
      await connection.execute(`ALTER TABLE user_profiles ${col}`);
      console.log(`Executed: ${col}`);
    } catch (err) {
      console.log(`Failed/Skipped: ${col} - ${err.message}`);
    }
  }

  await connection.end();
}

main();
