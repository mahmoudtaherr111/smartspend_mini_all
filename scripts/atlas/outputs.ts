/**
 * The generated knowledge files: rendered from the atlas graph, compared with what is on disk, and written.
 * Used by `npm run atlas`, `npm run atlas:check` and `npm run agent:finish`.
 */
import fs from "node:fs";
import path from "node:path";
import type { AtlasGraph } from "./graph";
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

/** Folders whose content is generated. Never edit or hand-merge them. */
export const GENERATED_DIRS = OUTPUTS.map((output) => output.dir);

export interface RenderedOutputs {
  outputs: Array<{ output: Output; files: Map<string, string> }>;
  total: number;
}

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

export function renderGenerated(graph: AtlasGraph): RenderedOutputs {
  const outputs = OUTPUTS.map((output) => ({ output, files: output.render(graph) }));
  return { outputs, total: outputs.reduce((sum, entry) => sum + entry.files.size, 0) };
}

/** How the files on disk differ from the rendered ones, one `missing`, `stale` or `extra` line per file. */
export function compareGenerated(rendered: RenderedOutputs): string[] {
  const problems: string[] = [];
  for (const { output, files } of rendered.outputs) {
    for (const [file, content] of files) {
      const absolute = path.join(REPO_ROOT, file);
      if (!fs.existsSync(absolute)) problems.push(`missing  ${file}`);
      else if (normalizeLineEndings(fs.readFileSync(absolute, "utf8")) !== content) problems.push(`stale    ${file}`);
    }
    for (const file of existingFiles(output)) {
      if (!files.has(file)) problems.push(`extra    ${file}`);
    }
  }
  return problems;
}

/**
 * Writes the rendered files and removes stale ones. Unchanged files are left untouched, so their
 * timestamps stay put for tools that watch them. Returns the paths that changed.
 */
export function writeGenerated(rendered: RenderedOutputs): string[] {
  const changed: string[] = [];
  for (const { output, files } of rendered.outputs) {
    fs.mkdirSync(path.join(REPO_ROOT, output.dir), { recursive: true });
    for (const file of existingFiles(output)) {
      if (!files.has(file)) {
        fs.rmSync(path.join(REPO_ROOT, file));
        changed.push(file);
      }
    }
    for (const [file, content] of files) {
      const absolute = path.join(REPO_ROOT, file);
      const before = fs.existsSync(absolute) ? normalizeLineEndings(fs.readFileSync(absolute, "utf8")) : null;
      if (before !== content) {
        fs.writeFileSync(absolute, content, "utf8");
        changed.push(file);
      }
    }
  }
  return changed;
}
