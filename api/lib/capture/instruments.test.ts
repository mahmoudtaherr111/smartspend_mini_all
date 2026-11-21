import { describe, expect, it } from "vitest";
import { prepareCaptureText } from "./privacy";
import { localInstruments, primaryInstrument } from "./instruments";

function prepared(text: string) {
  const result = prepareCaptureText(text);
  if (!result.ok) throw new Error("synthetic preparation");
  return result.value;
}
describe("private instrument roles", () => {
  it("keeps three-digit card/account tails out of the provider text", () => {
    for (const text of ["Paid EGP 85 with card 234", "Paid EGP 85 with card ending ٢٣٤", "Paid EGP 85 from account no. 234", "Paid EGP 85 with ***234"]) {
      const value = prepared(text);
      expect(value.text).not.toMatch(/234|٢٣٤/);
      expect(value.text).toContain("85");
    }
  });
  it("selects the funding account instead of a recipient card", () => {
    const value = prepared("Sent EGP 85 from account no. 12345678 to card ending 4821.");
    expect(primaryInstrument(value, "out", "transfer")).toMatchObject({ kind: "account", suffix: "12345678" });
    expect(primaryInstrument(value, "in", "transfer")).toMatchObject({ kind: "card", suffix: "4821" });
  });
  it("does not turn a reference ending into a wallet", () => {
    const value = prepared("Paid EGP 85. Reference ending 4821.");
    expect(localInstruments(value)).toEqual([]);
    expect(primaryInstrument(value, "out", "purchase")).toBeNull();
  });
  it("leaves ambiguous instruments unassigned", () => {
    const value = prepared("Paid EGP 85 with card 4821 and card 5678.");
    expect(primaryInstrument(value, "out", "purchase")).toBeNull();
  });
  it("withholds a partially masked number instead of offering its decimal fragment as a payment", () => {
    const result = prepareCaptureText("Paid from card ending 234.50 EGP.");
    expect(result).toMatchObject({ ok: false, codes: expect.arrayContaining(["numeric_fragment"]) });
    const ordinary = prepared("Paid by card 234.50 EGP.");
    expect(ordinary.text).toContain("234.50");
  });
});
