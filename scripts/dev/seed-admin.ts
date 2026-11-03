/**
 * Makes a phone account with the admin role on a throwaway database, to try the admin console locally
 * (`npm run admin:dev`). The password comes from ADMIN_DEV_PASSWORD and is never printed or stored here.
 *   ADMIN_DEV_PASSWORD=... npx tsx scripts/dev/seed-admin.ts
 */
import { eq } from "drizzle-orm";
import { localUsers, supportTickets } from "../../db/schema";
import { hashPassword } from "../../api/local-auth-utils";
import { db } from "../../api/queries/connection";

const ADMIN_ID = 7001;

async function main() {
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (!["127.0.0.1", "localhost"].includes(target.hostname) || target.port !== "3399") {
    throw new Error("The admin seed needs a throwaway database on port 3399");
  }
  const password = process.env.ADMIN_DEV_PASSWORD;
  if (!password || password.length < 10) throw new Error("Set ADMIN_DEV_PASSWORD (10 characters or more)");

  await db.delete(localUsers).where(eq(localUsers.id, ADMIN_ID));
  await db.insert(localUsers).values({
    id: ADMIN_ID,
    name: "أدمن تجربة",
    phone: "01099990000",
    password: await hashPassword(password),
    plan: "pro",
    role: "admin",
  });
  // One waiting ticket, so the home page has something that needs the admin.
  await db.insert(supportTickets).values({
    userId: 500001,
    userType: "local",
    subject: "الرصيد مش مظبوط",
    message: "المحفظة بتقول رقم غير اللي في البنك",
    status: "open",
  });
  console.log("ADMIN_SEEDED phone 01099990000");
  process.exit(0);
}

main().catch((error) => {
  console.error(String(error).slice(0, 300));
  process.exit(1);
});
