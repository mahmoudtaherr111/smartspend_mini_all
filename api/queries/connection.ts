import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../../db/schema";
import * as relations from "../../db/relations";
import { env } from "../lib/env";

const pool = mysql.createPool({
  uri: env.DATABASE_URL,
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export const db = drizzle(pool, {
  schema: { ...schema, ...relations },
  mode: "default",
});

// Backward-compatible helper for routers that use getDb()
export function getDb() {
  return db;
}
