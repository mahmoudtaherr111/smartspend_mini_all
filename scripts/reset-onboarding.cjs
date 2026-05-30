/**
 * Reset onboarding state for testing — clears onboarding answers and profileCompleted
 * so the onboarding flow can be tested fresh.
 */
const mysql = require("mysql2/promise");
require("dotenv").config();

async function reset() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  // Reset all profiles to start fresh
  await connection.query(`
    UPDATE user_profiles 
    SET onboarding_answers = '{}', 
        profile_completed = 0,
        basic_info = NULL,
        financial_info = NULL,
        lifestyle_info = NULL,
        ai_inferred_attributes = NULL,
        preferences = NULL
  `);

  const [rows] = await connection.query(
    `SELECT id, user_id, profile_completed, JSON_LENGTH(onboarding_answers) as ac FROM user_profiles`,
  );
  console.log("Reset complete. Current state:");
  rows.forEach((r) =>
    console.log(
      `  User ${r.user_id}: completed=${r.profile_completed}, answers=${r.ac}`,
    ),
  );

  await connection.end();
}

reset().catch(console.error);
