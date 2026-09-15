#!/usr/bin/env node
/**
 * Stop hook for Claude Code (.claude/settings.json) and Codex (.codex/hooks.json).
 *
 * When an agent ends a turn after changing code or documentation, this runs `npm run agent:finish`: the
 * atlas is regenerated from the code and the knowledge rules are checked. A broken rule sends the agent back
 * with the list of violations, once for each state of the files. Nothing else interrupts the agent, and any
 * error ends quietly with exit code 0.
 */
import fs from "node:fs";
import path from "node:path";
import { inputsFingerprint, readJson, readStdin, repoRoot, runTsx, stateDir, tsxAvailable, writeJson } from "./lib.mjs";

function respond(payload) {
  if (payload) process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exit(0);
}

async function main() {
  const input = JSON.parse((await readStdin()) || "{}");
  const root = repoRoot(input.cwd || process.cwd());
  if (!root || !fs.existsSync(path.join(root, "scripts", "agent", "finish.ts")) || !tsxAvailable(root)) respond();

  // Codex sends a turn id; only Claude Code shows `systemMessage` to the person.
  const quiet = typeof input.turn_id === "string";
  const statePath = path.join(stateDir(root), "stop.json");
  const state = readJson(statePath, {});
  const fingerprint = inputsFingerprint(root);
  if (state.checked === fingerprint) respond();

  // Below the 300 s hook timeout in the tool settings, so the hook still answers when the check is slow.
  const run = runTsx(root, "scripts/agent/finish.ts", ["--json"], { timeout: 240_000 });
  let report;
  try {
    report = JSON.parse(run.stdout.trim().split("\n").pop());
  } catch {
    writeJson(statePath, { checked: fingerprint });
    respond(quiet ? undefined : { systemMessage: "SmartSpend: npm run agent:finish could not run; run it by hand to see why." });
  }
  writeJson(statePath, { checked: inputsFingerprint(root) });

  if (report.broken.length === 0) {
    if (quiet || report.regenerated.length === 0) respond();
    respond({ systemMessage: `SmartSpend: regenerated ${report.regenerated.length} atlas file(s); commit them with the change.` });
  }

  const reason = [
    "The SmartSpend knowledge check (npm run agent:finish) found broken rules. Fix them before you finish:",
    ...report.broken.flatMap((rule) => [
      `- ${rule.title} [${rule.id}]`,
      ...rule.violations.slice(0, 8).map((violation) => `    ${violation}`),
      `  fix: ${rule.fix}`,
    ]),
    report.regenerated.length > 0
      ? `The atlas was regenerated (${report.regenerated.length} file(s)); commit those files with your change.`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  respond({ decision: "block", reason });
}

main().catch(() => process.exit(0));
