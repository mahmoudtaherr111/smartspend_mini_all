import { describe, expect, it } from "vitest";
import { textToTemplate } from "./muscle-memory";

describe("muscle-memory amount normalization", () => {
  it("uses one template for western, Arabic-Indic, and Arabic word amounts", () => {
    const expected = "دفعت كهربا {X}";

    expect(textToTemplate("دفعت كهربا 150")).toBe(expected);
    expect(textToTemplate("دفعت كهربا ١٥٠")).toBe(expected);
    expect(textToTemplate("دفعت كهربا مية وخمسين")).toBe(expected);
  });

  it("preserves multiple amount placeholders so the lookup can reject narration", () => {
    expect(textToTemplate("دفعت كهربا 150 ونت 300")).toBe(
      "دفعت كهربا {X} ونت {X}",
    );
  });
});
