import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import { TABLE_CLASSES, TABLE_CLASS_DEFINITIONS, TableClass } from "../db/table-classes";

dotenv.config();

interface TableStat {
  tableName: string;
  tableClass: TableClass | "UNKNOWN";
  rows: number;
  dataLengthBytes: number;
  indexLengthBytes: number;
  totalLengthBytes: number;
  indexCount: number;
  indexes: {
    name: string;
    nonUnique: number;
    columns: string[];
    cardinality: number | null;
  }[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

async function runReport() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL environment variable is required.");
    process.exit(1);
  }

  console.log("Connecting to database to generate storage report...");
  const connection = await mysql.createConnection(databaseUrl);

  try {
    const [[dbRow]] = await connection.query<any[]>("SELECT DATABASE() as currentDb");
    const currentDb = dbRow?.currentDb;
    console.log(`Database: ${currentDb}\n`);

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

    // Group indexes by table and index name
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

    const tableStats: TableStat[] = [];
    let totalDataBytes = 0;
    let totalIndexBytes = 0;
    let totalRows = 0;

    for (const t of tableRows) {
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

      tableStats.push({
        tableName: tbl,
        tableClass: TABLE_CLASSES[tbl] || "UNKNOWN",
        rows,
        dataLengthBytes: dataLen,
        indexLengthBytes: idxLen,
        totalLengthBytes: totalLen,
        indexCount: indexes.length,
        indexes,
      });
    }

    // Build Markdown Output
    let md = `# SmartSpend Database Storage & Schema Report\n\n`;
    md += `*Generated at:* ${new Date().toISOString()}\n`;
    md += `*Database:* \`${currentDb}\`\n`;
    md += `*Total Tables:* ${tableStats.length}\n`;
    md += `*Total Estimated Rows:* ${totalRows.toLocaleString()}\n`;
    md += `*Total Data Size:* ${formatBytes(totalDataBytes)} (${totalDataBytes.toLocaleString()} bytes)\n`;
    md += `*Total Index Size:* ${formatBytes(totalIndexBytes)} (${totalIndexBytes.toLocaleString()} bytes)\n`;
    md += `*Total Storage:* ${formatBytes(totalDataBytes + totalIndexBytes)} (${(totalDataBytes + totalIndexBytes).toLocaleString()} bytes)\n\n`;

    md += `## 1. Table Storage Overview\n\n`;
    md += `| Table Name | Class | Rows | Data Size | Index Size | Total Size | Indexes |\n`;
    md += `| :--- | :---: | ---: | ---: | ---: | ---: | ---: |\n`;

    for (const stat of tableStats) {
      md += `| \`${stat.tableName}\` | **${stat.tableClass}** | ${stat.rows.toLocaleString()} | ${formatBytes(stat.dataLengthBytes)} | ${formatBytes(stat.indexLengthBytes)} | ${formatBytes(stat.totalLengthBytes)} | ${stat.indexCount} |\n`;
    }

    md += `\n## 2. Per-Index Breakdown\n\n`;
    for (const stat of tableStats) {
      md += `### \`${stat.tableName}\` (Class ${stat.tableClass}) — ${stat.indexCount} index(es)\n\n`;
      if (stat.indexes.length === 0) {
        md += `*No indexes found.*\n\n`;
      } else {
        md += `| Index Name | Unique? | Columns | Cardinality |\n`;
        md += `| :--- | :---: | :--- | ---: |\n`;
        for (const idx of stat.indexes) {
          const isUnique = idx.nonUnique === 0 ? "YES" : "NO";
          const cols = idx.columns.map((c) => `\`${c}\``).join(", ");
          const card = idx.cardinality !== null ? idx.cardinality.toLocaleString() : "N/A";
          md += `| \`${idx.name}\` | ${isUnique} | ${cols} | ${card} |\n`;
        }
        md += `\n`;
      }
    }

    // Print to stdout
    console.log(md);

    // Save to docs/STORAGE_BASELINE.md if requested or if flag is passed
    if (process.argv.includes("--save-baseline")) {
      const baselinePath = path.resolve(process.cwd(), "docs", "STORAGE_BASELINE.md");
      fs.writeFileSync(baselinePath, md, "utf8");
      console.log(`\nBaseline successfully written to ${baselinePath}`);
    }

    return { tableStats, totalDataBytes, totalIndexBytes, totalRows };
  } finally {
    await connection.end();
  }
}

runReport().catch((err) => {
  console.error("Error generating DB report:", err);
  process.exit(1);
});
