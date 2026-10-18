import { describe, expect, it } from "vitest";
import { dailyAverageDays } from "./expense-router";

// October 2026 in Cairo: from midnight on the 1st (UTC+3) to midnight on November 1st.
const start = new Date("2026-09-30T21:00:00.000Z");
const end = new Date("2026-10-31T22:00:00.000Z");

describe("the days a month's daily average divides by", () => {
  it("counts the days of the month so far for an account older than the month", () => {
    const firstEntryEver = new Date("2025-01-10T09:00:00.000Z");
    // 3 October at noon in Cairo: the third day.
    expect(dailyAverageDays(start, end, firstEntryEver, new Date("2026-10-03T09:00:00.000Z"))).toBe(3);
  });

  it("counts from the first entry when the account started this month", () => {
    const firstEntry = new Date("2026-10-10T00:00:00.000Z");
    expect(dailyAverageDays(start, end, firstEntry, new Date("2026-10-15T09:00:00.000Z"))).toBe(6);
  });

  it("counts the whole month once it is over, 31 days for October", () => {
    const firstEntryEver = new Date("2025-01-10T09:00:00.000Z");
    expect(dailyAverageDays(start, end, firstEntryEver, new Date("2026-12-01T09:00:00.000Z"))).toBe(31);
  });
});
