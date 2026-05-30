const mysql = require("mysql2/promise");
require("dotenv").config();

async function check() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: "test",
  });

  const [rows] = await connection.query(
    `SELECT id, onboarding_answers FROM user_profiles LIMIT 1`,
  );
  console.log("Profiles in DB:", JSON.stringify(rows, null, 2));

  const [columns] = await connection.query(`SHOW COLUMNS FROM user_profiles`);
  console.log("\nColumns:", columns.map((c) => c.Field).join(", "));

  await connection.end();
}

check().catch(console.error);
