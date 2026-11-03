// Every setting an admin can save is read by the server. A setting nobody reads is a switch in the console that
// does nothing when flipped, which is how "I change it and nothing changes" happened.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SETTING_KEYS } from "../../api/lib/system-settings-registry";

function sources(dir: string, extensions = [".ts"]): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path, extensions);
    const tested =
      /\.test\.tsx?$/.test(path) ||
      path.endsWith("system-settings-registry.ts");
    return extensions.some((extension) => path.endsWith(extension)) && !tested
      ? [path]
      : [];
  });
}

describe("system settings", () => {
  it("are each read by server code", () => {
    const code = [...sources("api"), ...sources("contracts")]
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    // Keys built in code: `${plan}_stt_model`, `chatbot_enabled_${plan}`, and the plan helpers of contracts/plan-features.ts.
    const suffixes = new Set(
      [...code.matchAll(/\$\{[^}]+\}_([a-z0-9_]+)/g)].map((match) => match[1]),
    );
    const prefixes = new Set(
      [...code.matchAll(/([a-z0-9_]+)_\$\{/g)].map((match) => match[1]),
    );
    const planHelpers = /PLAN_NUMBER_DEFAULTS|PLAN_FEATURE_DEFAULTS/.test(code)
      ? [...code.matchAll(/^\s{2}([a-z_]+): \{ free:/gm)].map(
          (match) => match[1],
        )
      : [];
    const plans = ["free", "pro", "ultra"];
    const unread = [...SETTING_KEYS].filter((key) => {
      if (
        code.includes(`"${key}"`) ||
        code.includes(`'${key}'`) ||
        code.includes(`.${key}`) ||
        code.includes(`\`${key}\``)
      )
        return false;
      // A family read as `prefix_${name}`, such as the AI switches `ai_off_${name}`.
      if ([...prefixes].some((prefix) => key.startsWith(`${prefix}_`)))
        return false;
      const plan = plans.find(
        (p) => key.startsWith(`${p}_`) || key.endsWith(`_${p}`),
      );
      if (
        plan &&
        key.startsWith(`${plan}_`) &&
        suffixes.has(key.slice(plan.length + 1))
      )
        return false;
      if (plan && key.endsWith(`_${plan}`)) {
        const stem = key.slice(0, -plan.length - 1);
        if (
          prefixes.has(stem) ||
          planHelpers.includes(stem) ||
          stem.startsWith("feature_")
        )
          return false;
      }
      return true;
    });
    expect(unread).toEqual([]);
  });

  // `updateSettings` keeps only registry keys, so a field outside the registry looks saved and is dropped.
  it("edited by an admin screen are each in the registry", () => {
    const screens = [
      ...sources("src/components/admin", [".tsx", ".ts"]),
      ...sources("admin/src", [".tsx", ".ts"]),
    ];
    const keys = new Set(SETTING_KEYS as readonly string[]);
    const dropped: string[] = [];
    let checked = 0;
    for (const file of screens) {
      for (const match of readFileSync(file, "utf8").matchAll(
        /updateField\(\s*([`"'])([^`"']+)\1/g,
      )) {
        const field = match[2];
        checked += 1;
        const pattern = new RegExp(
          `^${field.replace(/\$\{[^}]+\}/g, "[a-z0-9_]+")}$`,
        );
        if (
          !(field.includes("${")
            ? [...keys].some((key) => pattern.test(key))
            : keys.has(field))
        )
          dropped.push(`${file}: ${field}`);
      }
    }
    expect(checked).toBeGreaterThan(20);
    expect(dropped).toEqual([]);
  });
});
