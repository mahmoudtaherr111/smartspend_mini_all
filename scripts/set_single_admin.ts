import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import mysql from "mysql2/promise";

// Read .env manually
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const k = trimmed.substring(0, eqIdx).trim();
      const v = trimmed.substring(eqIdx + 1).trim();
      if (!process.env[k]) {
        process.env[k] = v;
      }
    }
  }
}

async function main() {
  console.log("==================================================");
  console.log("       SETTING SINGLE ADMIN USER IN DB           ");
  console.log("==================================================\n");

  const adminPhone = "01555883166";
  const adminName = "محمود طاهر";
  const rawPassword = "123456";

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("❌ DATABASE_URL is not set in environment or .env file.");
    process.exit(1);
  }

  try {
    const connection = await mysql.createConnection(dbUrl);
    console.log("✅ Connected to MySQL database.");

    // 1. Demote all existing admin users in `users` (Google OAuth) table to 'user'
    const [resUsers] = await connection.execute<any>(
      "UPDATE `users` SET `role` = 'user' WHERE `role` = 'admin'"
    );
    console.log(`Updated OAuth users table: ${resUsers.affectedRows} users demoted from admin to user.`);

    // 2. Demote all existing admin users in `local_users` table to 'user'
    const [resLocal] = await connection.execute<any>(
      "UPDATE `local_users` SET `role` = 'user' WHERE `role` = 'admin'"
    );
    console.log(`Updated local_users table: ${resLocal.affectedRows} users demoted from admin to user.`);

    // 3. Hash password '123456'
    const hashedPassword = await bcrypt.hash(rawPassword, 12);

    // 4. Check if user with phone '01555883166' already exists
    const [existing] = await connection.execute<any[]>(
      "SELECT `id`, `name`, `phone`, `role` FROM `local_users` WHERE `phone` = ? LIMIT 1",
      [adminPhone]
    );

    if (existing.length > 0) {
      const user = existing[0];
      console.log(`Found existing user with ID ${user.id} (${user.name}). Updating to Admin...`);
      await connection.execute(
        "UPDATE `local_users` SET `name` = ?, `password` = ?, `role` = 'admin', `plan` = 'ultra' WHERE `id` = ?",
        [adminName, hashedPassword, user.id]
      );
      console.log(`✅ User ID ${user.id} updated successfully: Name='${adminName}', Role='admin', Plan='ultra'.`);
    } else {
      console.log(`User with phone ${adminPhone} not found. Creating new Admin user...`);
      const [insertRes] = await connection.execute<any>(
        "INSERT INTO `local_users` (`name`, `phone`, `password`, `role`, `plan`) VALUES (?, ?, ?, 'admin', 'ultra')",
        [adminName, adminPhone, hashedPassword]
      );
      console.log(`✅ Created new Admin user with ID ${insertRes.insertId}: Name='${adminName}', Phone='${adminPhone}', Role='admin', Plan='ultra'.`);
    }

    // 5. Verify database state
    const [allAdminsOAuth] = await connection.execute<any[]>("SELECT `id`, `name`, `email`, `role` FROM `users` WHERE `role` = 'admin'");
    const [allAdminsLocal] = await connection.execute<any[]>("SELECT `id`, `name`, `phone`, `role`, `plan` FROM `local_users` WHERE `role` = 'admin'");

    console.log("\n--- VERIFICATION OF ALL ADMIN USERS IN DB ---");
    console.log("OAuth Admins Count:", allAdminsOAuth.length);
    console.log("Local Admins Count:", allAdminsLocal.length);
    console.log("Sole Admin Details:", allAdminsLocal[0] || "None");

    await connection.end();
  } catch (err: any) {
    console.error("❌ Database Error:", err.message);
    process.exit(1);
  }
}

main().catch(console.error);
