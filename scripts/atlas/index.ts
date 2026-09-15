/**
 * Atlas generator: extracts facts from the source code.
 *
 *   npm run atlas          regenerate docs/atlas/*.md and docs/architecture/generated/*.c4
 *   npm run atlas:check    exit 1 when either folder no longer matches the code
 */
import { buildAtlasGraph } from "./graph";
import { ATLAS_DIR } from "./emit/markdown";
import { GENERATED_DIRS, compareGenerated, renderGenerated, writeGenerated } from "./outputs";

async function main(): Promise<void> {
  const check = process.argv.includes("--check");
  const started = Date.now();
  const graph = await buildAtlasGraph();
  const rendered = renderGenerated(graph);

  if (check) {
    const problems = compareGenerated(rendered);
    if (problems.length > 0) {
      console.error(
        `Generated knowledge does not match the code:\n${problems.map((problem) => `  ${problem}`).join("\n")}\n\n` +
          "Run `npm run atlas` and commit the regenerated files.",
      );
      process.exitCode = 1;
      return;
    }
    console.log(`Atlas and architecture model are up to date (${rendered.total} files, ${Date.now() - started} ms).`);
    return;
  }

  const changed = writeGenerated(rendered);
  console.log(
    `Wrote ${rendered.total} files to ${GENERATED_DIRS.join(" and ")} in ${Date.now() - started} ms ` +
      `(${changed.length} changed).`,
  );
  if (graph.warnings.length > 0) {
    console.log(`${graph.warnings.length} generator warnings — see ${ATLAS_DIR}/README.md.`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
