import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  One,
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
  getTableColumns,
  is,
} from "drizzle-orm";
import { MySqlTable, getTableConfig } from "drizzle-orm/mysql-core";
import { REPO_ROOT, byKey, compareStrings } from "../lib/util";
import type { TableLookup } from "../lib/project";

export interface ColumnInfo {
  name: string;
  sqlName: string;
  sqlType: string;
  notNull: boolean;
  primary: boolean;
  unique: boolean;
}

export interface IndexInfo {
  name: string;
  unique: boolean;
  columns: string[];
}

export interface TableInfo {
  exportName: string;
  name: string;
  tableClass: string | null;
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreignKeys: number;
  /** Carries the polymorphic (user_id, user_type) ownership pair. */
  dualUserOwnership: boolean;
}

export interface RelationInfo {
  table: string;
  name: string;
  kind: "one" | "many";
  target: string;
  fields: string[];
}

export interface ClassDefinition {
  id: string;
  name: string;
  description: string;
  storageRule: string;
  lifetime: string;
}

export interface DatabaseFacts {
  tables: TableInfo[];
  relations: RelationInfo[];
  classes: ClassDefinition[];
  /** Tables missing from TABLE_CLASSES, and TABLE_CLASSES keys with no table. */
  unclassifiedTables: string[];
  orphanClassEntries: string[];
}

async function importRepoModule(relativePath: string): Promise<Record<string, unknown>> {
  return import(pathToFileURL(path.join(REPO_ROOT, relativePath)).href);
}

export async function extractDatabase(): Promise<DatabaseFacts> {
  const schema = await importRepoModule("db/schema.ts");
  const relationsModule = await importRepoModule("db/relations.ts");
  const classesModule = await importRepoModule("db/table-classes.ts");
  const tableClasses = (classesModule.TABLE_CLASSES ?? {}) as Record<string, string>;
  const classDefinitions = (classesModule.TABLE_CLASS_DEFINITIONS ?? {}) as Record<
    string,
    Omit<ClassDefinition, "id">
  >;

  const tables: TableInfo[] = [];
  for (const [exportName, value] of Object.entries(schema)) {
    if (!is(value, MySqlTable)) continue;
    const config = getTableConfig(value);
    const columns: ColumnInfo[] = Object.entries(getTableColumns(value)).map(([name, column]) => {
      const col = column as unknown as {
        name: string;
        notNull: boolean;
        primary: boolean;
        isUnique: boolean;
        getSQLType(): string;
      };
      return {
        name,
        sqlName: col.name,
        sqlType: col.getSQLType(),
        notNull: Boolean(col.notNull),
        primary: Boolean(col.primary),
        unique: Boolean(col.isUnique),
      };
    });
    const indexes: IndexInfo[] = config.indexes
      .map((index) => {
        const indexConfig = (index as unknown as {
          config: { name: string; unique?: boolean; columns: Array<{ name?: string }> };
        }).config;
        return {
          name: indexConfig.name,
          unique: Boolean(indexConfig.unique),
          columns: indexConfig.columns.map((column) => column?.name ?? "?"),
        };
      })
      .sort(byKey((index) => index.name));
    const sqlNames = new Set(columns.map((column) => column.sqlName));
    tables.push({
      exportName,
      name: config.name,
      tableClass: tableClasses[config.name] ?? null,
      columns,
      indexes,
      foreignKeys: config.foreignKeys.length,
      dualUserOwnership: sqlNames.has("user_id") && sqlNames.has("user_type"),
    });
  }
  tables.sort(byKey((table) => table.name));

  const relationalConfig = extractTablesRelationalConfig(
    { ...schema, ...relationsModule },
    createTableRelationsHelpers,
  );
  const relations: RelationInfo[] = [];
  for (const tableConfig of Object.values(relationalConfig.tables)) {
    for (const [name, relation] of Object.entries(tableConfig.relations)) {
      const isOne = is(relation, One);
      const fields = isOne
        ? ((relation as unknown as { config?: { fields?: Array<{ name: string }> } }).config?.fields ?? []).map(
            (field) => field.name,
          )
        : [];
      relations.push({
        table: tableConfig.dbName,
        name,
        kind: isOne ? "one" : "many",
        target: relation.referencedTableName,
        fields,
      });
    }
  }
  relations.sort((a, b) => compareStrings(a.table, b.table) || compareStrings(a.name, b.name));

  const classes: ClassDefinition[] = Object.entries(classDefinitions)
    .map(([id, definition]) => ({ id, ...definition }))
    .sort(byKey((definition) => definition.id));

  const tableNames = new Set(tables.map((table) => table.name));
  return {
    tables,
    relations,
    classes,
    unclassifiedTables: tables.filter((table) => !table.tableClass).map((table) => table.name),
    orphanClassEntries: Object.keys(tableClasses)
      .filter((name) => !tableNames.has(name))
      .sort(compareStrings),
  };
}

export function buildTableLookup(facts: DatabaseFacts): TableLookup {
  return {
    schemaFile: "db/schema.ts",
    exportToTable: new Map(facts.tables.map((table) => [table.exportName, table.name])),
    tableNames: new Set(facts.tables.map((table) => table.name)),
  };
}
