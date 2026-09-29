import { describe, expect, it } from "vitest";
import { businessDateKey, businessDayRange, businessMonthRange, businessTimeLabel, parseBusinessInstant } from "./app-time";

const CAIRO = "Africa/Cairo";

describe("business time boundaries", () => {
  it("labels a moment with Cairo's date and clock, past midnight included", () => {
    expect(businessTimeLabel(new Date("2026-01-15T21:59:00.000Z"), CAIRO)).toBe("2026-01-15 23:59");
    expect(businessTimeLabel(new Date("2026-01-15T22:05:00.000Z"), CAIRO)).toBe("2026-01-16 00:05");
  });

  it("keeps records either side of Cairo midnight in different business days", () => {
    expect(businessDateKey(new Date("2026-01-15T21:59:59.999Z"), CAIRO)).toBe("2026-01-15");
    expect(businessDateKey(new Date("2026-01-15T22:00:00.000Z"), CAIRO)).toBe("2026-01-16");
  });

  it("ends the day at the immediately following local midnight even at 23:59", () => {
    const range = businessDayRange(new Date("2026-01-15T21:59:59.999Z"), CAIRO);

    expect(range.start.toISOString()).toBe("2026-01-14T22:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe("2026-01-15T22:00:00.000Z");
  });

  it("uses half-open month ranges in the business timezone", () => {
    const range = businessMonthRange(new Date("2026-01-15T12:00:00.000Z"), CAIRO);

    expect(range.start.toISOString()).toBe("2025-12-31T22:00:00.000Z");
    expect(range.endExclusive.toISOString()).toBe("2026-01-31T22:00:00.000Z");
  });
});

describe("a date the client wrote without a time zone", () => {
  it("is Cairo wall-clock time, not the server's", () => {
    // Cairo is UTC+3 in September (summer time) and UTC+2 in January.
    expect(parseBusinessInstant("2026-09-20T00:00:00.000", "Africa/Cairo").toISOString()).toBe("2026-09-19T21:00:00.000Z");
    expect(parseBusinessInstant("2026-09-20T23:59:59.999", "Africa/Cairo").toISOString()).toBe("2026-09-20T20:59:59.999Z");
    expect(parseBusinessInstant("2026-01-10", "Africa/Cairo").toISOString()).toBe("2026-01-09T22:00:00.000Z");
  });

  it("keeps a string that names its instant", () => {
    expect(parseBusinessInstant("2026-09-20T10:00:00Z", "Africa/Cairo").toISOString()).toBe("2026-09-20T10:00:00.000Z");
    expect(parseBusinessInstant("2026-09-20T10:00:00+02:00", "Africa/Cairo").toISOString()).toBe("2026-09-20T08:00:00.000Z");
  });
});
