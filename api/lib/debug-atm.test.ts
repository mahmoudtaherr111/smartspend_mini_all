import { describe, it, expect } from "vitest";
import { detectIntent } from "./intent-detector";

describe("ATM intent debug", () => {
  it("سحبت من ATM → transfer", () => {
    const r = detectIntent("سحبت من ATM 2000");
    console.log("Intent:", r.intent, "Scores:", r);
    expect(r.intent).toBe("transfer");
  });
  it("سحبت من atm → transfer (lowercase)", () => {
    const r = detectIntent("سحبت من atm 2000");
    console.log("Intent:", r.intent, "Scores:", r);
    expect(r.intent).toBe("transfer");
  });
});
