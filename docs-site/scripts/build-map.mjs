#!/usr/bin/env node
/**
 * Puts the interactive architecture map inside the site, at `/map/`.
 *
 * LikeC4 already builds the whole model into one self-contained HTML file, and the site only has to carry it:
 * embedding the views page by page would mean a second build of the same model and a second thing to keep in
 * step. `tools/architecture` owns the LikeC4 dependency, so this asks it to build and copies the result.
 *
 * Skipped with a message rather than failing when LikeC4 is not installed: the pages are the point, and a
 * missing map should not stop the site from being built.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, "..");
const REPO = path.resolve(SITE, "..");
const TOOLS = path.join(REPO, "tools", "architecture");
const BUILT = path.join(REPO, ".atlas", "site");
const TARGET = path.join(SITE, "public", "map");

function main() {
  if (!fs.existsSync(path.join(TOOLS, "node_modules", "likec4"))) {
    console.warn("[map] tools/architecture has no node_modules; run npm run arch:install. Skipping the map.");
    return;
  }

  // The binary is run through node rather than npx: Windows refuses to spawn a .cmd without a shell, and
  // the same path is what .mcp.json uses for the MCP server.
  const binary = path.join(TOOLS, "node_modules", "likec4", "bin", "likec4.mjs");
  const result = spawnSync(
    process.execPath,
    [binary, "build", path.join(REPO, "docs", "architecture"), "-o", BUILT, "--output-single-file"],
    { cwd: TOOLS, stdio: "inherit" },
  );
  if (result.status !== 0) {
    console.warn("[map] LikeC4 build failed; the site will be built without the map.");
    return;
  }

  fs.mkdirSync(TARGET, { recursive: true });
  for (const name of fs.readdirSync(BUILT)) {
    fs.copyFileSync(path.join(BUILT, name), path.join(TARGET, name));
  }
  console.log(`[map] copied the interactive map into ${path.relative(REPO, TARGET)}`);
}

main();
