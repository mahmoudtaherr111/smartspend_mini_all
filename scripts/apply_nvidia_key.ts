import fs from "fs";
import path from "path";
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
  console.log("   APPLYING NVIDIA API KEY TO SYSTEM SETTINGS     ");
  console.log("==================================================\n");

  const nvidiaKey = process.env.NVIDIA_API_KEY;
  if (!nvidiaKey) {
    console.error("NVIDIA_API_KEY environment variable is not set.");
    process.exit(1);
  }

  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL!);
    await connection.execute(
      "INSERT INTO `system_settings` (`key`, `value`) VALUES ('nvidia_api_key', ?) ON DUPLICATE KEY UPDATE `value` = ?",
      [nvidiaKey, nvidiaKey]
    );
    console.log("✅ Successfully saved nvidia_api_key in MySQL system_settings DB table!");
    await connection.end();
  } catch (err: any) {
    console.log("ℹ️ MySQL DB update skipped:", err.message);
  }
}

main().catch(console.error);
