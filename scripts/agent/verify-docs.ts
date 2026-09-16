/**
 * `npm run docs:verify -- <system id...> [--ar] [--all]`: records that a system's pages were checked.
 *
 * Run it after you read the changes `npm run agent:finish` names and corrected the page. It writes
 * docs/systems/verified.json: without --ar, the fingerprint of every unit of source docs/systems/<id>.md describes;
 * with --ar, the fingerprint of docs/systems/<id>.md as the version docs/ar/systems/<id>.md now matches. It also
 * stamps the day and the commit HEAD was on, so a reader can see how recent an explanation is. --all applies to
 * every system. Entries of systems that no longer exist are dropped.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildAtlasGraph } from "../atlas/graph";
import { REPO_ROOT } from "../atlas/lib/util";
import { formatLedger } from "./verified-ledger.mjs";
import {
  LEDGER_FILE,
  coverageFingerprints,
  fingerprint,
  narrativePath,
  plainPath,
  readLedger,
  readText,
  type Ledger,
} from "../knowledge/systems-docs";

/** `<YYYY-MM-DD> <commit>` — the day the page was recorded, and the commit the work sat on. */
function stamp(): string {
  const day = new Date().toISOString().slice(0, 10);
  try {
    const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" }).trim();
    return commit ? `${day} ${commit}` : day;
  } catch {
    return day;
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const arabic = args.includes("--ar");
  const graph = await buildAtlasGraph();
  const known = graph.systems.systems.map((system) => system.id);
  const ids = args.includes("--all") ? known : args.filter((arg) => !arg.startsWith("--"));
  const unknown = ids.filter((id) => !known.includes(id));
  if (ids.length === 0 || unknown.length > 0) {
    if (unknown.length > 0) console.error(`Unknown system: ${unknown.join(", ")}`);
    console.error(`Usage: npm run docs:verify -- <system id...> [--ar] [--all]\nSystems: ${known.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  let ledger: Ledger;
  try {
    ledger = readLedger();
  } catch (error) {
    console.error(
      `${LEDGER_FILE} is not valid JSON: ${(error as Error).message}\nAfter a merge conflict, take either side of the file and run this command again.`,
    );
    process.exitCode = 1;
    return;
  }
  for (const id of Object.keys(ledger.systems)) if (!known.includes(id)) delete ledger.systems[id];

  for (const id of ids) {
    const system = graph.systems.systems.find((entry) => entry.id === id)!;
    const english = readText(REPO_ROOT, narrativePath(id));
    if (english === null) {
      console.error(`${narrativePath(id)} does not exist yet; write it first.`);
      process.exitCode = 1;
      continue;
    }
    const entry = ledger.systems[id] ?? { files: {} };
    if (arabic) {
      if (readText(REPO_ROOT, plainPath(id)) === null) {
        console.error(`${plainPath(id)} does not exist yet; write it first.`);
        process.exitCode = 1;
        continue;
      }
      entry.arabic = fingerprint(english);
      entry.arabicChecked = stamp();
      console.log(`${plainPath(id)}: recorded as matching ${narrativePath(id)} (${entry.arabicChecked}).`);
    } else {
      entry.files = coverageFingerprints(REPO_ROOT, system.coverage);
      entry.checked = stamp();
      console.log(
        `${narrativePath(id)}: recorded as checked against ${system.coverage.length} unit(s) of source (${entry.checked}).`,
      );
    }
    ledger.systems[id] = entry;
  }

  const target = path.join(REPO_ROOT, LEDGER_FILE);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, formatLedger(ledger), "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 2;
});
