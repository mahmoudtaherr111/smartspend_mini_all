const mysql = require("mysql2/promise");
async function main() {
  try {
    const conn = await mysql.createConnection(
      "mysql://root:@localhost:3306/test",
    );
    await conn.execute(
      "UPDATE system_settings SET value = '10000000' WHERE `key` = 'pro_token_limit'",
    );
    await conn.execute(
      "INSERT IGNORE INTO system_settings (`key`, value) VALUES ('pro_token_limit', '10000000')",
    );
    await conn.execute(
      "UPDATE system_settings SET value = '10000000' WHERE `key` = 'free_token_limit'",
    );
    await conn.execute(
      "INSERT IGNORE INTO system_settings (`key`, value) VALUES ('free_token_limit', '10000000')",
    );
    console.log("Updated system_settings for token limit!");
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
main();
