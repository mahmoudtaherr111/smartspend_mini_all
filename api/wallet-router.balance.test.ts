import { describe, expect, it } from "vitest";
import { walletBalanceSchema } from "./wallet-router";

describe("a wallet balance", () => {
  it("reads the ways people type an amount", () => {
    expect(walletBalanceSchema.parse("1500")).toBe("1500");
    expect(walletBalanceSchema.parse(" 1,500.50 ")).toBe("1500.50");
    expect(walletBalanceSchema.parse("١٥٠٠")).toBe("1500");
    expect(walletBalanceSchema.parse("-200")).toBe("-200");
  });

  it("refuses what is not an amount instead of sending it to the database", () => {
    for (const bad of ["abc", "12.345", "1e5", ""]) {
      expect(walletBalanceSchema.safeParse(bad).success).toBe(false);
    }
  });
});
