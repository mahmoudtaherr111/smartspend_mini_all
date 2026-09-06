/**
 * The guard that makes the manifest a decision rather than a snapshot.
 *
 * A list of test files copied by hand decays silently: someone adds a guard for the
 * number engine, nobody adds it here, and the verification command keeps passing while
 * covering less of the thing it claims to cover. That is exactly what happened to the
 * first version — 19 files listed, 17 more in the repository exercising the same
 * modules, none of them in any CI job.
 *
 * So this reads the repository, works out which test files import the classification
 * surface, and fails when one of them is in neither `INCLUDED` nor `EXCLUDED`. Adding a
 * guard now forces a choice, and the choice is written down.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXCLUDED,
  INCLUDED,
  importsScope,
  includedFiles,
  NEUTRALISED_PROVIDER_KEYS,
  SCOPE_MODULES,
} from "./classification-test-manifest";

const ROOT = resolve(import.meta.dirname, "..", "..");

/** Every tracked test file, plus any untracked one that already exists on disk. */
function repositoryTestFiles(): string[] {
  const tracked = execFileSync(
    "git",
    ["ls-files", "*.test.ts", "*.test.tsx", "*.spec.ts"],
    { cwd: ROOT, encoding: "utf8" },
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  // A file added but not yet committed is exactly the case this guard exists for.
  const untracked = execFileSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "*.test.ts", "*.test.tsx", "*.spec.ts"],
    { cwd: ROOT, encoding: "utf8" },
  )
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return [...new Set([...tracked, ...untracked])]
    .filter((file) => !file.startsWith("tests/e2e/"))
    .sort();
}

const IMPORT_PATTERN = /from\s+["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']/g;

function importsOf(file: string): string[] {
  const source = readFileSync(resolve(ROOT, file), "utf8");
  return [...source.matchAll(IMPORT_PATTERN)].map((match) => match[1] || match[2]);
}

const REPOSITORY_FILES = repositoryTestFiles();
const IN_SCOPE = REPOSITORY_FILES.filter((file) => importsOf(file).some(importsScope));

describe("the manifest matches the repository", () => {
  it("lists every test file that imports the classification surface", () => {
    const decided = new Set([...INCLUDED, ...EXCLUDED.map((entry) => entry.file)]);
    const undecided = IN_SCOPE.filter((file) => !decided.has(file));

    expect(
      undecided,
      undecided.length === 0
        ? ""
        : `These test files exercise the classification surface and are in neither INCLUDED ` +
          `nor EXCLUDED in api/qa/classification-test-manifest.ts. Add each one to the ` +
          `command, or exclude it with a written reason:\n  ${undecided.join("\n  ")}`,
    ).toEqual([]);
  });

  it("does not list a file that no longer exists", () => {
    const missing = INCLUDED.filter((file) => !existsSync(resolve(ROOT, file)));
    expect(missing, `listed but absent: ${missing.join(", ")}`).toEqual([]);
  });

  it("does not include a file that is out of scope", () => {
    // Widening the command by adding an unrelated suite would make it slower without
    // making it a better guard, and would drag its dependencies into an offline job.
    const strays = INCLUDED.filter((file) => !IN_SCOPE.includes(file));
    expect(strays, `included but does not import the surface: ${strays.join(", ")}`).toEqual([]);
  });

  it("gives every exclusion a reason", () => {
    for (const entry of EXCLUDED) {
      expect(entry.reason.length, `${entry.file} has no reason`).toBeGreaterThan(20);
    }
  });

  it("keeps the npm script in step with the manifest", () => {
    // Two lists that must agree, one of which is a JSON string — so they are compared
    // rather than trusted.
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const script = pkg.scripts["test:classification:core"];
    expect(script, "test:classification:core is missing from package.json").toBeTruthy();

    const scriptFiles = script
      .split(/\s+/)
      .filter((token) => token.endsWith(".test.ts") || token.endsWith(".test.tsx"))
      .sort();
    expect(scriptFiles).toEqual(includedFiles());
  });
});

describe("the included set stays offline", () => {
  /**
   * A file that mocks fetch protects itself. It says nothing about the file beside it,
   * and the review's warning about broad globs is exactly this: a list that grows by
   * pattern can pull in a suite that talks to a real service.
   */
  it("has no test that reaches a live provider or a real database", () => {
    const offenders: string[] = [];

    for (const file of INCLUDED) {
      const source = readFileSync(resolve(ROOT, file), "utf8");

      const usesConnection = /["']\.{1,2}\/.*queries\/connection["']/.test(source);
      const mocksConnection = /vi\.mock\(\s*["'][^"']*queries\/connection["']/.test(source);
      if (usesConnection && !mocksConnection) {
        offenders.push(`${file}: imports queries/connection without mocking it`);
      }

      // An integration suite is opt-in behind an env flag and belongs to test:redis.
      if (/RUN_[A-Z_]*INTEGRATION/.test(source)) {
        offenders.push(`${file}: is an opt-in integration suite`);
      }

    }

    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("blanks every provider key before the suite starts", () => {
    // The property that actually keeps the run free. `vitest.config.ts` loads the
    // developer's `.env`, and `e2e-classification.test.ts` legitimately reads
    // FIREWORKS_API_KEY and hands it to the embedding engine — so without this the
    // "offline" suite would make a paid call on any machine that has a real key.
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    const script = pkg.scripts["test:classification:core"];
    for (const key of NEUTRALISED_PROVIDER_KEYS) {
      expect(script, `${key} is not blanked by the command`).toContain(`${key}=`);
    }
  });

  it("names the files that read a provider key, so the list stays deliberate", () => {
    const readers = INCLUDED.filter((file) =>
      /process\.env\.[A-Z_]*API_KEY/.test(readFileSync(resolve(ROOT, file), "utf8")),
    );
    // Not forbidden — recorded. A new one appearing is a prompt to check that the key it
    // reads is in NEUTRALISED_PROVIDER_KEYS.
    expect(readers).toEqual(["api/lib/e2e-classification.test.ts"]);
  });

  it("covers the guards the review found missing", () => {
    // Named explicitly: these are the surfaces whose absence made the first command
    // weaker than it looked. A refactor that drops one should fail here, loudly.
    for (const file of [
      "api/lib/admissibility-gate.test.ts",
      "api/lib/correction-rules.test.ts",
      "api/lib/muscle-memory.regression.test.ts",
      "api/lib/category-registry.integrity.test.ts",
      "api/lib/model-mapper.test.ts",
      "api/lib/llm-router.test.ts",
      "api/lib/learning-loop.test.ts",
      "api/lib/provider-route-acceptance.test.ts",
      "api/lib/voice-intake-gate.test.ts",
      "api/lib/classification-cache-scope.test.ts",
    ]) {
      expect(INCLUDED, `${file} must stay in the command`).toContain(file);
    }
  });
});

describe("the scope definition is by import, not by name", () => {
  it("recognises a module however it is imported", () => {
    expect(importsScope("./rule-engine")).toBe(true);
    expect(importsScope("../lib/rule-engine")).toBe(true);
    expect(importsScope("../qa/fixtures/index")).toBe(true);
    expect(importsScope("node:fs")).toBe(false);
    expect(importsScope("vitest")).toBe(false);
  });

  it("includes a badly-named file that asserts real behaviour", () => {
    // `debug-atm.test.ts` reads like scratch work and asserts the intent detector's
    // direction for an ATM withdrawal. Name-based filtering would have dropped it.
    expect(INCLUDED).toContain("api/lib/debug-atm.test.ts");
  });

  it("keeps the scope list non-empty and free of duplicates", () => {
    expect(SCOPE_MODULES.length).toBeGreaterThan(20);
    expect(new Set(SCOPE_MODULES).size).toBe(SCOPE_MODULES.length);
    expect(new Set(INCLUDED).size).toBe(INCLUDED.length);
  });
});
