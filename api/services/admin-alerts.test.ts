import { beforeEach, describe, expect, it, vi } from "vitest";

const state = new Map<string, string>();
vi.mock("../lib/redis-client", () => ({
  stateGet: async (key: string) => state.get(key) ?? null,
  stateSet: async (key: string, _ttl: number, value: string) => { state.set(key, value); },
}));
vi.mock("../queries/connection", () => ({ getDb: () => ({}), db: {}, mysqlPool: {} }));
const jobs = { recorded: true, jobs: [] as Array<Record<string, unknown>> };
const checks = { checks: [] as Array<{ id: string; state: string; facts: object }>, process: {} };
vi.mock("./job-runs", () => ({ loadJobOverview: async () => jobs }));
vi.mock("./server-status", () => ({ loadServerStatus: async () => checks }));

const alerts = await import("./admin-alerts");

describe("what reaches the admins", () => {
  beforeEach(() => {
    state.clear();
  });

  it("alerts on a failing server check only when it fails twice in a row, then stays quiet", async () => {
    checks.checks = [{ id: "push", state: "fail", facts: {} }];
    jobs.jobs = [];
    const notify = vi.fn(async () => 1);
    const run = () => watchWith(notify);
    await run();
    expect(notify).not.toHaveBeenCalled();
    await run();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("alerts on a late job and on a failed one", async () => {
    checks.checks = [];
    jobs.jobs = [
      { jobName: "whatsapp-outbox", late: true, lastStatus: "ok" },
      { jobName: "capture-ai-sweep", late: false, lastStatus: "failed", lastErrorName: "ER_LOCK_DEADLOCK" },
      { jobName: "daily-auth-cleanup", late: false, lastStatus: "ok" },
    ];
    const notify = vi.fn(async () => 1);
    await watchWith(notify);
    expect(notify.mock.calls.map((call) => call[2])).toEqual(["job-late:whatsapp-outbox", "job-failed:capture-ai-sweep"]);
  });
});

/** Runs one pass with the admin notification replaced, so nothing is written. */
function watchWith(notify: (...args: unknown[]) => Promise<number>) {
  return alerts.watchOperations(new Date("2026-11-05T12:00:00Z"), notify as never);
}
