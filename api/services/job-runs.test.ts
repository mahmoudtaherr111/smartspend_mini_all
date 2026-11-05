import { beforeEach, describe, expect, it, vi } from "vitest";

const inserted: unknown[] = [];
const insert = vi.fn(() => ({ values: (row: unknown) => { inserted.push(row); return Promise.resolve(); } }));
vi.mock("../queries/connection", () => ({ db: { insert: (...args: unknown[]) => insert(...(args as [])) } }));

const { cronIntervalMinutes, errorClass, recordJobRun } = await import("./job-runs");

describe("what a background job's run leaves behind", () => {
  beforeEach(() => {
    inserted.length = 0;
    insert.mockClear();
  });

  it("records a failure by the error's class, never its message", async () => {
    const error = Object.assign(new Error("Duplicate entry '01012345678' for key 'phone'"), { code: "ER_DUP_ENTRY" });
    await recordJobRun({ jobName: "whatsapp-outbox", startedAt: new Date("2026-11-05T10:00:00Z"), durationMs: 12.4, error });
    expect(inserted[0]).toMatchObject({ jobName: "whatsapp-outbox", status: "failed", errorName: "ER_DUP_ENTRY", durationMs: 12 });
    expect(JSON.stringify(inserted[0])).not.toContain("0101234");
    expect(errorClass(new TypeError("x"))).toBe("TypeError");
  });

  it("never breaks the job when the run cannot be written", async () => {
    insert.mockImplementationOnce(() => { throw new Error("Table 'scheduled_job_runs' doesn't exist"); });
    await expect(recordJobRun({ jobName: "capture-ai-sweep", startedAt: new Date(), durationMs: 5 })).resolves.toBeUndefined();
  });

  it("reads the intervals of the schedules this server uses, and guesses no other", () => {
    expect(cronIntervalMinutes("* * * * *")).toBe(1);
    expect(cronIntervalMinutes("*/15 * * * *")).toBe(15);
    expect(cronIntervalMinutes("0 20 * * *")).toBe(1440);
    expect(cronIntervalMinutes("0 3 * * 0")).toBe(10080);
    expect(cronIntervalMinutes("0 2 1 * *")).toBe(44640);
    expect(cronIntervalMinutes("0 9-17 * * 1-5")).toBeNull();
  });
});
