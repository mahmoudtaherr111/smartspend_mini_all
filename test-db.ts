import 'dotenv/config';
import { db } from './api/queries/connection';
import { sql } from 'drizzle-orm';

async function test() {
  try {
    const res = await db.execute(sql`DESCRIBE whatsapp_otp_codes`);
    console.log("whatsapp_otp_codes columns:", res[0]);
  } catch (err: any) {
    console.error("whatsapp_otp_codes Error:", err.message);
  }
  process.exit(0);
}

test();
