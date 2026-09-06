import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LEDGER_WAIT_MS,
  recordClassificationUsage,
} from "./classification-usage-ledger";
import type { PipelineInput, PipelineResult } from "../lib/smart-pipeline";

const io = vi.hoisted(() => ({ insert: vi.fn() }));
vi.mock("../queries/connection", () => ({
  db: { insert: () => ({ values: io.insert }) },
}));
vi.mock("../lib/settings-cache", () => ({
  getSystemSettings: async () => ({}),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ledger response budget", () => {
  it("returns while a slow insert remains pending, then completes it exactly once", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let finish!: () => void;
    io.insert.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const result = { log: {}, processingTimeMs: 10 } as PipelineResult;
    let returned = false;
    const pending = recordClassificationUsage(
      { userId: 7, userType: "oauth" } as PipelineInput,
      result,
    ).then(() => {
      returned = true;
    });
    await vi.advanceTimersByTimeAsync(LEDGER_WAIT_MS - 1);
    expect(returned).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(returned).toBe(true);
    expect(result.usageOperationId).toBeTruthy();
    expect(warn).toHaveBeenCalledWith(
      "[ClassificationUsage] Ledger write pending beyond response budget",
    );
    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(io.insert).toHaveBeenCalledTimes(1);
  });
});
