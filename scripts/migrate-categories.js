import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

async function runMigration() {
  const url = process.env.DATABASE_URL || "mysql://root:@localhost:3306/test";
  console.log(`Connecting to database to migrate categories...`);

  try {
    const connection = await mysql.createConnection(url);
    console.log("Connected successfully!");

    console.log("Migrating family transactions categories...");
    const [familyRes] = await connection.query(
      'UPDATE `expenses` SET `category` = "العائلة" WHERE `category` = "معاملات عائلية"',
    );
    console.log(
      `✅ Migrated ${familyRes.affectedRows || 0} family transactions.`,
    );

    console.log("Migrating employees transactions categories...");
    const [empRes] = await connection.query(
      'UPDATE `expenses` SET `category` = "موظفين" WHERE `category` = "موظفين وعمال"',
    );
    console.log(
      `✅ Migrated ${empRes.affectedRows || 0} employee transactions.`,
    );

    await connection.end();
    console.log("🎉 Database category migration completed successfully!");
  } catch (err) {
    console.error("💥 Failed to run category migration:", err.message);
  }
}

runMigration();
