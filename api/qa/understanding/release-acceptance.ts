/**
 * Offline acceptance report. Try `npx tsx api/qa/understanding/release-acceptance.ts --help`.
 * The manifest contains aggregate verdicts and opaque ids only, never sentences or audio.
 * Its evidence hashes identify the independently reviewed artifacts; this tool checks the
 * manifest's consistency and gates, while reviewers verify the underlying artifacts.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import { estimateCostUsd } from "./report";
import { percentile } from "./score";

const confidence = 0.95;
const minimumAccuracy = 0.995;
const minimumCoverage = 0.8;
const requiredPilotDays = 14;
const maxShortMs = { text: 5_000, audio: 8_000 };
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const measure = z.number().finite().nonnegative();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const opaqueId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
});

const criticalSchema = z.object({
  doubleWrites: count,
  isolationFailures: count,
  wrongAutomaticSettlements: count,
  unsupportedAmounts: count,
  unexplainedReconciliationDeltas: count,
}).strict();

const sampleSchema = z.object({
  id: opaqueId,
  /** Same pseudonymous author/speaker id for every input from a person, even across cohorts. */
  clusterId: opaqueId,
  sourceSha256: sha256,
  short: z.boolean(),
  status: z.enum(["complete", "failed", "unrun"]),
  clearSafeItems: count,
  autoSavedItems: count,
  allFieldsCorrectAutoSaves: count,
  correctlyAutoSavedClearSafeItems: count,
  elapsedMs: measure.nullable(),
  cost: z.object({
    successfulReadingUsd: measure,
    failedReadingUsd: measure,
    speechToTextUsd: measure,
  }).strict().nullable(),
}).strict();

const cohortSchema = z.object({
  candidateSha256: sha256,
  lockedLabelsSha256: sha256,
  reviewEvidenceSha256: sha256,
  independentBlindLabels: z.boolean(),
  billingComplete: z.boolean(),
  critical: criticalSchema,
  samples: z.array(sampleSchema).min(1),
}).strict();

const releaseEvidenceSchema = z.object({
  version: z.literal(1),
  /** Fingerprint of the exact candidate, including the deployed routes and prompt profile. */
  candidateSha256: sha256,
  text: cohortSchema.extend({
    source: z.literal("independent-human-authored"),
    timing: z.literal("submit-to-response"),
  }),
  audio: cohortSchema.extend({
    source: z.literal("independent-real-audio"),
    timing: z.literal("upload-complete-to-response"),
  }),
  budget: z.object({
    configuredUsd: measure.positive(),
    forecastTextRequests: count.positive(),
    forecastAudioRequests: count.positive(),
    evidenceSha256: sha256,
  }).strict(),
  pilot: z.object({
    candidateSha256: sha256,
    evidenceSha256: sha256,
    days: z.array(z.object({
      day,
      rolloutPercent: z.union([z.literal(5), z.literal(25), z.literal(100)]),
      recordingRequests: count,
      telemetryComplete: z.boolean(),
      reconciliationComplete: z.boolean(),
      legacy: z.object({ requestPaths: count, queues: count, jobs: count }).strict(),
      critical: criticalSchema,
    }).strict()),
    rollback: z.object({ performed: z.boolean(), day, evidenceSha256: sha256 }).strict().nullable(),
  }).strict(),
}).strict();

/** Exact one-sided Clopper–Pearson lower limit for independent Bernoulli clusters. */
export function lowerConfidenceLimit(successes: number, total: number): number | null {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(successes) || total < 1 || successes < 0 || successes > total) return null;
  if (!successes) return 0;
  const alpha = 1 - confidence;
  if (successes === total) return Math.exp(Math.log(alpha) / total);

  // Sum the upper binomial tail relative to its largest term to avoid underflow.
  const failures = total - successes;
  let logChoose = 0;
  for (let i = 1; i <= Math.min(successes, failures); i++) logChoose += Math.log((total - i + 1) / i);
  function upperTail(p: number): number {
    let term = logChoose + successes * Math.log(p) + failures * Math.log1p(-p);
    let greatest = term;
    let sum = 1;
    const step = Math.log(p) - Math.log1p(-p);
    for (let k = successes; k < total; k++) {
      term += Math.log((total - k) / (k + 1)) + step;
      if (term > greatest) {
        sum = sum * Math.exp(greatest - term) + 1;
        greatest = term;
      } else {
        sum += Math.exp(term - greatest);
      }
    }
    return Math.exp(greatest) * sum;
  }

  let low = 0;
  let high = 1;
  for (let i = 0; i < 53; i++) {
    const probe = (low + high) / 2;
    if (upperTail(probe) < alpha) low = probe;
    else high = probe;
  }
  return low;
}

type Evidence = z.infer<typeof releaseEvidenceSchema>;
type Modality = "text" | "audio";
type Critical = z.infer<typeof criticalSchema>;
type Gate = { label: string; passed: boolean; detail: string };
const gate = (label: string, passed: boolean, detail: string): Gate => ({ label, passed, detail });
const percent = (value: number | null) => value === null ? "unavailable" : `${(value * 100).toFixed(4)}%`;
const isoDayNumber = (value: string) => Date.parse(`${value}T00:00:00Z`) / 86_400_000;

function cohortGates(kind: Modality, cohort: Evidence[Modality], candidateSha256: string) {
  const { samples } = cohort;
  const clusters = new Map<string, boolean>();
  let autoSaved = 0;
  let correct = 0;
  let clear = 0;
  let covered = 0;
  let costs = 0;
  let attempted = 0;
  let failed = 0;
  let countsValid = true;
  let costsComplete = cohort.billingComplete;
  const timings: number[] = [];
  for (const sample of samples) {
    if (sample.status !== "unrun") attempted++;
    if (sample.status === "failed") failed++;
    if (sample.correctlyAutoSavedClearSafeItems > Math.min(sample.clearSafeItems, sample.allFieldsCorrectAutoSaves)
      || sample.allFieldsCorrectAutoSaves > sample.autoSavedItems
      || (sample.status !== "complete" && sample.allFieldsCorrectAutoSaves > 0)) countsValid = false;
    clear += sample.clearSafeItems;
    covered += sample.correctlyAutoSavedClearSafeItems;
    autoSaved += sample.autoSavedItems;
    correct += sample.allFieldsCorrectAutoSaves;
    if (sample.autoSavedItems) {
      clusters.set(sample.clusterId, clusters.get(sample.clusterId) !== false && sample.autoSavedItems === sample.allFieldsCorrectAutoSaves);
    }
    if (sample.short && sample.status !== "unrun" && sample.elapsedMs !== null) timings.push(sample.elapsedMs);
    if (sample.status !== "unrun") {
      if (!sample.cost || (kind === "text" && sample.cost.speechToTextUsd !== 0)) costsComplete = false;
      else costs += sample.cost.successfulReadingUsd + sample.cost.failedReadingUsd + sample.cost.speechToTextUsd;
    }
  }
  const uniqueIds = new Set(samples.map(sample => sample.id)).size === samples.length;
  const uniqueSources = new Set(samples.map(sample => sample.sourceSha256)).size === samples.length;
  const valid = cohort.independentBlindLabels && cohort.candidateSha256 === candidateSha256 && countsValid && uniqueIds && uniqueSources;
  const successfulClusters = [...clusters.values()].filter(Boolean).length;
  const lower = lowerConfidenceLimit(successfulClusters, clusters.size);
  const itemAccuracy = autoSaved ? correct / autoSaved : null;
  const coverage = clear ? covered / clear : null;
  const shortCount = samples.filter(sample => sample.short).length;
  const p95 = percentile(timings, 95);
  return {
    gates: [
      gate(`${kind} cohort provenance and coverage of input cases`, valid && attempted === samples.length,
        `${attempted}/${samples.length} attempted, ${failed} failed, ${new Set(samples.map(sample => sample.clusterId)).size} distinct author/speaker ids`),
      gate(`${kind} one-sided 95% lower bound`,
        valid && lower !== null && lower >= minimumAccuracy && itemAccuracy !== null && itemAccuracy >= minimumAccuracy,
        `${percent(lower)} lower bound (minimum 99.5%), ${successfulClusters}/${clusters.size} perfect autosaving clusters, ${correct}/${autoSaved} all-fields-correct saved items (${percent(itemAccuracy)})`),
      gate(`${kind} clear/safe item coverage`, valid && coverage !== null && coverage >= minimumCoverage,
        `${covered}/${clear} (${percent(coverage)}), minimum 80%`),
      gate(`${kind} short-passage p95`, valid && timings.length === shortCount && p95 !== null && p95 <= maxShortMs[kind],
        `${p95 === null ? "unavailable" : `${p95} ms`} from ${timings.length}/${shortCount} short inputs, maximum ${maxShortMs[kind]} ms`),
    ],
    meanCost: valid && attempted === samples.length && costsComplete && attempted > 0 ? costs / attempted : null,
  };
}

function criticalGate(sets: Critical[]): Gate {
  const totals = new Map<string, number>();
  for (const entries of sets) {
    for (const [key, count] of Object.entries(entries)) totals.set(key, (totals.get(key) ?? 0) + count);
  }
  return gate("Critical failures and reconciliation", [...totals.values()].every(value => value === 0),
    [...totals.entries()].map(([key, count]) => `${key}=${count}`).join(", "));
}

function pilotGates(pilot: Evidence["pilot"], candidateSha256: string, asOf: string): Gate[] {
  const { days, rollback } = pilot;
  const rank = (value: number) => [5, 25, 100].indexOf(value);
  const ordered = days.every((entry, index) => entry.day < asOf
    && (index === 0 || (entry.day > days[index - 1].day && rank(entry.rolloutPercent) >= rank(days[index - 1].rolloutPercent))));
  const observed = [5, 25, 100].every(stage => days.some(entry => entry.rolloutPercent === stage
    && entry.recordingRequests > 0 && entry.telemetryComplete && entry.reconciliationComplete));
  const fullWindow = days.slice(-requiredPilotDays);
  const continuous = fullWindow.length === requiredPilotDays && fullWindow.every((entry, index) =>
    entry.rolloutPercent === 100 && entry.telemetryComplete && entry.reconciliationComplete
    && (index === 0 || isoDayNumber(entry.day) - isoDayNumber(fullWindow[index - 1].day) === 1));
  const legacy = fullWindow.reduce((sum, entry) => sum + entry.legacy.requestPaths + entry.legacy.queues + entry.legacy.jobs, 0);
  const sameCandidate = candidateSha256 === pilot.candidateSha256;
  return [
    gate("Monitored 5%, 25%, 100% stages", sameCandidate && ordered && observed, `${days.length} reported Cairo pilot days`),
    gate("Fourteen consecutive reconciled full-pilot days", sameCandidate && ordered && continuous,
      `${fullWindow[0]?.day ?? "unavailable"} to ${fullWindow.at(-1)?.day ?? "unavailable"}`),
    gate("Zero legacy request, queue and job calls", sameCandidate && ordered && continuous && legacy === 0,
      continuous ? `${legacy} legacy calls across the full-pilot window` : "complete full-pilot telemetry unavailable"),
    gate("Rollback tested", sameCandidate && rollback !== null && rollback.performed && rollback.day <= asOf,
      rollback?.performed ? `drill reported for ${rollback.day}` : "drill evidence unavailable"),
  ];
}

export function assessRelease(raw: unknown, asOf: string): { eligibleForManualReview: boolean; gates: Gate[] } {
  const parsed = releaseEvidenceSchema.safeParse(raw);
  if (!parsed.success || !day.safeParse(asOf).success) {
    const missing = raw === null || raw === undefined;
    return { eligibleForManualReview: false, gates: [
      gate("Release evidence manifest", false, missing ? "No independent evidence manifest supplied."
        : "Manifest or assessment date is invalid. Check the schema in release-acceptance.ts."),
      ...[
        "Independent text and real audio cohorts", "Separate one-sided 95% lower bounds ≥99.5%",
        "Separate clear/safe item coverage ≥80%", "Short text p95 ≤5000 ms and short audio p95 ≤8000 ms",
        "Forecast cost including failures and speech-to-text", "Critical failures and reconciliation",
        "Monitored 5%, 25%, 100% stages", "Fourteen consecutive reconciled full-pilot days",
        "Zero legacy request, queue and job calls", "Rollback tested",
      ].map(label => gate(label, false, "Evidence unavailable")),
    ] };
  }

  const evidence = parsed.data;
  const text = cohortGates("text", evidence.text, evidence.candidateSha256);
  const audio = cohortGates("audio", evidence.audio, evidence.candidateSha256);
  const textClusters = new Set(evidence.text.samples.map(sample => sample.clusterId));
  const textSources = new Set(evidence.text.samples.map(sample => sample.sourceSha256));
  const isolated = evidence.audio.samples.every(sample => !textClusters.has(sample.clusterId) && !textSources.has(sample.sourceSha256))
    && evidence.text.lockedLabelsSha256 !== evidence.audio.lockedLabelsSha256;
  const forecast = text.meanCost === null || audio.meanCost === null ? null
    : text.meanCost * evidence.budget.forecastTextRequests + audio.meanCost * evidence.budget.forecastAudioRequests;
  const gates = [
    gate("Independent text and audio cohorts", isolated, isolated ? "No shared author/speaker ids, input digests or label manifests"
      : "Shared author/speaker ids, input digests or label manifests"),
    ...text.gates, ...audio.gates,
    gate("Forecast cost including failures and speech-to-text", forecast !== null && forecast <= evidence.budget.configuredUsd,
      `${forecast === null ? "unavailable" : `USD ${forecast.toFixed(4)} projected`} within USD ${evidence.budget.configuredUsd.toFixed(4)} budget`),
    criticalGate([evidence.text.critical, evidence.audio.critical, ...evidence.pilot.days.map(entry => entry.critical)]),
    ...pilotGates(evidence.pilot, evidence.candidateSha256, asOf),
  ];
  return { eligibleForManualReview: gates.every(item => item.passed), gates };
}

const observedScore = z.object({
  set: opaqueId,
  route: z.object({ model: z.string() }).nullable(),
  prompt: z.object({ configured: z.enum(["compact", "full"]).nullable() }).optional(),
  coverage: z.object({ eligible: count, completed: count, failed: count, unrun: count }),
  aggregate: z.object({
    allLabelledFieldsAutoSaveError: z.object({ count, of: count }),
    latencyMs: z.object({ p95: measure.nullable() }),
    tokens: z.object({ total: z.object({ prompt: count, completion: count, cached: count }) }),
  }),
});

/** Existing parser-only result files are useful diagnostics and never qualify as field evidence. */
export function describeObservedRun(raw: unknown): string {
  const score = observedScore.safeParse(raw);
  if (!score.success) return "| Unavailable or unreadable | — | — | — | — | — | — |";
  const { set, route, coverage, aggregate } = score.data;
  const provenance = set === "synthetic-egyptian-typed" ? "Synthetic typed"
    : set === "synthetic-egyptian-transcript" ? "Synthetic gold transcript"
      : "Unverified offline set";
  const { count: wrong, of: saved } = aggregate.allLabelledFieldsAutoSaveError;
  const subtotal = route ? estimateCostUsd(route.model, aggregate.tokens.total) : null;
  return `| ${provenance} | ${score.data.prompt?.configured ?? "unknown"} | ${coverage.completed}/${coverage.eligible} (${coverage.failed} failed, ${coverage.unrun} unrun) | ${saved ? `${wrong}/${saved}` : "unavailable"} | ${aggregate.latencyMs.p95 === null ? "unavailable" : `${aggregate.latencyMs.p95} ms`} | ${subtotal === null || coverage.completed === 0 ? "unavailable" : `USD ${subtotal.toFixed(6)}`} | ${set} |`;
}

function renderReport(assessment: ReturnType<typeof assessRelease>, observed: string[], asOf: string): string {
  return [
    "# Recording release acceptance",
    "",
    `Cairo assessment date ${asOf}. Verdict **${assessment.eligibleForManualReview ? "ELIGIBLE FOR MANUAL REVIEW" : "HOLD"}**.`,
    "This report has no deployment or retirement side effects.",
    "",
    "| Gate | Result | Evidence |", "| --- | --- | --- |",
    ...assessment.gates.map(item => `| ${item.label} | ${item.passed ? "Pass" : "Hold"} | ${item.detail} |`),
    "",
    "The confidence limit treats an author or speaker with any incorrect autosave as a failed cluster.",
    "It is a conservative bound for conditional item accuracy when authors or speakers receive equal weight.",
    "The observed accuracy across all autosaved items also needs to meet the threshold.",
    "A perfect result needs at least 598 independent autosaving clusters in each cohort to clear the threshold.",
    "Hashes identify the sealed evidence for manual verification.",
    "",
    "## Observed parser regressions",
    "",
    "These parser-only scores contribute no release evidence. The priced subtotal covers tokens on scored rows only.",
    "| Source | Prompt | Scored | Autosaves with any labelled error | Parser p95 | Priced subtotal | Set |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...observed,
    "",
  ].join("\n");
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function main(args: string[]): number {
  const { values } = parseArgs({ args, options: {
    help: { type: "boolean" },
    evidence: { type: "string" },
    observed: { type: "string", multiple: true },
    out: { type: "string", default: ".agents/recording-acceptance" },
  } });
  if (values.help) {
    process.stdout.write("Usage: npx tsx api/qa/understanding/release-acceptance.ts [--evidence <manifest.json>] [--observed <run-folder>]... [--out <folder>]\n");
    return 0;
  }
  // The offline gate uses Cairo calendar dates and does not load server configuration or secrets.
  const asOf = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", dateStyle: "short" }).format();
  const raw = values.evidence ? readJson(resolve(values.evidence)) ?? false : null;
  const result = assessRelease(raw, asOf);
  const observed = (values.observed ?? []).map(folder => describeObservedRun(readJson(join(resolve(folder), "score.json"))));
  const path = resolve(values.out);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "acceptance.json"), `${JSON.stringify({ asOf, ...result }, null, 2)}\n`);
  writeFileSync(join(path, "acceptance.md"), renderReport(result, observed, asOf));
  process.stdout.write(`${result.eligibleForManualReview ? "ELIGIBLE FOR MANUAL REVIEW" : "HOLD"} — ${join(path, "acceptance.md")}\n`);
  return result.eligibleForManualReview ? 0 : 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
