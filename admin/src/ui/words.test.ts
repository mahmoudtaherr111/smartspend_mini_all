import { describe, expect, it } from "vitest";
import { cairoInputToIso, cairoInputValue } from "./words";

describe("times typed in the console are Cairo time", () => {
  it("reads a winter time at UTC+2 and a summer time at UTC+3, whatever the browser's zone", () => {
    expect(cairoInputToIso("2027-12-01T10:00")).toBe("2027-12-01T08:00:00.000Z");
    expect(cairoInputToIso("2027-07-01T10:00")).toBe("2027-07-01T07:00:00.000Z");
  });

  it("shows a stored instant back as the same Cairo wall time", () => {
    expect(cairoInputValue("2027-12-01T08:00:00.000Z")).toBe("2027-12-01T10:00");
    expect(cairoInputValue(cairoInputToIso("2027-07-01T23:30"))).toBe("2027-07-01T23:30");
  });
});
