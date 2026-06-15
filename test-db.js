import Database from "better-sqlite3";

const db = new Database("db/local.db");
const row = db.prepare("SELECT * FROM pending_clarifications ORDER BY id DESC LIMIT 1").get();
console.log(row.question);
console.log(row.contextData);
