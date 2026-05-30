// @ts-check
require("dotenv").config({
  path: require("path").join(__dirname, "..", ".env"),
});
const mysql = require("mysql2/promise");

async function run() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS voice_usage (
        id INT PRIMARY KEY AUTO_INCREMENT,
        user_id INT NOT NULL,
        user_type VARCHAR(50) NOT NULL,
        duration_seconds INT NOT NULL,
        month VARCHAR(7) NOT NULL,
        source VARCHAR(50) DEFAULT 'gemini_stt',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX voice_user_month_idx (user_id, user_type, month)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("✅ voice_usage table created (or already exists)");
  } catch (e) {
    console.error("❌ Error:", e.message);
  } finally {
    await conn.end();
  }
}

run();
