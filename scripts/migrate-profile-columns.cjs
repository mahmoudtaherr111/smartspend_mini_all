/**
 * Migration: Ensure all SmartProfile JSON columns exist in user_profiles table.
 * This fixes the root cause of onboarding answers being silently lost.
 * 
 * Run: node scripts/migrate-profile-columns.cjs
 */
const mysql = require("mysql2/promise");
require("dotenv").config();

async function migrate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "smartspend",
  });

  console.log("Connected to database. Checking user_profiles schema...\n");

  // Define all required columns with their types
  const requiredColumns = [
    { name: "basic_info", type: "JSON", defaultVal: "NULL" },
    { name: "financial_info", type: "JSON", defaultVal: "NULL" },
    { name: "lifestyle_info", type: "JSON", defaultVal: "NULL" },
    { name: "onboarding_answers", type: "JSON", defaultVal: "NULL" },
    { name: "ai_inferred_attributes", type: "JSON", defaultVal: "NULL" },
    { name: "preferences", type: "JSON", defaultVal: "NULL" },
    { name: "avatar_id", type: "VARCHAR(100)", defaultVal: "NULL" },
    { name: "profile_version", type: "INT", defaultVal: "2" },
    { name: "last_ai_refresh_at", type: "DATETIME", defaultVal: "NULL" },
    { name: "last_asked_at", type: "DATETIME", defaultVal: "NULL" },
  ];

  // Get existing columns
  const [columns] = await connection.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_profiles'`,
    [process.env.DB_NAME || "smartspend"]
  );
  const existingColumns = new Set(columns.map((c) => c.COLUMN_NAME));

  let addedCount = 0;
  for (const col of requiredColumns) {
    if (!existingColumns.has(col.name)) {
      const defaultClause = col.defaultVal === "NULL" ? "DEFAULT NULL" : `DEFAULT ${col.defaultVal}`;
      const sql = `ALTER TABLE user_profiles ADD COLUMN \`${col.name}\` ${col.type} ${defaultClause}`;
      console.log(`  ➕ Adding column: ${col.name} (${col.type})`);
      await connection.query(sql);
      addedCount++;
    } else {
      console.log(`  ✅ Column exists: ${col.name}`);
    }
  }

  // Ensure unique index exists
  try {
    const [indexes] = await connection.query(
      `SHOW INDEX FROM user_profiles WHERE Key_name = 'profile_user_idx'`
    );
    if (indexes.length === 0) {
      console.log("\n  ➕ Adding unique index: profile_user_idx (user_id, user_type)");
      await connection.query(
        `ALTER TABLE user_profiles ADD UNIQUE INDEX profile_user_idx (user_id, user_type)`
      );
    } else {
      console.log("\n  ✅ Unique index exists: profile_user_idx");
    }
  } catch (e) {
    console.log("\n  ⚠️ Could not check/create index:", e.message);
  }

  console.log(`\n✅ Migration complete. ${addedCount} columns added.`);
  if (addedCount > 0) {
    console.log("⚠️  This was the ROOT CAUSE of onboarding answers being lost!");
    console.log("   The saveSmartProfile() was failing silently and falling back to legacy save.");
  }

  await connection.end();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
