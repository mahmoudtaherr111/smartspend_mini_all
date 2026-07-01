import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../../db/schema";
import * as relations from "../../db/relations";
import { env } from "../lib/env";

const pool = mysql.createPool({
  uri: env.DATABASE_URL,
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: env.NODE_ENV === "production" ? 30 : 10,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

export const db = drizzle(pool, {
  schema: { ...schema, ...relations },
  mode: "default",
});

// Backward-compatible helper for routers that use getDb()
export function getDb() {
  return db;
}
