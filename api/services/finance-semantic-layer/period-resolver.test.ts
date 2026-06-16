import { resolveFinancePeriod } from "./period-resolver";

function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

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
});
