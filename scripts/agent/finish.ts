/**
 * `npm run agent:finish`: the one command to run before reporting a task done.
 *
 * It regenerates docs/atlas and docs/architecture/generated from the code (they describe the code, so they
 * are rebuilt, never edited), then checks the architecture rules, the hand-written documents and the drawn
 * flows. It exits 1 when a rule is broken.
 *
 *   --check   write nothing; generated files that no longer match the code count as a broken rule
 *   --json    print a machine-readable report (read by scripts/agent/stop.mjs)
 */
import { execFileSync } from "node:child_process";
import { buildAtlasGraph } from "../atlas/graph";
import { GENERATED_DIRS, compareGenerated, renderGenerated, writeGenerated } from "../atlas/outputs";
import { REPO_ROOT } from "../atlas/lib/util";
import { checkArchitecture } from "../knowledge/architecture-rules";
import { checkDocs } from "../knowledge/docs-rules";
import { checkFlows } from "../knowledge/flows-rules";
import type { RuleResult } from "../knowledge/types";

export interface FinishReport {
  mode: "write" | "check";
  regenerated: string[];
  broken: RuleResult[];
  changedSources: string[];
  durationMs: number;
}

/** Source files with uncommitted changes, to suggest the tests that exercise them. */
function changedSourceFiles(): string[] {
  try {
    const status = execFileSync("git", ["status", "--porcelain=v1", "-uall", "--", "api", "src", "db", "contracts"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return status
      .split("\n")
      .filter(Boolean)
      .map((line) => line.slice(3).split(" -> ").pop()!.trim())
      .filter((file) => /\.tsx?$/.test(file) && !/\.(test|spec)\./.test(file));
  } catch {
    return [];
  }
}

export async function finish(mode: "write" | "check"): Promise<FinishReport> {
  const started = Date.now();
  const graph = await buildAtlasGraph();
  const rendered = renderGenerated(graph);
  const regenerated = mode === "write" ? writeGenerated(rendered) : [];
  const stale = mode === "check" ? compareGenerated(rendered) : [];

  const broken = [...checkArchitecture(graph), ...checkDocs(), ...checkFlows()].filter(
    (result) => result.violations.length > 0,
  );
  if (stale.length > 0) {
    broken.unshift({
      id: "atlas-fresh",
      title: "generated knowledge matches the code",
      fix: "Run npm run agent:finish (or npm run atlas) and commit the regenerated files with the change.",
      violations: stale,
    });
  }
  return { mode, regenerated, broken, changedSources: changedSourceFiles(), durationMs: Date.now() - started };
}

function printReport(report: FinishReport): void {
  const lines: string[] = [];
  if (report.mode === "write") {
    lines.push(
      report.regenerated.length > 0
        ? `Regenerated ${report.regenerated.length} file(s) in ${GENERATED_DIRS.join(" and ")}:`
        : "Generated knowledge already matched the code.",
      ...report.regenerated.map((file) => `  ${file}`),
    );
  }
  if (report.broken.length === 0) {
    lines.push("All architecture, documentation and flow rules hold.");
  } else {
    lines.push(`${report.broken.length} rule(s) broken:`);
    for (const rule of report.broken) {
      lines.push("", `x ${rule.title} [${rule.id}]`);
      lines.push(...rule.violations.slice(0, 20).map((violation) => `    - ${violation}`));
      if (rule.violations.length > 20) lines.push(`    ... and ${rule.violations.length - 20} more`);
      lines.push(`  fix: ${rule.fix}`);
    }
  }
  if (report.changedSources.length > 0) {
    lines.push("", "Tests that exercise the source files you changed:", `  npx vitest related --run ${report.changedSources.join(" ")}`);
  }
  if (report.regenerated.length > 0) lines.push("", "Commit the regenerated files together with the code change.");
  lines.push("", `(${report.durationMs} ms)`);
  console.log(lines.join("\n"));
}

async function main(): Promise<void> {
  const report = await finish(process.argv.includes("--check") ? "check" : "write");
  if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(report)}\n`);
  else printReport(report);
  if (report.broken.length > 0) process.exitCode = 1;
}

if (/finish\.ts$/.test(process.argv[1] ?? "")) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 2;
  });
}
