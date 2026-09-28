import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * docs/guides/writing-app-messages.md: user-facing text is polite Egyptian Arabic. These
 * formal or technical phrases are rejected in the web app (the admin console, for the
 * owner, is exempt) and in the error messages the server sends users. Prompts to models
 * are not user-facing and are not checked.
 */
const BANNED = [/يرجى/, /تعذر/, /لقد\s/, /لديك/, /عفواً/, /Queue ال/];
const root = process.cwd();

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
  return out;
}

function offending(path: string, lines: string[], pick: (line: string) => boolean): string[] {
  return lines.flatMap((line, index) =>
    pick(line) && BANNED.some((pattern) => pattern.test(line))
      ? [`${relative(root, path)}:${index + 1}: ${line.trim().slice(0, 100)}`]
      : [],
  );
}

describe("the app's messages follow the writing guide", () => {
  it("uses no formal or technical phrasing in the web app", () => {
    const found = files(join(root, "src"))
      .filter((path) => !path.includes(`${join("src", "components", "admin")}`) && !path.endsWith(join("pages", "Admin.tsx")))
      .flatMap((path) => offending(path, readFileSync(path, "utf8").split("\n"), (line) => !/^\s*(\/\/|\*)/.test(line)));
    expect(found).toEqual([]);
  });

  it("sends users no formal or technical error messages from the server", () => {
    const found = files(join(root, "api"))
      .filter((path) => !path.includes("admin"))
      .flatMap((path) =>
        offending(path, readFileSync(path, "utf8").split("\n"), (line) => /message:\s*["`]|TRPCError|clarificationQuestion\s*=/.test(line)),
      );
    expect(found).toEqual([]);
  });
});
