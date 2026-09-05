import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "../../db/schema";
import * as relations from "../../db/relations";
import { env } from "../lib/env";

export const mysqlPool = mysql.createPool({
  uri: env.DATABASE_URL,
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: env.NODE_ENV === "production" ? 30 : 10,
  queueLimit: 0,
  connectTimeout: 10000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
});

// Threshold-based slow query logging (P0 & P8 Observability)
function logSlowQuery(sqlString: string, durationMs: number) {
  if (env.LOG_SLOW_QUERIES !== "true") return;
  const threshold = env.SLOW_QUERY_THRESHOLD_MS;
  if (durationMs >= threshold) {
    const preview = typeof sqlString === "string" ? sqlString.replace(/\s+/g, " ").trim().slice(0, 500) : String(sqlString);
    console.warn(`[SLOW QUERY] ${durationMs.toFixed(2)}ms (threshold: ${threshold}ms) -> ${preview}`);
  }
}

const origQuery = mysqlPool.query.bind(mysqlPool);
const origExecute = mysqlPool.execute.bind(mysqlPool);
const origGetConnection = mysqlPool.getConnection.bind(mysqlPool);

(mysqlPool as any).query = async function (...args: any[]) {
  const start = performance.now();
  try {
    return await (origQuery as any)(...args);
  } finally {
    const duration = performance.now() - start;
    const querySql = typeof args[0] === "string" ? args[0] : args[0]?.sql || "";
    logSlowQuery(querySql, duration);
  }
};

(mysqlPool as any).execute = async function (...args: any[]) {
  const start = performance.now();
  try {
    return await (origExecute as any)(...args);
  } finally {
    const duration = performance.now() - start;
    const querySql = typeof args[0] === "string" ? args[0] : args[0]?.sql || "";
    logSlowQuery(querySql, duration);
  }
};

(mysqlPool as any).getConnection = async function () {
  const conn = await origGetConnection();
  const connQuery = conn.query.bind(conn);
  const connExecute = conn.execute.bind(conn);

  conn.query = (async (...args: any[]) => {
    const start = performance.now();
    try {
      return await (connQuery as any)(...args);
    } finally {
      const duration = performance.now() - start;
      const querySql = typeof args[0] === "string" ? args[0] : args[0]?.sql || "";
      logSlowQuery(querySql, duration);
    }
  }) as any;

  conn.execute = (async (...args: any[]) => {
    const start = performance.now();
    try {
      return await (connExecute as any)(...args);
    } finally {
      const duration = performance.now() - start;
      const querySql = typeof args[0] === "string" ? args[0] : args[0]?.sql || "";
      logSlowQuery(querySql, duration);
    }
  }) as any;

  return conn;
};

export const db = drizzle(mysqlPool, {
  schema: { ...schema, ...relations },
  mode: "default",
});

// Backward-compatible helper for routers that use getDb()
export function getDb() {
  return db;
}

export function getPoolMetrics() {
  const p = (mysqlPool as any).pool;
  return {
    connectionLimit: env.NODE_ENV === "production" ? 30 : 10,
    allConnections: p?._allConnections?.length ?? 0,
    freeConnections: p?._freeConnections?.length ?? 0,
    queuedRequests: p?._connectionQueue?.length ?? 0,
  };
}

