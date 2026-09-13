/**
 * Atlas generator: extracts facts from the source code.
 *
 *   npm run atlas          regenerate docs/atlas/*.md and docs/architecture/generated/*.c4
 *   npm run atlas:check    exit 1 when either folder no longer matches the code
 */
import fs from "node:fs";
import path from "node:path";
import { buildAtlasGraph, type AtlasGraph } from "./graph";
import { ATLAS_DIR, renderAtlas } from "./emit/markdown";
import { ARCH_GENERATED_DIR, renderLikeC4 } from "./emit/likec4";
import { REPO_ROOT } from "./lib/util";

interface Output {
  dir: string;
  extension: string;
  render: (graph: AtlasGraph) => Map<string, string>;
}

const OUTPUTS: Output[] = [
  { dir: ATLAS_DIR, extension: ".md", render: renderAtlas },
  { dir: ARCH_GENERATED_DIR, extension: ".c4", render: renderLikeC4 },
];

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/** Files of the output's extension already in its folder, so stale ones can be reported or removed. */
function existingFiles(output: Output): string[] {
  const absolute = path.join(REPO_ROOT, output.dir);
  if (!fs.existsSync(absolute)) return [];
  return fs
    .readdirSync(absolute)
    .filter((name) => name.endsWith(output.extension))
    .map((name) => `${output.dir}/${name}`);
}

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const started = Date.now();
  const graph = await buildAtlasGraph();
  const rendered = OUTPUTS.map((output) => ({ output, files: output.render(graph) }));
  const total = rendered.reduce((sum, entry) => sum + entry.files.size, 0);

  if (check) {
    const problems: string[] = [];
    for (const { output, files } of rendered) {
      for (const [file, content] of files) {
        const absolute = path.join(REPO_ROOT, file);
        if (!fs.existsSync(absolute)) problems.push(`missing  ${file}`);
        else if (normalizeLineEndings(fs.readFileSync(absolute, "utf8")) !== content) problems.push(`stale    ${file}`);
      }
      for (const file of existingFiles(output)) {
        if (!files.has(file)) problems.push(`extra    ${file}`);
      }
    }
    if (problems.length > 0) {
      console.error(
        `Generated knowledge does not match the code:\n${problems.map((problem) => `  ${problem}`).join("\n")}\n\n` +
          "Run `npm run atlas` and commit the regenerated files.",
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Atlas and architecture model are up to date (${total} files, ${Date.now() - started} ms).`);
    return;
  }

  for (const { output, files } of rendered) {
    fs.mkdirSync(path.join(REPO_ROOT, output.dir), { recursive: true });
    for (const file of existingFiles(output)) {
      if (!files.has(file)) fs.rmSync(path.join(REPO_ROOT, file));
    }
    for (const [file, content] of files) {
      fs.writeFileSync(path.join(REPO_ROOT, file), content, "utf8");
    }
  }
  console.log(
    `Wrote ${total} files to ${OUTPUTS.map((output) => output.dir).join(" and ")} in ${Date.now() - started} ms.`,
  );
  if (graph.warnings.length > 0) {
    console.log(`${graph.warnings.length} generator warnings — see ${ATLAS_DIR}/README.md.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
