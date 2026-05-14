const mysql = require('mysql2/promise');

async function fixData() {
  const conn = await mysql.createConnection('mysql://root:@localhost:3306/test');
  await conn.query("UPDATE expenses SET type = 'income' WHERE category = 'دخل' AND type = 'expense'");
  console.log("Fixed data mismatches.");
  await conn.end();
}

fixData().catch(console.error);
