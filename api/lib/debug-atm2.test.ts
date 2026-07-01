import { describe, it, expect } from "vitest";
import { runRuleEngine } from "./rule-engine";

describe("ATM rule engine debug", () => {
  it("سحبت من ATM 2000 → should be transfer/تحويل/سحب ATM", async () => {
    const r = await runRuleEngine("سحبت من atm 2000");
    console.log("Items:", JSON.stringify(r.items, null, 2));
    console.log("needsAI:", r.needsAI);
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items[0].category).toBe("تحويل");
    expect(r.items[0].type).toBe("transfer");
  });
});
