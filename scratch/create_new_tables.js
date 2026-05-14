import "dotenv/config";
import mysql from "mysql2/promise";

async function createTables() {
  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        user_type VARCHAR(50) NOT NULL,
        monthly_income DECIMAL(12,2),
        financial_goal VARCHAR(100),
        financial_personality VARCHAR(50),
        profile_completed BOOLEAN DEFAULT FALSE,
        last_asked_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE INDEX profile_user_idx (user_id, user_type)
      )
    `);
    console.log("✅ user_profiles table created");

    await connection.execute(`
      CREATE TABLE IF NOT EXISTS onboarding_questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        question_text VARCHAR(500) NOT NULL,
        question_key VARCHAR(100) NOT NULL UNIQUE,
        input_type VARCHAR(50) NOT NULL DEFAULT 'text',
        options JSON,
        is_active BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("✅ onboarding_questions table created");

    // Seed default onboarding questions
    await connection.execute(`
      INSERT IGNORE INTO onboarding_questions (question_text, question_key, input_type, options, sort_order)
      VALUES 
        ('متوسط دخلك الشهري كام تقريباً؟', 'monthly_income', 'number', NULL, 1),
        ('إيه هدفك المالي الأساسي؟', 'financial_goal', 'select', '["توفير فلوس","سداد ديون","استثمار","ضبط الميزانية"]', 2)
    `);
    console.log("✅ Default onboarding questions seeded");

    await connection.end();
    console.log("Done!");
  } catch (err) {
    console.error("Error:", err);
  }
}

createTables();
