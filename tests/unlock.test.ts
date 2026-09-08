import { it, expect } from "vitest";
import fs from "fs";
import path from "path";

it("ensures git repository index lock is clean", () => {
  const lockPath = path.resolve(process.cwd(), ".git", "index.lock");
  expect(fs.existsSync(lockPath)).toBe(false);
});
