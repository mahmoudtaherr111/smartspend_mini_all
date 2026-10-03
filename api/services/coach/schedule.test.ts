import { describe, expect, it } from "vitest";
import { cashPosition, dueDays, isCalendarDay, nextPayday, occurrences, type ScheduleRow } from "./schedule";

const row = (over: Partial<ScheduleRow>): ScheduleRow => ({
  id: 1, kind: "rent", direction: "out", title: "إيجار", amount: "4000.00", recurrence: "monthly",
  startDay: "2026-01-31", endDay: null, certainty: "confirmed", status: "active", ...over,
});

describe("dueDays", () => {
  it("rejects impossible days and legacy malformed anchors without normalizing them to another month", () => {
    expect(isCalendarDay("2028-02-29")).toBe(true);
    for (const bad of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-00-01", "bad", "2026-1-01"]) {
      expect(isCalendarDay(bad)).toBe(false);
      expect(dueDays(row({ startDay: bad }), "2026-01-01", "2026-12-31")).toEqual([]);
    }
  });
  it("puts a monthly 31st on the last day of short months and back on the 31st after", () => {
    expect(dueDays(row({}), "2026-01-01", "2026-05-31")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31"]);
    expect(dueDays(row({ startDay: "2027-12-31" }), "2028-02-01", "2028-02-29")).toEqual(["2028-02-29"]);
  });

  it("keeps a yearly 29 February on the 28th in other years", () => {
    expect(dueDays(row({ recurrence: "yearly", startDay: "2024-02-29" }), "2024-01-01", "2028-12-31"))
      .toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  });

  it("steps weekly from the start, once only on its day, and stops at the end day", () => {
    expect(dueDays(row({ recurrence: "weekly", startDay: "2026-09-03" }), "2026-09-10", "2026-09-30")).toEqual(["2026-09-10", "2026-09-17", "2026-09-24"]);
    expect(dueDays(row({ recurrence: "once", startDay: "2026-10-05" }), "2026-09-01", "2026-10-31")).toEqual(["2026-10-05"]);
    expect(dueDays(row({ recurrence: "monthly", startDay: "2026-09-05", endDay: "2026-11-05" }), "2026-09-01", "2027-12-31"))
      .toEqual(["2026-09-05", "2026-10-05", "2026-11-05"]);
  });

  it("has no dates for a schedule whose date is unknown, and none before it starts", () => {
    expect(dueDays(row({ startDay: null }), "2026-01-01", "2026-12-31")).toEqual([]);
    expect(dueDays(row({ startDay: "2026-09-10" }), "2026-08-01", "2026-09-09")).toEqual([]);
  });
});

describe("occurrences", () => {
  it("says paid, partly paid, due and overdue from what was paid toward each date", () => {
    const rows = [row({ id: 1, startDay: "2026-08-01" }), row({ id: 2, title: "قسط", amount: "800.00", startDay: "2026-08-20" })];
    const list = occurrences(rows, [
      { cashflowId: 1, dueDay: "2026-09-01", amount: "4000.00", expenseId: 11 },
      { cashflowId: 2, dueDay: "2026-09-20", amount: "300.00", expenseId: 12 },
    ], "2026-09-01", "2026-10-31", "2026-09-25");
    expect(list.map((o) => [o.cashflowId, o.dueDay, o.status, o.remaining])).toEqual([
      [1, "2026-09-01", "paid", 0],
      [2, "2026-09-20", "partial", 500],
      [1, "2026-10-01", "due", 4000],
      [2, "2026-10-20", "due", 800],
    ]);
    const late = occurrences(rows, [], "2026-09-01", "2026-09-30", "2026-09-25");
    expect(late.map((o) => o.status)).toEqual(["overdue", "overdue"]);
  });

  it("counts two payments toward one date together, without floating-point pennies", () => {
    const list = occurrences([row({ amount: "0.30", startDay: "2026-09-01" })], [
      { cashflowId: 1, dueDay: "2026-09-01", amount: "0.10", expenseId: 1 },
      { cashflowId: 1, dueDay: "2026-09-01", amount: "0.20", expenseId: 2 },
    ], "2026-09-01", "2026-09-01", "2026-09-02");
    expect(list[0]).toMatchObject({ paid: 0.3, remaining: 0, status: "paid" });
  });

  it("takes any payment toward an unknown amount as paying it", () => {
    const list = occurrences([row({ amount: null, startDay: "2026-09-01" })], [
      { cashflowId: 1, dueDay: "2026-09-01", amount: "120.00", expenseId: null },
    ], "2026-09-01", "2026-09-30", "2026-09-10");
    expect(list[0]).toMatchObject({ amount: null, remaining: null, status: "paid" });
  });
});

describe("nextPayday", () => {
  it("is this month's salary day while it is ahead, else next month's, on the last day of a short month", () => {
    expect(nextPayday("2026-09-10", 25)).toBe("2026-09-25");
    expect(nextPayday("2026-09-25", 25)).toBe("2026-10-25");
    expect(nextPayday("2026-01-31", 30)).toBe("2026-02-28");
    expect(nextPayday("2026-12-28", 27)).toBe("2027-01-27");
    expect(nextPayday("2026-09-10", null)).toBeNull();
  });
});

describe("cashPosition", () => {
  const rows = [
    // Added on 1 September with start days in August: August's dates were never tracked.
    row({ id: 1, title: "إيجار", amount: "4000.00", startDay: "2026-08-01", trackedFrom: "2026-09-01" }),
    row({ id: 2, kind: "subscription", title: "نت", amount: "350.00", startDay: "2026-08-20", trackedFrom: "2026-09-01" }),
    row({ id: 3, kind: "school", title: "مدرسة", amount: null, startDay: "2026-09-22" }),
    row({ id: 4, kind: "freelance", direction: "in", title: "شغل حر", amount: "3000.00", startDay: "2026-09-21", recurrence: "once", certainty: "estimated" }),
    row({ id: 5, kind: "debt", direction: "in", title: "أحمد يرجع السلفة", amount: "1500.00", startDay: "2026-09-20", recurrence: "once" }),
    row({ id: 6, kind: "bill", title: "كهربا", amount: "400.00", startDay: null }),
  ];

  it("subtracts only what is due and unpaid before payday; lists unknowns; keeps expected income apart", () => {
    const position = cashPosition({
      today: "2026-09-15",
      salaryDay: 25,
      wallets: [
        { balance: "1800.00", observedAt: new Date("2026-09-10T09:00:00Z") },
        { balance: "6500.00", observedAt: null },
      ],
      rows,
      // The rent was already paid this month: it must not come off twice.
      settlements: [{ cashflowId: 1, dueDay: "2026-09-01", amount: "4000.00", expenseId: 9 }],
      });
    expect(position).toMatchObject({
      until: "2026-09-25",
      untilIsPayday: true,
      days: 10,
      wallets: { total: 8300, count: 2, oldestObservedDay: "2026-09-10", unknownAge: 1 },
      // The internet bill of 20 September; the rent of 1 October is after payday.
      duesKnown: 350,
      incomeConfirmed: 1500,
      incomeEstimated: 3000,
      freeBeforeIncome: 7950,
      freeWithConfirmedIncome: 9450,
    });
    expect(position.duesUnknownAmount.map((o) => o.title)).toEqual(["مدرسة"]);
    expect(position.undated).toEqual([{ title: "كهربا", amount: 400, direction: "out" }]);
  });

  it("never makes a debt of a due date from before the schedule was added: the recent one is unconfirmed", () => {
    const list = occurrences([row({ startDay: "2026-07-01", trackedFrom: "2026-09-12" })], [], "2026-07-01", "2026-10-31", "2026-09-15");
    expect(list.map((o) => [o.dueDay, o.status])).toEqual([["2026-09-01", "unconfirmed"], ["2026-10-01", "due"]]);
    const position = cashPosition({
      today: "2026-09-15", salaryDay: 25, wallets: [], rows: [row({ startDay: "2026-07-01", trackedFrom: "2026-09-12" })], settlements: [],
    });
    expect(position).toMatchObject({ duesKnown: 0, duesUnconfirmed: [{ dueDay: "2026-09-01" }] });
  });

  it("carries an overdue payment into what is owed, and ends at the next month without a payday", () => {
    const position = cashPosition({
      today: "2026-09-15", salaryDay: null, wallets: [], rows: [row({ id: 1, startDay: "2026-09-05" })], settlements: [],
    });
    expect(position).toMatchObject({ until: "2026-10-01", untilIsPayday: false, duesKnown: 4000, freeBeforeIncome: -4000 });
  });
});
