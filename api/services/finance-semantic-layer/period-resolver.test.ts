import { businessDateKey } from "../../lib/app-time";
import { resolveFinancePeriod } from "./period-resolver";

// Periods are Cairo business days (golden rule 6), whatever timezone the server runs in.
const dateKey = (date: Date) => businessDateKey(date, "Africa/Cairo");

describe("finance period resolver", () => {
  it("uses salary cycle for current month when salary day is not day one", () => {
    const period = resolveFinancePeriod(
      { period: "current_month" },
      { salaryDay: 25, referenceDate: new Date("2026-06-15T12:00:00Z") },
    );

    expect(dateKey(period.startDate)).toBe("2026-05-25");
    expect(dateKey(period.endDate)).toBe("2026-06-24");
    expect(period.isSalaryCycle).toBe(true);
  });

  it("resolves today and yesterday as exact one-day periods", () => {
    const today = resolveFinancePeriod(
      { period: "today" },
      { referenceDate: new Date("2026-06-15T12:00:00Z") },
    );
    const yesterday = resolveFinancePeriod(
      { period: "yesterday" },
      { referenceDate: new Date("2026-06-15T12:00:00Z") },
    );

    expect(dateKey(today.startDate)).toBe("2026-06-15");
    expect(dateKey(today.endDate)).toBe("2026-06-15");
    expect(dateKey(yesterday.startDate)).toBe("2026-06-14");
    expect(dateKey(yesterday.endDate)).toBe("2026-06-14");
  });

  it("answers today for Cairo after midnight while UTC is still on yesterday (summer time)", () => {
    // 01:30 in Cairo on 15 June is 22:30 UTC on 14 June.
    const today = resolveFinancePeriod({ period: "today" }, { referenceDate: new Date("2026-06-14T22:30:00Z") });
    const yesterday = resolveFinancePeriod({ period: "yesterday" }, { referenceDate: new Date("2026-06-14T22:30:00Z") });

    expect(today.startDate.toISOString()).toBe("2026-06-14T21:00:00.000Z");
    expect(today.endDate.toISOString()).toBe("2026-06-15T20:59:59.999Z");
    expect(today.key).toBe("today:2026-06-15:2026-06-15:salary_1");
    expect(yesterday.startDate.toISOString()).toBe("2026-06-13T21:00:00.000Z");
    expect(yesterday.endDate.toISOString()).toBe("2026-06-14T20:59:59.999Z");
  });

  it("uses Cairo's winter offset for winter days", () => {
    // 01:30 in Cairo on 11 January is 23:30 UTC on 10 January.
    const today = resolveFinancePeriod({ period: "today" }, { referenceDate: new Date("2026-01-10T23:30:00Z") });

    expect(today.startDate.toISOString()).toBe("2026-01-10T22:00:00.000Z");
    expect(today.endDate.toISOString()).toBe("2026-01-11T21:59:59.999Z");
  });

  it("starts a salary cycle on the salary day in Cairo, not in UTC", () => {
    // 01:30 on 25 June in Cairo: the new cycle has begun although UTC still says the 24th.
    const cycle = resolveFinancePeriod(
      { period: "salary_cycle" },
      { salaryDay: 25, referenceDate: new Date("2026-06-24T22:30:00Z") },
    );

    expect(dateKey(cycle.startDate)).toBe("2026-06-25");
    expect(dateKey(cycle.endDate)).toBe("2026-07-24");
    expect(cycle.daysElapsed).toBe(1);
    expect(cycle.daysTotal).toBe(30);
  });

  it("reads YYYY-MM-DD custom bounds as business calendar days", () => {
    const period = resolveFinancePeriod(
      { period: "custom", startDate: "2025-01-01", endDate: "2025-12-31" },
      { referenceDate: new Date("2026-06-15T12:00:00Z") },
    );

    expect(dateKey(period.startDate)).toBe("2025-01-01");
    expect(dateKey(period.endDate)).toBe("2025-12-31");
    expect(period.daysTotal).toBe(365);
    expect(period.startDate.toISOString()).toBe("2024-12-31T22:00:00.000Z");
  });

  it("clamps the salary day to short months", () => {
    const period = resolveFinancePeriod(
      { period: "salary_cycle" },
      { salaryDay: 31, referenceDate: new Date("2026-03-10T12:00:00Z") },
    );

    expect(dateKey(period.startDate)).toBe("2026-02-28");
    expect(dateKey(period.endDate)).toBe("2026-03-30");
  });

  it("starts the week on Monday in Cairo", () => {
    // Monday 15 June 2026, 00:30 in Cairo, is Sunday 21:30 UTC.
    const week = resolveFinancePeriod({ period: "current_week" }, { referenceDate: new Date("2026-06-14T21:30:00Z") });

    expect(dateKey(week.startDate)).toBe("2026-06-15");
    expect(dateKey(week.endDate)).toBe("2026-06-21");
  });
});
