/**
 * Compares a live database with `db/schema.ts` and with the migrations in `db/migrations`, and says what to do.
 *
 *   npm run db:doctor                 read-only report for DATABASE_URL
 *   npm run db:doctor -- --strict     exit 1 when the schema differs or a recorded journal has pending migrations
 *   npm run db:doctor -- --baseline   record every migration as applied, for a database made with
 *                                     drizzle-kit push that already matches the schema (refused otherwise)
 *
 * Why it exists: the migrations did not build the schema until 0027, and a database made with `drizzle-kit push`
 * has no migration journal, so `npm run db:migrate` there tries every migration from the first one and fails.
 * Nobody could tell which of the two a production database was. This reads it: tables, columns (type and NULL),
 * indexes (name, uniqueness, columns) and the `__drizzle_migrations` journal. Defaults are not compared.
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as dotenv from "dotenv";
import mysql from "mysql2/promise";
import { is } from "drizzle-orm";
import { getTableConfig, MySqlTable } from "drizzle-orm/mysql-core";
import * as schema from "../db/schema";

dotenv.config();

const MIGRATIONS_DIR = fileURLToPath(new URL("../db/migrations", import.meta.url));
const JOURNAL_TABLE = "__drizzle_migrations";

type Shape = {
  columns: Map<string, { type: string; nullable: boolean }>;
  indexes: Map<string, { unique: boolean; columns: string }>;
};

/** What `db/schema.ts` declares, in the words information_schema uses. */
function expectedShape(): Map<string, Shape> {
  const tables = new Map<string, Shape>();
  for (const value of Object.values(schema)) {
    if (!is(value, MySqlTable)) continue;
    const config = getTableConfig(value);
    const shape: Shape = { columns: new Map(), indexes: new Map() };
    const primary: string[] = [];
    for (const column of config.columns) {
      const type = column.getSQLType() === "boolean" ? "tinyint(1)" : column.getSQLType();
      shape.columns.set(column.name, { type, nullable: !column.notNull });
      if (column.primary) primary.push(column.name);
      if (column.isUnique) {
        shape.indexes.set(column.uniqueName ?? `${config.name}_${column.name}_unique`, { unique: true, columns: column.name });
      }
    }
    for (const key of config.primaryKeys) primary.push(...key.columns.map((column) => column.name));
    if (primary.length) shape.indexes.set("PRIMARY", { unique: true, columns: primary.join(",") });
    for (const index of config.indexes) {
      const columns = index.config.columns.map((column) => ("name" in column ? column.name : String(column))).join(",");
      shape.indexes.set(index.config.name, { unique: Boolean(index.config.unique), columns });
    }
    for (const unique of config.uniqueConstraints) {
      shape.indexes.set(unique.getName(), { unique: true, columns: unique.columns.map((column) => column.name).join(",") });
    }
    tables.set(config.name, shape);
  }
  return tables;
}

async function actualShape(connection: mysql.Connection): Promise<Map<string, Shape>> {
  const [columns] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT table_name AS t, column_name AS c, column_type AS type, is_nullable AS nullable
       FROM information_schema.columns WHERE table_schema = DATABASE()`,
  );
  const [indexes] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT table_name AS t, index_name AS i, MIN(non_unique) AS non_unique,
            GROUP_CONCAT(column_name ORDER BY seq_in_index) AS columns
       FROM information_schema.statistics WHERE table_schema = DATABASE()
      GROUP BY table_name, index_name`,
  );
  const tables = new Map<string, Shape>();
  const table = (name: string) => {
    if (!tables.has(name)) tables.set(name, { columns: new Map(), indexes: new Map() });
    return tables.get(name)!;
  };
  for (const row of columns) table(row.t).columns.set(row.c, { type: String(row.type), nullable: row.nullable === "YES" });
  for (const row of indexes) table(row.t).indexes.set(row.i, { unique: Number(row.non_unique) === 0, columns: String(row.columns) });
  tables.delete(JOURNAL_TABLE);
  return tables;
}

function compare(expected: Map<string, Shape>, actual: Map<string, Shape>) {
  const problems: string[] = [];
  const extras: string[] = [];
  for (const [name, want] of expected) {
    const have = actual.get(name);
    if (!have) {
      problems.push(`table ${name} is missing`);
      continue;
    }
    for (const [column, spec] of want.columns) {
      const found = have.columns.get(column);
      if (!found) problems.push(`column ${name}.${column} is missing (${spec.type})`);
      else if (found.type !== spec.type || found.nullable !== spec.nullable) {
        const describe = (s: { type: string; nullable: boolean }) => `${s.type} ${s.nullable ? "NULL" : "NOT NULL"}`;
        problems.push(`column ${name}.${column} is ${describe(found)}, the schema says ${describe(spec)}`);
      }
    }
    for (const [index, spec] of want.indexes) {
      const found = have.indexes.get(index);
      if (!found) problems.push(`index ${name}.${index} is missing (${spec.unique ? "unique " : ""}${spec.columns})`);
      else if (found.unique !== spec.unique || found.columns !== spec.columns) {
        problems.push(`index ${name}.${index} is ${found.unique ? "unique " : ""}(${found.columns}), the schema says ${spec.unique ? "unique " : ""}(${spec.columns})`);
      }
    }
    for (const column of have.columns.keys()) if (!want.columns.has(column)) extras.push(`column ${name}.${column}`);
    for (const index of have.indexes.keys()) if (!want.indexes.has(index)) extras.push(`index ${name}.${index}`);
  }
  for (const name of actual.keys()) if (!expected.has(name)) extras.push(`table ${name}`);
  return { problems, extras };
}

type JournalEntry = { idx: number; when: number; tag: string };

function migrationFiles(): Array<JournalEntry & { hash: string }> {
  const journal = JSON.parse(fs.readFileSync(path.join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8")) as { entries: JournalEntry[] };
  return journal.entries.map((entry) => {
    const text = fs.readFileSync(path.join(MIGRATIONS_DIR, `${entry.tag}.sql`), "utf8");
    // The hash drizzle's migrator records for a file.
    return { ...entry, hash: createHash("sha256").update(text).digest("hex") };
  });
}

async function recordedMigrations(connection: mysql.Connection): Promise<number[] | null> {
  const [tables] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
    [JOURNAL_TABLE],
  );
  if (Number(tables[0].n) === 0) return null;
  const [rows] = await connection.query<mysql.RowDataPacket[]>(`SELECT created_at FROM \`${JOURNAL_TABLE}\``);
  return rows.map((row) => Number(row.created_at));
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required.");
    process.exit(2);
  }
  const connection = await mysql.createConnection(url);
  try {
    const { problems, extras } = compare(expectedShape(), await actualShape(connection));
    const files = migrationFiles();
    const recorded = await recordedMigrations(connection);
    const last = recorded?.length ? Math.max(...recorded) : null;
    // drizzle's migrator applies every file newer than the newest recorded one.
    const pending = recorded === null ? files : files.filter((file) => last === null || file.when > last);

    console.log(`Database ${new URL(url).pathname.slice(1)} against db/schema.ts and ${files.length} migrations\n`);
    if (problems.length === 0) console.log("Schema: matches db/schema.ts.");
    else {
      console.log(`Schema: ${problems.length} difference(s) from db/schema.ts:`);
      for (const problem of problems) console.log(`  - ${problem}`);
    }
    if (extras.length) {
      console.log(`\nNot in db/schema.ts (left alone, listed for review): ${extras.length}`);
      for (const extra of extras) console.log(`  - ${extra}`);
    }

    console.log("");
    if (recorded === null || recorded.length === 0) {
      console.log("Migrations: no journal. This database was not built by `npm run db:migrate` (drizzle-kit push, or by hand).");
      console.log("  `npm run db:migrate` here would run every migration from the first one and stop at a table that exists.");
      console.log(
        problems.length === 0
          ? "  The schema matches, so record the migrations as applied: `npm run db:doctor -- --baseline`."
          : "  Bring the schema in line first (the differences above), then run `npm run db:doctor -- --baseline`.",
      );
    } else if (pending.length === 0) {
      console.log(`Migrations: all ${files.length} recorded.`);
    } else {
      console.log(`Migrations: ${pending.length} pending; \`npm run db:migrate\` applies them in order:`);
      for (const file of pending) console.log(`  - ${file.tag}`);
    }

    if (args.has("--baseline")) {
      if (recorded && recorded.length) throw new Error("Refused: this database already has a migration journal; use `npm run db:migrate`.");
      if (problems.length) throw new Error("Refused: the schema differs from db/schema.ts; a baseline would record changes that were never made.");
      await connection.query(
        `CREATE TABLE IF NOT EXISTS \`${JOURNAL_TABLE}\` (id serial primary key, hash text not null, created_at bigint)`,
      );
      for (const file of files) {
        await connection.query(`INSERT INTO \`${JOURNAL_TABLE}\` (hash, created_at) VALUES (?, ?)`, [file.hash, file.when]);
      }
      console.log(`\nBaseline: recorded ${files.length} migrations as applied. From now on use \`npm run db:migrate\`.`);
    }

    const pendingCounts = recorded !== null && recorded.length > 0 && pending.length > 0;
    if (args.has("--strict") && (problems.length > 0 || pendingCounts)) process.exitCode = 1;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
