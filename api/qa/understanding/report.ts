/**
 * `<out>/report.md` and `<out>/score.json` from a run's `results.jsonl`, at the end of a run or
 * on its own:
 *
 *   npm run eval:understand:score -- --out <dir> [--set <path>]
 *
 * Reads only files: no model, no database, no environment.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PUBLISHED_RATES } from "../../../contracts/ai-models";
import { aggregate, type Aggregate, type CaseResult, type CaseScore, type PredictedEvent, type Rate } from "./score";
import { InvalidSetError, loadSet, type EvalSet, type GoldEvent } from "./set";

export const RESULTS_FILE = "results.jsonl";
export const FAILURES_FILE = "failures.jsonl";
export const META_FILE = "run.json";

/** What a run records about itself in `run.json`. Never a key. */
export interface RunMeta {
  setName: string;
  setPath: string;
  route: { slug: string; model: string; protocol: string };
  rpm: number;
  strictPolicy: boolean;
  settings: Record<string, string>;
  limit: number | null;
  ids: string[] | null;
  startedAt: string;
  resumedAt: string[];
}

export interface FailureRecord {
  id: string;
  at: string;
  detail: string;
  rateLimited: boolean;
  retries: number;
}

/**
 * Lines of a JSONL file that parse; a line cut short by a stopped run is skipped and counted.
 * A later line for the same id replaces an earlier one.
 */
export function readJsonl<T extends { id: string }>(path: string): { rows: T[]; broken: number } {
  if (!existsSync(path)) return { rows: [], broken: 0 };
  const byId = new Map<string, T>();
  let broken = 0;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as T;
      if (row && typeof row.id === "string") byId.set(row.id, row);
      else broken += 1;
    } catch {
      broken += 1;
    }
  }
  return { rows: [...byId.values()], broken };
}

/** Ids a resumed run skips: every case with a finished result. */
export function finishedIds(outDir: string): Set<string> {
  return new Set(readJsonl<CaseResult>(join(outDir, RESULTS_FILE)).rows.map((row) => row.id));
}

export function readMeta(outDir: string): RunMeta | null {
  const path = join(outDir, META_FILE);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as RunMeta;
}

/** USD at the published paid-tier rate; null when the model has none. Cached prompt tokens are part of the prompt count. */
export function estimateCostUsd(model: string, tokens: { prompt: number; completion: number; cached: number }): number | null {
  const price = PUBLISHED_RATES[model];
  if (!price) return null;
  const cached = Math.min(tokens.cached, tokens.prompt);
  return ((tokens.prompt - cached) * price.input + cached * (price.cached ?? price.input) + tokens.completion * price.output) / 1_000_000;
}

// ─── Rendering ──────────────────────────────────────────────────────────────────

const pct = (value: Rate) => (value.rate === null ? "n/a" : `${(value.rate * 100).toFixed(1)}%`);
const frac = (value: Rate) => `${pct(value)} (${value.count}/${value.of})`;
const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\s+/g, " ");
const ms = (value: number | null) => (value === null ? "n/a" : `${Math.round(value)} ms`);

function goldLabel(event: GoldEvent): string {
  const alt = event.alt?.length ? ` (or ${event.alt.map(([c, s]) => `${c}/${s}`).join(", ")})` : "";
  const person = event.person ? ` · ${event.person}` : "";
  const date = event.date ? ` · ${event.date}` : "";
  return `${event.amount} ${event.kind}/${event.flow} ${event.category}/${event.sub}${alt}${person}${date}`;
}

function predictedLabel(event: PredictedEvent): string {
  const person = event.person ? ` · ${event.person}` : "";
  const date = event.date ? ` · ${event.date}` : "";
  const flags = event.flags.length ? ` [${event.flags.join(", ")}]` : "";
  return `${event.amount} ${event.kind}/${event.flow} ${event.category}/${event.sub}${person}${date}${flags}`;
}

const list = (labels: string[]) => (labels.length ? labels.join("<br>") : "—");

export function renderReport(input: {
  meta: RunMeta | null;
  set: EvalSet;
  results: CaseResult[];
  scores: CaseScore[];
  aggregate: Aggregate;
  failures: FailureRecord[];
  brokenLines: number;
}): string {
  const { meta, set, results, scores, aggregate: a, failures } = input;
  const byId = new Map(set.cases.map((item) => [item.id, item]));
  const resultById = new Map(results.map((result) => [result.id, result]));
  const model = meta?.route.model ?? results[0]?.usage.model ?? "";
  const cost = estimateCostUsd(model, a.tokens.total);
  const versions = results[0]?.versions ?? {};
  const out: string[] = [];

  out.push(`# Understanding evaluation: ${set.name}`, "");
  out.push(
    `Route \`${meta ? `${meta.route.slug}:${meta.route.model}` : model}\` · ${a.cases} of ${set.cases.length} cases scored` +
      (meta ? ` · ${meta.rpm} rpm · policy ${meta.strictPolicy ? "strict (first-time rules on)" : "measuring (isFamiliar and isKnownPerson true)"}` : "") +
      (Object.keys(versions).length ? ` · versions ${Object.entries(versions).map(([k, v]) => `${k} ${v}`).join(", ")}` : ""),
    "",
  );
  if (set.note) out.push(`> ${set.note}`, "");

  out.push("## Headline", "", "| Measure | Value |", "| --- | --- |");
  out.push(`| G1 wrong-auto-save rate (unsafe saves / saves) | ${frac(a.wrongAutoSave)} |`);
  out.push(`| No extra tap (correct saves / all cases) | ${frac(a.noExtraTap)} |`);
  out.push(`| Question rate (asks / all cases) | ${frac(a.question)} |`);
  out.push(`| Needless questions (asked on clear or doubt) | ${frac(a.needlessQuestion)} |`);
  out.push(`| Missed questions (saved on ask or none) | ${frac(a.missedQuestion)} |`);
  out.push(`| Shown and right / shown and wrong | ${frac(a.showRight)} / ${frac(a.showWrong)} |`);
  out.push(`| Saves: correct / slip (person or date wrong) / unsafe | ${a.correctSave.count} / ${a.slipSave.count} / ${a.wrongAutoSave.count} of ${a.outcomes.save} |`);
  out.push(`| Events: gold / matched / missing / extra | ${a.goldEvents} / ${a.eventsMatched} / ${a.missing} / ${a.extra} |`);
  for (const key of ["kind", "flow", "category", "sub", "person", "date"] as const) {
    out.push(`| Field accuracy: ${key} (over matched events${key === "person" ? " whose label names a person" : ""}) | ${frac(a.fields[key])} |`);
  }
  out.push(`| Latency p50 / p95 / max | ${ms(a.latencyMs.p50)} / ${ms(a.latencyMs.p95)} / ${ms(a.latencyMs.max)} |`);
  out.push(
    `| Tokens per case: prompt / completion / cached | ${Math.round(a.tokens.perCase.prompt)} / ${Math.round(a.tokens.perCase.completion)} / ${Math.round(a.tokens.perCase.cached)} |`,
  );
  out.push(`| Tokens total: prompt / completion / cached / total | ${a.tokens.total.prompt} / ${a.tokens.total.completion} / ${a.tokens.total.cached} / ${a.tokens.total.total} |`);
  out.push(
    `| Estimated cost at the published paid rate | ${cost === null ? `no published rate for \`${model}\`` : `$${cost.toFixed(4)} total, $${(cost / Math.max(1, a.cases)).toFixed(6)} per case`} |`,
  );
  out.push(`| Rate-limit retries / replies without the schema | ${a.retries} / ${a.degradedSchema} |`);
  out.push("");

  out.push("## Outcome by expectation", "", "| expect | save | show | ask |", "| --- | --- | --- | --- |");
  for (const expect of ["clear", "doubt", "ask", "none"] as const) {
    const row = a.byExpect[expect];
    out.push(`| ${expect} | ${row.save} | ${row.show} | ${row.ask} |`);
  }
  out.push("");

  const detail = (title: string, picked: CaseScore[], withQuestion = false) => {
    out.push(`## ${title} (${picked.length})`, "");
    if (picked.length === 0) {
      out.push("None.", "");
      return;
    }
    out.push(`| id | expect | sentence | gold | predicted${withQuestion ? " | question" : ""} |`, `| --- | --- | --- | --- | ---${withQuestion ? " | ---" : ""} |`);
    for (const score of picked) {
      const item = byId.get(score.id)!;
      const result = resultById.get(score.id);
      const question = withQuestion ? ` | ${cell(result?.question ?? "")}` : "";
      out.push(
        `| ${score.id} | ${score.expect} | ${cell(item.text)} | ${cell(list(item.events.map(goldLabel)))} | ${cell(list((result?.events ?? []).map(predictedLabel)))}${question} |`,
      );
    }
    out.push("");
  };
  detail("Unsafe saves", scores.filter((score) => score.unsafeSave));
  detail("Needless questions", scores.filter((score) => score.needlessQuestion), true);

  const wrongCategories = scores.flatMap((score) => score.matched.filter((pair) => !pair.fields.category).map((pair) => ({ score, pair })));
  out.push(`## Wrong categories (${wrongCategories.length} events)`, "");
  if (wrongCategories.length === 0) out.push("None.", "");
  else {
    out.push("| id | outcome | sentence | gold | predicted |", "| --- | --- | --- | --- | --- |");
    for (const { score, pair } of wrongCategories) {
      out.push(`| ${score.id} | ${score.outcome} | ${cell(byId.get(score.id)!.text)} | ${cell(goldLabel(pair.gold))} | ${cell(predictedLabel(pair.predicted))} |`);
    }
    out.push("", "Confusion (gold → predicted category):", "");
    for (const entry of a.confusion) out.push(`- ${entry.gold} → ${entry.predicted}: ${entry.ids.length} (${entry.ids.join(", ")})`);
    out.push("");
  }

  const ranked = (map: Record<string, number>) =>
    Object.entries(map)
      .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
      .map(([key, value]) => `- \`${key}\`: ${value}`);
  out.push("## Guard flags (cases where each fired)", "", ...(ranked(a.flags).length ? ranked(a.flags) : ["None."]), "");
  out.push("## Verdict reasons (cases where each fired)", "", ...(ranked(a.reasons).length ? ranked(a.reasons) : ["None."]), "");

  const scored = new Set(results.map((result) => result.id));
  const open = failures.filter((failure) => !scored.has(failure.id));
  out.push(`## Not scored (${open.length} failed, ${set.cases.length - a.cases - open.length} not run)`, "");
  if (open.length) {
    out.push("A resumed run tries these again.", "");
    for (const failure of open) out.push(`- ${failure.id}: ${failure.rateLimited ? "rate limited, " : ""}${cell(failure.detail)} (retries ${failure.retries})`);
    out.push("");
  }
  if (a.unknownIds.length) out.push(`Results for ids the set does not have, ignored: ${a.unknownIds.join(", ")}`, "");
  if (input.brokenLines) out.push(`Unreadable lines in ${RESULTS_FILE}, ignored: ${input.brokenLines}`, "");
  return out.join("\n");
}

/** Scores a run folder and writes `report.md` and `score.json` into it. Returns the report's path. */
export function writeReport(outDir: string, setPath?: string): { path: string; aggregate: Aggregate } {
  const meta = readMeta(outDir);
  const path = setPath ?? meta?.setPath;
  if (!path) throw new Error(`${outDir} has no ${META_FILE}; pass --set <path>`);
  const set = loadSet(path);
  const { rows: results, broken } = readJsonl<CaseResult>(join(outDir, RESULTS_FILE));
  const failures = readJsonl<FailureRecord>(join(outDir, FAILURES_FILE)).rows;
  const scored = aggregate(set, results);
  const markdown = renderReport({ meta, set, results, scores: scored.scores, aggregate: scored.aggregate, failures, brokenLines: broken });
  const reportPath = join(outDir, "report.md");
  writeFileSync(reportPath, `${markdown}\n`);
  writeFileSync(
    join(outDir, "score.json"),
    `${JSON.stringify({ set: set.name, route: meta?.route ?? null, aggregate: scored.aggregate, cases: scored.scores.map(compactScore) }, null, 2)}\n`,
  );
  return { path: reportPath, aggregate: scored.aggregate };
}

function compactScore(score: CaseScore) {
  const verdicts = (["unsafeSave", "correctSave", "slipSave", "needlessQuestion", "missedQuestion", "rightQuestion", "showRight", "showWrong"] as const).filter(
    (key) => score[key],
  );
  return {
    id: score.id,
    expect: score.expect,
    outcome: score.outcome,
    verdicts,
    eventsMatched: score.eventsMatched,
    missing: score.missing.length,
    extra: score.extra.length,
    fields: score.matched.map((pair) => pair.fields),
  };
}

function main(args: string[]): number {
  const option = (name: string) => {
    const eq = args.find((arg) => arg.startsWith(`--${name}=`));
    if (eq) return eq.slice(name.length + 3);
    const at = args.indexOf(`--${name}`);
    return at >= 0 ? args[at + 1] : undefined;
  };
  const out = option("out");
  if (!out || args.includes("--help")) {
    process.stdout.write("Usage: npm run eval:understand:score -- --out <run folder> [--set <set.json>]\n");
    return out ? 0 : 2;
  }
  try {
    const set = option("set");
    const { path, aggregate: a } = writeReport(resolve(out), set ? resolve(set) : undefined);
    process.stdout.write(`G1 wrong-auto-save ${frac(a.wrongAutoSave)} · no extra tap ${frac(a.noExtraTap)} · questions ${frac(a.question)}\nReport: ${path}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof InvalidSetError ? error.message : `Scoring failed: ${(error as Error).message}`}\n`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
