/**
 * Diagnostic script: checks the actual state of user_profiles in the DB
 * to understand why onboarding answers might not be persisting.
 */
const mysql = require("mysql2/promise");
require("dotenv").config();

async function diagnose() {
  const dbUrl = process.env.DATABASE_URL;
  console.log("DATABASE_URL:", dbUrl);
  
  // Parse the DB name from the URL
  const dbName = dbUrl.match(/\/([^/?]+)(\?|$)/)?.[1] || "unknown";
  console.log("Database name:", dbName);

  const connection = await mysql.createConnection(dbUrl);

  // 1. Check if user_profiles table exists
  console.log("\n=== 1. CHECKING TABLE EXISTENCE ===");
  try {
    const [tables] = await connection.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'user_profiles'`,
      [dbName]
    );
    if (tables.length === 0) {
      console.log("❌ TABLE 'user_profiles' DOES NOT EXIST! This is the root cause.");
      console.log("   Run: npm run db:push");
      await connection.end();
      return;
    }
    console.log("✅ Table 'user_profiles' exists");
  } catch (err) {
    console.log("❌ Error checking table:", err.message);
    await connection.end();
    return;
  }

  // 2. Check columns
  console.log("\n=== 2. CHECKING COLUMNS ===");
  const [columns] = await connection.query(`SHOW COLUMNS FROM user_profiles`);
  const colNames = columns.map(c => c.Field);
  console.log("All columns:", colNames.join(", "));
  
  const requiredJsonCols = ["onboarding_answers", "basic_info", "financial_info", "lifestyle_info", "ai_inferred_attributes", "preferences"];
  for (const col of requiredJsonCols) {
    const found = columns.find(c => c.Field === col);
    if (!found) {
      console.log(`❌ MISSING COLUMN: ${col} — this will cause the Drizzle save to fail!`);
    } else {
      console.log(`✅ ${col} exists (type: ${found.Type})`);
    }
  }

  // 3. Check all rows
  console.log("\n=== 3. ALL PROFILE ROWS ===");
  const [rows] = await connection.query(`SELECT id, user_id, user_type, monthly_income, financial_goal, profile_completed, 
    JSON_LENGTH(onboarding_answers) as answers_count,
    onboarding_answers,
    JSON_LENGTH(basic_info) as basic_count,
    JSON_LENGTH(financial_info) as financial_count,
    JSON_LENGTH(lifestyle_info) as lifestyle_count
    FROM user_profiles ORDER BY id`);
  
  if (rows.length === 0) {
    console.log("⚠️ No profile rows found.");
  } else {
    for (const row of rows) {
      console.log(`\n--- User ${row.user_id} (${row.user_type}) ---`);
      console.log(`  income: ${row.monthly_income}, goal: ${row.financial_goal}, completed: ${row.profile_completed}`);
      console.log(`  onboarding_answers count: ${row.answers_count ?? 'NULL'}`);
      console.log(`  basic_info keys: ${row.basic_count ?? 'NULL'}`);
      console.log(`  financial_info keys: ${row.financial_count ?? 'NULL'}`);
      console.log(`  lifestyle_info keys: ${row.lifestyle_count ?? 'NULL'}`);
      
      if (row.onboarding_answers) {
        const answers = typeof row.onboarding_answers === 'string' 
          ? JSON.parse(row.onboarding_answers) 
          : row.onboarding_answers;
        console.log(`  onboarding answer keys: [${Object.keys(answers).join(', ')}]`);
      } else {
        console.log(`  ❌ onboarding_answers is NULL — answers are NOT being persisted!`);
      }
    }
  }

  // 4. Test a direct write
  console.log("\n=== 4. TESTING DIRECT WRITE ===");
  try {
    await connection.query(
      `INSERT INTO user_profiles (user_id, user_type, onboarding_answers) 
       VALUES (99999, 'test', '{"test_key": {"value": "test", "skipped": false}}')
       ON DUPLICATE KEY UPDATE onboarding_answers = VALUES(onboarding_answers)`
    );
    const [testRow] = await connection.query(
      `SELECT onboarding_answers FROM user_profiles WHERE user_id = 99999 AND user_type = 'test'`
    );
    if (testRow.length > 0 && testRow[0].onboarding_answers) {
      console.log("✅ Direct write to onboarding_answers WORKS!");
      // Clean up
      await connection.query(`DELETE FROM user_profiles WHERE user_id = 99999 AND user_type = 'test'`);
    } else {
      console.log("❌ Direct write returned null — column may have wrong type");
    }
  } catch (err) {
    console.log("❌ Direct write failed:", err.message);
  }

  await connection.end();
  console.log("\n=== DIAGNOSIS COMPLETE ===");
}

diagnose().catch(err => {
  console.error("Diagnosis failed:", err.message);
  process.exit(1);
});
