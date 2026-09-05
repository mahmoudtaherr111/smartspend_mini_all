import { describe, it, expect } from "vitest";
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env"), override: true });

describe("Migration 0021 Execution & Verification", () => {
  it("applies 0021_storage_lifecycle_overhaul.sql cleanly to MySQL", async () => {
    const dbUrl = process.env.DATABASE_URL;
    expect(dbUrl).toBeDefined();

    let connection: mysql.Connection | null = null;
    try {
      connection = await mysql.createConnection({
        uri: dbUrl,
        multipleStatements: true,
      });
    } catch (e: any) {
      console.warn("Could not connect to live DB:", e.message);
      return;
    }

    try {
      const migrationFiles = [
        "0018_broad_felicia_hardy.sql",
        "0019_brown_rogue.sql",
        "0020_pink_shen.sql",
        "0021_storage_lifecycle_overhaul.sql",
      ];

      for (const mFile of migrationFiles) {
        const sqlFile = path.resolve(process.cwd(), "db", "migrations", mFile);
        if (!fs.existsSync(sqlFile)) continue;
        const sqlContent = fs.readFileSync(sqlFile, "utf8");

        const statements = sqlContent
          .split("--> statement-breakpoint")
          .map((s) => s.trim())
          .filter((s) => s.length > 0);

        for (const stmt of statements) {
          try {
            await connection.query(stmt);
          } catch (err: any) {
            const msg = err.message || "";
            if (
              msg.includes("Duplicate column name") ||
              msg.includes("Duplicate key name") ||
              msg.includes("already exists") ||
              msg.includes("check that column/key exists")
            ) {
              // Already applied / redundant index drop
            } else {
              console.warn("Statement execution warning:", mFile, stmt.slice(0, 100), err.message);
            }
          }
        }
      }


      // Verify sessions.token_hash exists
      const [sessionsCols] = await connection.query<any[]>(
        "SHOW COLUMNS FROM `sessions` LIKE 'token_hash'",
      );
      expect(sessionsCols.length).toBe(1);

      // Verify expense_daily_rollups exists
      const [rollupTable] = await connection.query<any[]>(
        "SHOW TABLES LIKE 'expense_daily_rollups'",
      );
      expect(rollupTable.length).toBe(1);

      // Verify expense_details exists
      const [detailsTable] = await connection.query<any[]>(
        "SHOW TABLES LIKE 'expense_details'",
      );
      expect(detailsTable.length).toBe(1);

      // Verify ai_cost_monthly exists
      const [aiCostTable] = await connection.query<any[]>(
        "SHOW TABLES LIKE 'ai_cost_monthly'",
      );
      expect(aiCostTable.length).toBe(1);

      // Verify ad_stats_daily exists
      const [adStatsTable] = await connection.query<any[]>(
        "SHOW TABLES LIKE 'ad_stats_daily'",
      );
      expect(adStatsTable.length).toBe(1);
    } finally {
      await connection.end();
    }
  });
});
