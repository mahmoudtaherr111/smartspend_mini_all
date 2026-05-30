const mysql = require("mysql2/promise");
async function main() {
  try {
    const conn = await mysql.createConnection(
      "mysql://root:@localhost:3306/test",
    );
    await conn.execute(
      "UPDATE system_settings SET value = 'v3' WHERE `key` = 'pipeline_version'",
    );
    await conn.execute(
      "INSERT IGNORE INTO system_settings (`key`, value) VALUES ('pipeline_version', 'v3')",
    );
    console.log("Updated system_settings!");
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
main();
