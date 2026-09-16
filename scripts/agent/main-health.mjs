#!/usr/bin/env node
/**
 * Is `main` green right now? Asked at the start of a session, answered from GitHub's public API.
 *
 * An agent that starts work on a red main spends its session on top of something already broken, and finds out
 * only when its own push is refused for a failure it did not cause. One HTTP call at session start is cheaper
 * than that, so this reports the conclusion of the latest run per workflow on main, and which jobs failed.
 *
 * Deliberately best-effort: no token, a short timeout, and silence on any failure. A session must start even
 * with no network, and the answer is a hint, never a gate.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const TIMEOUT_MS = 4_000;
const API = "https://api.github.com";

/** owner/repo from the origin remote, for https or ssh remotes alike. */
export async function repoSlug(root) {
  try {
    const { stdout } = await run("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8", timeout: TIMEOUT_MS });
    const match = /github\.com[:/]+([^/]+)\/(.+?)(?:\.git)?\s*$/i.exec(stdout.trim());
    return match ? `${match[1]}/${match[2]}` : null;
  } catch {
    return null;
  }
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "smartspend-session-check", Accept: "application/vnd.github+json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
}

/**
 * The latest completed run of each workflow on main, newest first.
 *
 * Runs still in progress are skipped rather than reported as unknown: "main is being checked right now" is not
 * a fact an agent can act on, while "the last completed check failed" is.
 */
export async function mainHealth(root) {
  const slug = await repoSlug(root);
  if (!slug) return null;
  const data = await getJson(`${API}/repos/${slug}/actions/runs?branch=main&per_page=20`);
  const byWorkflow = new Map();
  for (const workflow of data.workflow_runs ?? []) {
    if (workflow.status !== "completed") continue;
    if (!byWorkflow.has(workflow.name)) {
      byWorkflow.set(workflow.name, {
        name: workflow.name,
        conclusion: workflow.conclusion,
        sha: (workflow.head_sha ?? "").slice(0, 7),
        url: workflow.html_url,
        id: workflow.id,
        slug,
      });
    }
  }
  return [...byWorkflow.values()];
}

/** The jobs that failed in one run, so the report names what is broken rather than only that something is. */
export async function failedJobs(runs) {
  const failures = runs.filter((workflow) => workflow.conclusion === "failure");
  return Promise.all(
    failures.map(async (workflow) => {
      try {
        const data = await getJson(`${API}/repos/${workflow.slug}/actions/runs/${workflow.id}/jobs?per_page=50`);
        const jobs = (data.jobs ?? []).filter((job) => job.conclusion === "failure").map((job) => job.name);
        return { ...workflow, jobs };
      } catch {
        return { ...workflow, jobs: [] };
      }
    }),
  );
}

/** Lines for the session report, or none when main is green or the answer did not arrive. */
export async function summarizeMain(root) {
  let runs;
  try {
    runs = await mainHealth(root);
  } catch {
    return [];
  }
  if (!runs || runs.length === 0) return [];
  const broken = await failedJobs(runs);
  if (broken.length === 0) return [];
  return [
    "CI on main is not green (the last completed run of each workflow):",
    ...broken.map(
      (workflow) =>
        `  ${workflow.name} failed on ${workflow.sha}${workflow.jobs.length > 0 ? `: ${workflow.jobs.join(", ")}` : ""}`,
    ),
    "  A failure you did not cause is not yours to fix, but do not read it as your own change breaking.",
  ];
}

if (/main-health\.mjs$/.test(process.argv[1] ?? "")) {
  const root = process.cwd();
  summarizeMain(root)
    .then((report) => console.log(report.length > 0 ? report.join("\n") : "CI on main: every workflow's last completed run passed."))
    .catch((error) => {
      console.error(error?.message ?? error);
      process.exitCode = 1;
    });
}
