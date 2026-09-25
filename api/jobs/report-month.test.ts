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
