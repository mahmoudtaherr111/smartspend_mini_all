import { describe, expect, it } from "vitest";
import { reportWaitDays, reportWaitMessage } from "./report-wait";

describe("the wait between two AI reports", () => {
  it("uses the plan's default until the admin sets one", () => {
    expect(reportWaitDays({}, "free")).toBe(30);
    expect(reportWaitDays({}, "pro")).toBe(14);
    expect(reportWaitDays({}, "ultra")).toBe(1);
    expect(reportWaitDays({}, undefined)).toBe(30);
    expect(reportWaitDays({}, "unknown")).toBe(30);
  });

  it("follows the admin's number, and 0 turns the wait off", () => {
    expect(reportWaitDays({ report_limit_pro: "7" }, "pro")).toBe(7);
    expect(reportWaitDays({ report_limit_pro: "0" }, "pro")).toBe(0);
    expect(reportWaitDays({ report_limit_pro: "abc" }, "pro")).toBe(14);
    expect(reportWaitDays({ report_limit_pro: "" }, "pro")).toBe(14);
  });

  it("tells the user in Arabic how long is left, with the noun agreeing", () => {
    expect(reportWaitMessage(1)).toContain("يوم واحد");
    expect(reportWaitMessage(2)).toContain("يومين");
    expect(reportWaitMessage(5)).toContain("5 أيام");
    expect(reportWaitMessage(5)).not.toMatch(/[A-Z]/);
  });
});
