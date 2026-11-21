import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureSignalsRequestSchema } from "../../../contracts/capture-intake";
import { CAPTURE_GATE, holdsCaptureKeyword } from "./intake";

// The phone's filter runs in Kotlin against contracts/capture-fixtures/phone-gate.json; the list the server sends in
// /config, and the server's own check of what arrives, must be the ones those cases were written for.
const fixture = JSON.parse(readFileSync(new URL("../../../contracts/capture-fixtures/phone-gate.json", import.meta.url), "utf8")) as {
  keywords: string[];
  cases: Array<{ name: string; text: string; title?: string; keep: boolean }>;
};

describe("the phone filter's shared cases", () => {
  it("use the keywords the server sends", () => {
    expect(fixture.keywords).toEqual(CAPTURE_GATE.keywords);
  });

  for (const item of fixture.cases) {
    it(`server agrees: ${item.name}`, () => {
      expect(holdsCaptureKeyword(item.title ?? null, item.text)).toBe(item.keep);
    });
  }

  it("are signals the server accepts in shape", () => {
    const signals = fixture.cases.map((item, index) => ({
      id: `fixture-case-${index}`,
      channel: "sms",
      app: "com.example.app",
      sender: "BANK",
      title: item.title ?? null,
      text: item.text,
      postedAt: "2026-10-20T12:00:00.000Z",
    }));
    expect(captureSignalsRequestSchema.safeParse({ signals: signals.slice(0, 10) }).success).toBe(true);
  });
});
