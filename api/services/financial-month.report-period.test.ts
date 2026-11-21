import { describe, expect, it } from "vitest";
import { reportPeriod } from "./financial-month";

describe("the period a monthly report covers", () => {
  it("runs from payday to the day before the next payday, and the period before it likewise", () => {
    const period = reportPeriod("2026-10", 25);
    expect([period.current.startDay, period.current.endDay]).toEqual(["2026-10-25", "2026-11-24"]);
    expect([period.previous.startDay, period.previous.endDay]).toEqual(["2026-09-25", "2026-10-24"]);
    expect(period.days).toBe(31);
  });

  it("starts and ends at Cairo midnight", () => {
    const period = reportPeriod("2026-10", 25);
    // Cairo is UTC+3 on October 25th and UTC+2 on November 25th (summer time ends on October 29th).
    expect(period.current.startUtc.toISOString()).toBe("2026-10-24T21:00:00.000Z");
    expect(period.current.endUtc.toISOString()).toBe("2026-11-24T22:00:00.000Z");
    expect(period.previous.endUtc.toISOString()).toBe(period.current.startUtc.toISOString());
  });

  it("is the calendar month without a payday, with the previous period of January in December", () => {
    const period = reportPeriod("2026-01", null);
    expect([period.current.startDay, period.current.endDay]).toEqual(["2026-01-01", "2026-01-31"]);
    expect([period.previous.startDay, period.previous.endDay]).toEqual(["2025-12-01", "2025-12-31"]);
    expect(period.current.startUtc.toISOString()).toBe("2025-12-31T22:00:00.000Z");
    expect(period.days).toBe(31);
  });

  it("counts the days of February", () => {
    expect(reportPeriod("2026-02", 1).days).toBe(28);
    expect(reportPeriod("2028-02", null).days).toBe(29);
  });
});
