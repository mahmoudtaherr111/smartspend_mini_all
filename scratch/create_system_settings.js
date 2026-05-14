import "dotenv/config";
import mysql from "mysql2/promise";

async function createTable() {
  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS system_settings (
        \`key\` VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log("system_settings table created successfully");
    await connection.end();
  } catch (err) {
    console.error("Error:", err);
  }
}

createTable();
