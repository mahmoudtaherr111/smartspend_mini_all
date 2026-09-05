import { describe, it, expect } from "vitest";
import * as schema from "../db/schema";
import { TABLE_CLASSES, TABLE_CLASS_DEFINITIONS, TableClass } from "../db/table-classes";
import { getTableName, is } from "drizzle-orm";
import { MySqlTable } from "drizzle-orm/mysql-core";

describe("Table Classes Architecture (P0 & P4 Guard)", () => {
  it("assigns a valid class (A-G) to every table defined in db/schema.ts", () => {
    const validClasses: TableClass[] = ["A", "B", "C", "D", "E", "F", "G"];
    const tablesInSchema: string[] = [];

    for (const [, value] of Object.entries(schema)) {
      if (is(value, MySqlTable)) {
        const tableName = getTableName(value);
        tablesInSchema.push(tableName);
      }
    }

    expect(tablesInSchema.length).toBeGreaterThanOrEqual(52);

    const missingTables: string[] = [];
    const invalidClassTables: string[] = [];

    for (const tableName of tablesInSchema) {
      const assignedClass = TABLE_CLASSES[tableName];
      if (!assignedClass) {
        missingTables.push(tableName);
      } else if (!validClasses.includes(assignedClass)) {
        invalidClassTables.push(`${tableName} has invalid class: ${assignedClass}`);
      }
    }

    expect(
      missingTables,
      `Tables missing a storage class definition in db/table-classes.ts: ${missingTables.join(", ")}. Every table must be explicitly classified!`,
    ).toEqual([]);

    expect(invalidClassTables).toEqual([]);
  });

  it("ensures every class definition has valid metadata", () => {
    const classes: TableClass[] = ["A", "B", "C", "D", "E", "F", "G"];
    for (const cls of classes) {
      const def = TABLE_CLASS_DEFINITIONS[cls];
      expect(def).toBeDefined();
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.lifetime).toBeTruthy();
      expect(def.storageRule).toBeTruthy();
    }
  });
});
