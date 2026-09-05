import { describe, it, expect } from "vitest";
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { TABLE_CLASSES, TABLE_CLASS_DEFINITIONS, TableClass } from "../db/table-classes";

dotenv.config({ path: path.resolve(process.cwd(), ".env"), override: true });

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

describe("Storage Baseline & Instrumentation (P0)", () => {
  it("generates docs/STORAGE_BASELINE.md from live information_schema", async () => {
    const dbUrl = process.env.DATABASE_URL;
    expect(dbUrl).toBeDefined();

    let connection: mysql.Connection | null = null;
    try {
      connection = await mysql.createConnection(dbUrl!);
    } catch (e: any) {
      console.warn("Could not connect to live DB for baseline measurement:", e.message);
      return;
    }

    try {
      const [[dbRow]] = await connection.query<any[]>("SELECT DATABASE() as currentDb");
      const currentDb = dbRow?.currentDb;

      const [tableRows] = await connection.query<any[]>(
        `SELECT 
          TABLE_NAME, 
          COALESCE(TABLE_ROWS, 0) as TABLE_ROWS, 
          COALESCE(DATA_LENGTH, 0) as DATA_LENGTH, 
          COALESCE(INDEX_LENGTH, 0) as INDEX_LENGTH,
          COALESCE(DATA_LENGTH + INDEX_LENGTH, 0) as TOTAL_LENGTH
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = DATABASE()
         ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC, TABLE_NAME ASC`,
      );

      const [indexRows] = await connection.query<any[]>(
        `SELECT 
          TABLE_NAME, 
          INDEX_NAME, 
          NON_UNIQUE, 
          COLUMN_NAME, 
          SEQ_IN_INDEX, 
          CARDINALITY
         FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
         ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
      );

      const indexesByTable: Record<string, Record<string, { nonUnique: number; columns: string[]; cardinality: number | null }>> = {};
      for (const row of indexRows) {
        const tbl = row.TABLE_NAME;
        const idx = row.INDEX_NAME;
        if (!indexesByTable[tbl]) indexesByTable[tbl] = {};
        if (!indexesByTable[tbl][idx]) {
          indexesByTable[tbl][idx] = {
            nonUnique: row.NON_UNIQUE,
            columns: [],
            cardinality: row.CARDINALITY,
          };
        }
        indexesByTable[tbl][idx].columns.push(row.COLUMN_NAME);
      }

      let totalDataBytes = 0;
      let totalIndexBytes = 0;
      let totalRows = 0;

      const tableStats = tableRows.map((t: any) => {
        const tbl = t.TABLE_NAME;
        const dataLen = Number(t.DATA_LENGTH) || 0;
        const idxLen = Number(t.INDEX_LENGTH) || 0;
        const rows = Number(t.TABLE_ROWS) || 0;
        const totalLen = Number(t.TOTAL_LENGTH) || (dataLen + idxLen);

        totalDataBytes += dataLen;
        totalIndexBytes += idxLen;
        totalRows += rows;

        const idxMap = indexesByTable[tbl] || {};
        const indexes = Object.entries(idxMap).map(([name, data]) => ({
          name,
          nonUnique: data.nonUnique,
          columns: data.columns,
          cardinality: data.cardinality,
        }));

        return {
          tableName: tbl,
          tableClass: TABLE_CLASSES[tbl] || "UNKNOWN",
          rows,
          dataLengthBytes: dataLen,
          indexLengthBytes: idxLen,
          totalLengthBytes: totalLen,
          indexCount: indexes.length,
          indexes,
        };
      });

      let md = `# SmartSpend Database Storage Baseline (P0)\n\n`;
      md += `*Generated at:* ${new Date().toISOString()}\n`;
      md += `*Database:* \`${currentDb}\`\n`;
      md += `*Total Tables Measured:* ${tableStats.length}\n`;
      md += `*Total Estimated Rows:* ${totalRows.toLocaleString()}\n`;
      md += `*Total Data Size:* ${formatBytes(totalDataBytes)} (${totalDataBytes.toLocaleString()} bytes)\n`;
      md += `*Total Index Size:* ${formatBytes(totalIndexBytes)} (${totalIndexBytes.toLocaleString()} bytes)\n`;
      md += `*Total Database Size:* ${formatBytes(totalDataBytes + totalIndexBytes)} (${(totalDataBytes + totalIndexBytes).toLocaleString()} bytes)\n\n`;

      md += `## 1. Table Class Breakdown\n\n`;
      const classCount: Record<string, number> = {};
      const classSize: Record<string, number> = {};
      for (const stat of tableStats) {
        classCount[stat.tableClass] = (classCount[stat.tableClass] || 0) + 1;
        classSize[stat.tableClass] = (classSize[stat.tableClass] || 0) + stat.totalLengthBytes;
      }

      md += `| Class | Name | Tables | Total Size | Lifetime Rule |\n`;
      md += `| :---: | :--- | ---: | ---: | :--- |\n`;
      for (const cls of ["A", "B", "C", "D", "E", "F", "G"] as TableClass[]) {
        const def = TABLE_CLASS_DEFINITIONS[cls];
        const count = classCount[cls] || 0;
        const size = classSize[cls] || 0;
        md += `| **${cls}** | ${def.name} | ${count} | ${formatBytes(size)} | ${def.lifetime} |\n`;
      }
      md += `\n`;

      md += `## 2. Table Storage Overview\n\n`;
      md += `| Table Name | Class | Rows | Data Size | Index Size | Total Size | Index Count |\n`;
      md += `| :--- | :---: | ---: | ---: | ---: | ---: | ---: |\n`;
      for (const stat of tableStats) {
        md += `| \`${stat.tableName}\` | **${stat.tableClass}** | ${stat.rows.toLocaleString()} | ${formatBytes(stat.dataLengthBytes)} | ${formatBytes(stat.indexLengthBytes)} | ${formatBytes(stat.totalLengthBytes)} | ${stat.indexCount} |\n`;
      }
      md += `\n`;

      md += `## 3. Ten Slowest Hotspots Identified in Audit\n\n`;
      md += `1. **Auth Hot Path (\`createContext\` in \`api/context.ts\`):** 3-plus synchronous round trips to MySQL on every request (\`sessions\`, \`users\`/\`local_users\`, \`pro_subscriptions\`).\n`;
      md += `2. **\`expenses.getMonthlyStats\` (\`api/expense-router.ts\`):** Issues unindexed \`SELECT *\` for entire current and previous month, aggregates via JavaScript \`.filter().reduce()\` in Node.\n`;
      md += `3. **\`expenses.getYearlyStats\` (\`api/expense-router.ts\`):** \`SELECT *\` for an entire calendar year, no cache, builds 12-month array in Node memory.\n`;
      md += `4. **\`financeSemanticLayer.loadRowsForPeriod\` (\`api/services/finance-semantic-layer/resolvers.ts\`):** Unbounded \`SELECT *\` with no \`LIMIT\` for arbitrary RAG query ranges.\n`;
      md += `5. **Cache Invalidation on Mutation (\`deleteCacheByPattern\` in \`api/lib/redis-client.ts\`):** O(keyspace) full \`SCAN\` on every expense insert/update/delete.\n`;
      md += `6. **Finance User Cache Invalidation (\`api/services/finance-semantic-layer/cache.ts\`):** Uses pattern with wildcard in the middle (\`finance_ai:*:<userId>:*\`).\n`;
      md += `7. **AI Memory Vector Scan (\`api/services/ai-memory/memory-retriever.ts\`):** Fetches up to 160 rows of JSON-encoded float32 embeddings from MySQL, parses JSON in Node, and computes cosine similarity in JS.\n`;
      md += `8. **Notification Engine Segment Scan (\`api/notification-engine.ts\`):** Cron runs every minute evaluating correlated subquery \`(SELECT count(*) FROM expenses WHERE user_id = ...)\` per candidate user.\n`;
      md += `9. **\`chat.getMessages\` (\`api/chat-router.ts\`):** Loads entire conversation history without pagination or bounds.\n`;
      md += `10. **\`admin.getDashboardStats\` (\`api/admin-router.ts\`):** Runs full index scan \`SELECT count(*)\` over \`expenses\` and unpaginated reads over \`push_subscriptions\`.\n\n`;

      md += `## 4. Per-Index Inventory\n\n`;
      for (const stat of tableStats) {
        md += `### \`${stat.tableName}\` (Class ${stat.tableClass}) — ${stat.indexCount} index(es)\n\n`;
        if (stat.indexes.length === 0) {
          md += `*No secondary indexes.*\n\n`;
        } else {
          md += `| Index Name | Unique | Columns | Cardinality |\n`;
          md += `| :--- | :---: | :--- | ---: |\n`;
          for (const idx of stat.indexes) {
            md += `| \`${idx.name}\` | ${idx.nonUnique === 0 ? "YES" : "NO"} | ${idx.columns.map((c) => `\`${c}\``).join(", ")} | ${idx.cardinality !== null ? idx.cardinality.toLocaleString() : "N/A"} |\n`;
          }
          md += `\n`;
        }
      }

      const baselinePath = path.resolve(process.cwd(), "docs", "STORAGE_BASELINE.md");
      fs.writeFileSync(baselinePath, md, "utf8");
      expect(fs.existsSync(baselinePath)).toBe(true);
      expect(tableStats.length).toBeGreaterThanOrEqual(48);
    } finally {
      await connection.end();
    }
  });
});
