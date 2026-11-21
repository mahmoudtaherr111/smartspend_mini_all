import { describe, expect, it } from "vitest";
import { reportMonthFor } from "./monthly-report-job";

describe("the month a scheduled report describes", () => {
  it("is the month that just ended, in Cairo time", () => {
    // 02:00 Cairo on October 1st is still September 30th in UTC.
    expect(reportMonthFor(new Date("2026-09-30T23:00:00Z"))).toBe("2026-09");
    expect(reportMonthFor(new Date("2026-10-15T10:00:00Z"))).toBe("2026-09");
  });
  it("crosses the year", () => {
    expect(reportMonthFor(new Date("2027-01-01T08:00:00Z"))).toBe("2026-12");
  });
});

describe("the month the behaviour snapshot job describes", () => {
  it("is the Cairo month that ended, though 01:00 Cairo on the 1st is still the last day in UTC", async () => {
    const { previousBusinessMonth } = await import("../lib/app-time");
    // 01:00 Cairo on November 1st (winter time, UTC+2) is 23:00 UTC on October 31st.
    expect(previousBusinessMonth(new Date("2026-10-31T23:00:00Z"))).toBe("2026-10");
    // 01:00 Cairo on October 1st (summer time, UTC+3) is 22:00 UTC on September 30th.
    expect(previousBusinessMonth(new Date("2026-09-30T22:00:00Z"))).toBe("2026-09");
  });
});
