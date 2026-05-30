const mysql = require("mysql2/promise");
require("dotenv").config();

async function main() {
  const connection = await mysql.createConnection(process.env.DATABASE_URL);

  try {
    await connection.execute(`
      ALTER TABLE local_users ADD COLUMN avatar VARCHAR(500) NULL
    `);
    console.log("Avatar column added successfully.");
  } catch (err) {
    if (err.code === "ER_DUP_FIELDNAME") {
      console.log("Column already exists.");
    } else {
      console.error("Error:", err.message);
    }
  } finally {
    await connection.end();
  }
}

main();
