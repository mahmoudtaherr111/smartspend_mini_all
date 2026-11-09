import { describe, expect, it } from "vitest";
import type { CommitmentRow } from "./commitments";
import { reminderText, remindersDue, stageDays } from "./reminders";
import type { Occurrence } from "./schedule";

const row = (over: Partial<CommitmentRow> = {}): CommitmentRow => ({
  id: 1, kind: "installment", direction: "out", title: "قسط التلاجة", amount: "1500.00", recurrence: "monthly", startDay: "2026-11-12",
  endDay: null, certainty: "confirmed", status: "active", provider: null, catalogSlug: null, beneficiaryContactId: null, beneficiaryName: null,
  paymentMethod: null, gam3eyaTurn: null, category: null, subCategory: null, remindDaysBefore: null, remindHour: null, remindersEnabled: true,
  createdDay: "2026-10-01", ...over,
});
const due = (over: Partial<Occurrence> = {}): Occurrence => ({
  cashflowId: 1, title: "قسط التلاجة", kind: "installment", direction: "out", certainty: "confirmed", dueDay: "2026-11-12",
  effectiveDay: "2026-11-12", amount: 1500, paid: 0, remaining: 1500, status: "due", ...over,
});
const defaults = { daysBefore: 3, hour: 10, followups: 2 };

describe("reminder stages", () => {
  it("falls 3 days before by default, on the day, the day after and weekly twice", () => {
    expect(stageDays("2026-11-12", 3, 2)).toEqual([
      { stage: "before", day: "2026-11-09" }, { stage: "due", day: "2026-11-12" }, { stage: "after", day: "2026-11-13" },
      { stage: "week1", day: "2026-11-20" }, { stage: "week2", day: "2026-11-27" },
    ]);
    expect(stageDays("2026-11-12", 0, 0).map((item) => item.stage)).toEqual(["due", "after"]);
  });

  it("reminds once its day and hour have come, and follows the commitment's own days and hour", () => {
    expect(remindersDue([row()], [due()], { day: "2026-11-09", hour: 9 }, defaults)).toEqual([]);
    expect(remindersDue([row()], [due()], { day: "2026-11-09", hour: 10 }, defaults).map((item) => item.stage)).toEqual(["before"]);
    const own = row({ remindDaysBefore: 10, remindHour: 8 });
    expect(remindersDue([own], [due()], { day: "2026-11-02", hour: 8 }, defaults).map((item) => item.stage)).toEqual(["before"]);
  });

  it("never reminds a paid, skipped or undated date, nor a commitment with reminders off", () => {
    const now = { day: "2026-11-12", hour: 11 };
    expect(remindersDue([row()], [due({ status: "paid", remaining: 0 })], now, defaults)).toEqual([]);
    expect(remindersDue([row()], [due({ status: "skipped" })], now, defaults)).toEqual([]);
    expect(remindersDue([row()], [due({ undated: true })], now, defaults)).toEqual([]);
    expect(remindersDue([row({ remindersEnabled: false })], [due()], now, defaults)).toEqual([]);
    expect(remindersDue([row()], [due({ effectiveDay: "2026-11-15" })], now, defaults).map((item) => item.stage)).toEqual(["before"]);
  });

  it("writes one notification for several dates at once, and names one date with its amount", () => {
    const fridge = { row: row(), occurrence: due(), stage: "due" as const };
    const netflix = { row: row({ id: 2, title: "نتفليكس" }), occurrence: due({ cashflowId: 2, title: "نتفليكس", remaining: 240 }), stage: "due" as const };
    expect(reminderText([fridge, netflix])).toEqual({ title: "عليك 2 حاجات النهارده", body: "قسط التلاجة، نتفليكس · 1,740 ج.م" });
    expect(reminderText([fridge])).toEqual({ title: "ميعاد قسط التلاجة النهارده", body: "1,500 ج.م · لو دفعته دوس «دفعته»." });
  });
});
