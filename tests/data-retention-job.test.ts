import { describe, it, expect } from "vitest";
import {
  runDataRetentionJob,
  RETENTION_POLICIES,
} from "../api/jobs/data-retention-job";
import { TABLE_CLASSES } from "../db/table-classes";

describe("Data Retention & Lifecycle (P4)", () => {
  it("defines explicit retention policies adhering to table classification rules", () => {
    expect(RETENTION_POLICIES.length).toBeGreaterThanOrEqual(10);

    for (const policy of RETENTION_POLICIES) {
      const assignedClass = TABLE_CLASSES[policy.tableName];
      expect(
        assignedClass,
        `Table ${policy.tableName} must have a valid class in db/table-classes.ts`,
      ).toBeDefined();

      // Ensure no Class A (Identity/Config) or Class B (Core Ledger) is pruned
      expect(assignedClass).not.toBe("A");
      expect(assignedClass).not.toBe("B");
      expect(["E", "G", "D"]).toContain(assignedClass);

      expect(policy.retainDays).toBeGreaterThanOrEqual(7);
      expect(policy.dateColumn).toBeTruthy();
    }
  });

  it("runs in dry-run mode without modifying data and reports counts (P4 Gate)", async () => {
    const result = await runDataRetentionJob({ dryRun: true });

    expect(result.dryRun).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.results.length).toBe(RETENTION_POLICIES.length);

    for (const tableRes of result.results) {
      expect(tableRes.dryRun).toBe(true);
      expect(typeof tableRes.prunedCount).toBe("number");
      expect(tableRes.prunedCount).toBeGreaterThanOrEqual(0);
      expect(tableRes.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});
