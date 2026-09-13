/**
 * Atlas generator: extracts facts from the source code into docs/atlas/.
 *
 *   npm run atlas          regenerate docs/atlas/*.md
 *   npm run atlas:check    exit 1 when docs/atlas/*.md no longer matches the code
 */
import fs from "node:fs";
import path from "node:path";
import { buildAtlasGraph } from "./graph";
import { ATLAS_DIR, renderAtlas } from "./emit/markdown";
import { REPO_ROOT } from "./lib/util";

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const started = Date.now();
  const graph = await buildAtlasGraph();
  const files = renderAtlas(graph);
  const atlasDir = path.join(REPO_ROOT, ATLAS_DIR);
  const existing = fs.existsSync(atlasDir)
    ? fs
        .readdirSync(atlasDir)
        .filter((name) => name.endsWith(".md"))
        .map((name) => `${ATLAS_DIR}/${name}`)
    : [];

  if (check) {
    const problems: string[] = [];
    for (const [file, content] of files) {
      const absolute = path.join(REPO_ROOT, file);
      if (!fs.existsSync(absolute)) problems.push(`missing  ${file}`);
      else if (normalizeLineEndings(fs.readFileSync(absolute, "utf8")) !== content) problems.push(`stale    ${file}`);
    }
    for (const file of existing) {
      if (!files.has(file)) problems.push(`extra    ${file}`);
    }
    if (problems.length > 0) {
      console.error(
        `The atlas does not match the code:\n${problems.map((problem) => `  ${problem}`).join("\n")}\n\n` +
          "Run `npm run atlas` and commit the regenerated files.",
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Atlas is up to date (${files.size} files, ${Date.now() - started} ms).`);
    return;
  }

  fs.mkdirSync(atlasDir, { recursive: true });
  for (const file of existing) {
    if (!files.has(file)) fs.rmSync(path.join(REPO_ROOT, file));
  }
  for (const [file, content] of files) {
    fs.writeFileSync(path.join(REPO_ROOT, file), content, "utf8");
  }
  console.log(`Wrote ${files.size} files to ${ATLAS_DIR} in ${Date.now() - started} ms.`);
  if (graph.warnings.length > 0) {
    console.log(`${graph.warnings.length} generator warnings — see ${ATLAS_DIR}/README.md.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
