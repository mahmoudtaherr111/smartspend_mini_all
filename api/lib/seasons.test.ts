import { describe, expect, it } from "vitest";
import { hijriOf, latestSeasonRange, seasonRange } from "./seasons";

describe("Egyptian seasons", () => {
  it("places Ramadan 1447 in February-March 2026", () => {
    const range = seasonRange("ramadan", 2026, "Africa/Cairo")!;
    expect(hijriOf(range.startDay)).toEqual({ month: 9, day: 1 });
    expect(range.startDay.startsWith("2026-02")).toBe(true);
    expect(range.endDay.startsWith("2026-03")).toBe(true);
    expect(hijriOf(range.endDay).month).toBe(9);
  });

  it("gives Eid al-Fitr its three days, right after Ramadan", () => {
    const ramadan = seasonRange("ramadan", 2026, "Africa/Cairo")!;
    const eid = seasonRange("eid_fitr", 2026, "Africa/Cairo")!;
    expect(hijriOf(eid.startDay)).toEqual({ month: 10, day: 1 });
    expect(Date.parse(eid.startDay) - Date.parse(ramadan.endDay)).toBe(86_400_000);
    expect((Date.parse(eid.endDay) - Date.parse(eid.startDay)) / 86_400_000).toBe(2);
  });

  it("bounds a season by Cairo days, end exclusive", () => {
    const summer = seasonRange("summer", 2026, "Africa/Cairo")!;
    // Cairo is UTC+3 in summer: its first of June starts at 21:00 UTC the day before.
    expect(summer.start.toISOString()).toBe("2026-05-31T21:00:00.000Z");
    expect(summer.endExclusive.toISOString()).toBe("2026-08-31T21:00:00.000Z");
  });

  it("answers with last year's season when this year's has not started", () => {
    const range = latestSeasonRange("school", new Date("2026-05-01T12:00:00Z"), "Africa/Cairo")!;
    expect(range.startDay).toBe("2025-09-01");
  });
});
