import { describe, expect, it } from "vitest";
import { renewalReminderDue } from "./subscription-expiry-job";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-09-25T04:00:00Z");
const endingIn = (ms: number) => new Date(now.getTime() + ms);

describe("renewal reminders from a daily job", () => {
  it("reminds three days before and on the last day", () => {
    expect(renewalReminderDue(endingIn(3 * DAY), now)).toBe(3);
    expect(renewalReminderDue(endingIn(2.5 * DAY), now)).toBe(3);
    expect(renewalReminderDue(endingIn(12 * 60 * 60 * 1000), now)).toBe(1);
  });
  it("stays quiet between the reminders, before them and after the end", () => {
    expect(renewalReminderDue(endingIn(1.5 * DAY), now)).toBeNull();
    expect(renewalReminderDue(endingIn(4 * DAY), now)).toBeNull();
    expect(renewalReminderDue(endingIn(-DAY), now)).toBeNull();
  });
  it("sends each reminder on exactly one daily run", () => {
    const end = new Date("2026-10-01T09:30:00Z");
    const runs = Array.from({ length: 10 }, (_, day) => new Date(Date.UTC(2026, 8, 25 + day, 4)));
    const due = runs.map((run) => renewalReminderDue(end, run)).filter(Boolean);
    expect(due).toEqual([3, 1]);
  });
});
