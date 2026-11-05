import { describe, expect, it } from "vitest";
import { SETTING_KEYS, settingDefaults } from "../../../api/lib/system-settings-registry";
import { CHOICES, LABELS, READ_ONLY } from "./AllSettings";

describe("the console's words for server settings", () => {
  it("names only settings the server has", () => {
    const unknown = [...Object.keys(LABELS), ...Object.keys(CHOICES), ...READ_ONLY].filter((key) => !SETTING_KEYS.has(key));
    expect(unknown).toEqual([]);
  });

  it("offers each choice setting its own default among the choices", () => {
    const defaults = settingDefaults();
    const missing = Object.entries(CHOICES)
      .filter(([key, options]) => defaults[key] && !options.some(([value]) => value === defaults[key]))
      .map(([key]) => `${key}=${defaults[key]}`);
    expect(missing).toEqual([]);
  });
});
