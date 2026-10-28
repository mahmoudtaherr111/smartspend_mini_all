import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureSignalsRequestSchema } from "../../../contracts/capture-intake";
import { CAPTURE_GATE } from "./intake";

// The phone's filter runs in Kotlin against contracts/capture-fixtures/phone-gate.json; the lists the server sends in
// /config must be the ones those cases were written for.
const fixture = JSON.parse(readFileSync(new URL("../../../contracts/capture-fixtures/phone-gate.json", import.meta.url), "utf8")) as {
  otpWords: string[];
  currencyWords: string[];
  cases: Array<{ name: string; text: string; sender?: string; title?: string; messaging: boolean; drop: string | null }>;
};

describe("the phone filter's shared cases", () => {
  it("use the word lists the server sends", () => {
    expect(fixture.otpWords).toEqual(CAPTURE_GATE.otpWords);
    expect(fixture.currencyWords).toEqual(CAPTURE_GATE.currencyWords);
  });

  it("are signals the server accepts in shape", () => {
    const signals = fixture.cases.map((item, index) => ({
      id: `fixture-case-${index}`,
      channel: item.messaging ? "sms" : "notification",
      app: "com.example.app",
      sender: item.sender ?? null,
      title: item.title ?? null,
      text: item.text,
      postedAt: "2026-10-20T12:00:00.000Z",
    }));
    expect(captureSignalsRequestSchema.safeParse({ signals: signals.slice(0, 10) }).success).toBe(true);
  });
});
