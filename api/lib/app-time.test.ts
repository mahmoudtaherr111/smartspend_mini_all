import { describe, expect, it } from "vitest";
import { businessDateKey, businessDayRange, businessMonthRange } from "./app-time";

const CAIRO = "Africa/Cairo";

describe("business time boundaries", () => {
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
