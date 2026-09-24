import { describe, expect, it } from "vitest";
import { reportPoints } from "./reports";

describe("reportPoints", () => {
  it("keeps the first real sentences of a report, without markdown, headings or numbering", () => {
    const text = "## ملخص الشهر\n\n1. **صرفك على الأكل برّه** زاد لحد 1500 جنيه عن الشهر اللي فات.\n- المواصلات ثابتة تقريباً على 600 جنيه.\n- نصيحة: حط حد أسبوعي للطلبات عشان توفر.\n- نقطة رابعة مش هتتقري.";
    expect(reportPoints(text)).toEqual([
      "صرفك على الأكل برّه زاد لحد 1500 جنيه عن الشهر اللي فات.",
      "المواصلات ثابتة تقريباً على 600 جنيه.",
      "نصيحة: حط حد أسبوعي للطلبات عشان توفر.",
    ]);
  });

  it("cuts a long sentence short", () => {
    const [point] = reportPoints("كلام ".repeat(60));
    expect(point.length).toBeLessThanOrEqual(140);
    expect(point.endsWith("…")).toBe(true);
  });
});
