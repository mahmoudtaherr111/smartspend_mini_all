import "dotenv/config";
import mysql from "mysql2/promise";

async function test() {
  try {
    const url = process.env.DATABASE_URL;
    if (!url) {
      console.error("DATABASE_URL not found");
      return;
    }
    const connection = await mysql.createConnection(url);
    console.log("Connected to DB");
    const [rows] = await connection.execute("SHOW TABLES");
    console.log("Tables:", rows);
    await connection.end();
  } catch (err) {
    console.error("DB Test Error:", err);
  }
}

test();
