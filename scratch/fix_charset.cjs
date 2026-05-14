const mysql = require('mysql2/promise');

async function fixCharset() {
  const conn = await mysql.createConnection('mysql://root:@localhost:3306/test');
  
  // Alter database
  await conn.query('ALTER DATABASE test CHARACTER SET = utf8mb4 COLLATE = utf8mb4_unicode_ci');
  
  // Get all tables
  const [rows] = await conn.query('SHOW TABLES');
  const tables = rows.map(r => Object.values(r)[0]);
  
  for (const table of tables) {
    await conn.query(`ALTER TABLE \`${table}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`Converted table ${table} to utf8mb4`);
  }
  
  await conn.end();
  console.log("Done fixing charset.");
}

fixCharset().catch(console.error);
