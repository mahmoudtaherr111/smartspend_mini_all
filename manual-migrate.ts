import 'dotenv/config';
import { db } from './api/queries/connection';
import { sql } from 'drizzle-orm';

async function migrate() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`whatsapp_otp_codes\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`phone\` varchar(20) NOT NULL,
        \`code\` varchar(6) NOT NULL,
        \`verified\` boolean NOT NULL DEFAULT false,
        \`expires_at\` datetime NOT NULL,
        \`created_at\` timestamp DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT \`whatsapp_otp_codes_id\` PRIMARY KEY(\`id\`)
      );
    `);
    console.log("whatsapp_otp_codes created!");
  } catch (err: any) {
    console.error("whatsapp_otp_codes Error:", err.message);
  }

  try {
    await db.execute(sql`
      CREATE INDEX \`whatsapp_otp_phone_idx\` ON \`whatsapp_otp_codes\` (\`phone\`);
    `);
    console.log("index created!");
  } catch (err: any) {
    console.error("index Error:", err.message);
  }

  try {
    await db.execute(sql`
      ALTER TABLE \`system_settings\` MODIFY COLUMN \`updated_at\` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;
    `);
    console.log("system_settings altered!");
  } catch (err: any) {
    console.error("system_settings Error:", err.message);
  }
  process.exit(0);
}

migrate();
