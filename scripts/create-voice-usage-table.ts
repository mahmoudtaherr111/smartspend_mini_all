/**
 * Script to create the voice_usage table if it doesn't exist.
 * Run with: npx tsx scripts/create-voice-usage-table.ts
 */
import { createConnection } from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const DATABASE_URL =
  process.env.DATABASE_URL || "mysql://root:@localhost:3306/test";

function parseDatabaseUrl(url: string) {
  const match = url.match(/mysql:\/\/([^:]+):([^@]*)@([^:]+):(\d+)\/(.+)/);
  if (!match) throw new Error("Invalid DATABASE_URL");
  return {
    user: match[1],
    password: match[2],
    host: match[3],
    port: parseInt(match[4]),
    database: match[5],
  };
}

async function main() {
  const config = parseDatabaseUrl(DATABASE_URL);
  const conn = await createConnection(config);

  console.log("✅ Connected to database:", config.database);

  // Create voice_usage table
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`voice_usage\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`user_id\` INT NOT NULL,
      \`user_type\` VARCHAR(50) NOT NULL,
      \`duration_seconds\` INT NOT NULL,
      \`month\` VARCHAR(7) NOT NULL,
      \`source\` VARCHAR(50) DEFAULT 'gemini_stt',
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX \`voice_user_month_idx\` (\`user_id\`, \`user_type\`, \`month\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log("✅ voice_usage table created (or already exists).");

  // Create classification_logs table if missing
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`classification_logs\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`user_id\` INT NOT NULL,
      \`user_type\` VARCHAR(50) NOT NULL,
      \`original_text\` TEXT NOT NULL,
      \`normalized_text\` TEXT,
      \`parsed_by\` VARCHAR(50) NOT NULL,
      \`rule_engine_result\` JSON,
      \`ai_result\` JSON,
      \`final_result\` JSON,
      \`confidence\` INT DEFAULT 0,
      \`decision\` VARCHAR(50),
      \`classification_version\` VARCHAR(20) DEFAULT 'v2.1',
      \`reasoning_trace_light\` JSON,
      \`ambiguity_flags\` JSON,
      \`input_channel\` VARCHAR(20) DEFAULT 'text',
      \`needs_followup\` BOOLEAN DEFAULT FALSE,
      \`was_corrected\` BOOLEAN DEFAULT FALSE,
      \`correction\` JSON,
      \`model_used\` VARCHAR(100),
      \`tokens_used\` INT DEFAULT 0,
      \`processing_time_ms\` INT DEFAULT 0,
      \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX \`cls_log_user_idx\` (\`user_id\`, \`user_type\`),
      INDEX \`cls_log_parsed_idx\` (\`parsed_by\`),
      INDEX \`cls_log_date_idx\` (\`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
  console.log("✅ classification_logs table created (or already exists).");

  await conn.end();
  console.log("✅ Done! All tables are ready.");
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
