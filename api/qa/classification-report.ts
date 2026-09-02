/**
 * Benchmark report emitter — markdown for humans, JSON for the ratchet.
 *
 * Writes nothing unless CLASSIFY_BENCH_REPORT=1 (or `force`), so a plain
 * `npm run test` runs the same assertions without dirtying the working tree.
 *
 * Report paths are deliberately distinct from docs/AI_CENTER_QA_RUNNER_LAST_RESULT.md,
 * which api/dev-qa-paths.test.ts locks to the AI-Center runner.
 */
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AggregateScore, CaseScore, ScorePass } from "./classification-scorer";
import type { BenchBucket, BenchTier } from "./fixtures/classification-cases.types";
import type { SystemMetrics } from "./classification-system-metrics";

/**
 * A complete benchmark run: scores plus the system-level view, ready to serialise.
 * Declared here rather than in the scorer so the scorer stays free of any dependency
 * on the metrics layer (which itself consumes scorer types).
 */
export interface BenchmarkRun {
  mode: "offline" | "live";
  pass: ScorePass;
  generatedAt: string;
  gitSha: string;
  pipelineVersion: string;
  plan: string;
  model: string;
  overall: AggregateScore;
  byBucket: Partial<Record<BenchBucket, AggregateScore>>;
  byTier: Partial<Record<BenchTier, AggregateScore>>;
  byTag: Record<string, AggregateScore>;
  cases: CaseScore[];
  system?: SystemMetrics;
  aborted?: { reason: string; atCase: string };
}

export const OFFLINE_REPORT_PATH = "docs/CLASSIFICATION_BENCHMARK_LAST_RESULT.md";
export const LIVE_REPORT_PATH = "docs/CLASSIFICATION_BENCHMARK_LIVE_RESULT.md";
export const RAW_DIR = "scratch/benchmarks";

export interface ReportInput {
  mode: "offline" | "live";
  pass: ScorePass;
  plan: string;
  model: string;
  pipelineVersion: string;
  overall: AggregateScore;
  byBucket: Partial<Record<BenchBucket, AggregateScore>>;
  byTier: Partial<Record<BenchTier, AggregateScore>>;
  byTag: Record<string, AggregateScore>;
  cases: CaseScore[];
  system?: SystemMetrics;
  aborted?: { reason: string; atCase: string };
  /** Write even when CLASSIFY_BENCH_REPORT is unset (the live runner always writes). */
  force?: boolean;
}

// ─── Markdown primitives ───────────────────────────────────────────
// A tiny document builder. Sections push lines; tables are declared as data.
// This exists so no report line is ever assembled by nesting quotes inside quotes.

type Align = "left" | "right";

class Doc {
  private readonly lines: string[] = [];

  heading(level: number, text: string): this {
    return this.blank().push(`${"#".repeat(level)} ${text}`).blank();
  }

  text(value: string): this {
    return this.push(value).blank();
  }

  quote(value: string): this {
    for (const line of value.split("\n")) this.push(`> ${line}`);
    return this.blank();
  }

  /** `rows` may contain nulls so callers can filter inline without pre-building arrays. */
  table(headers: string[], rows: Array<Array<string | number> | null>, align: Align[] = []): this {
    const sep = headers.map((_, i) => (align[i] === "right" ? "--:" : ":--"));
    this.push(`| ${headers.join(" | ")} |`);
    this.push(`| ${sep.join(" | ")} |`);
    for (const row of rows) {
      if (!row) continue;
      this.push(`| ${row.map(String).join(" | ")} |`);
    }
    return this.blank();
  }

  json(value: unknown): this {
    return this.push("```json").push(JSON.stringify(value, null, 2)).push("```").blank();
  }

  private push(line: string): this {
    this.lines.push(line);
    return this;
  }

  private blank(): this {
    if (this.lines.length > 0 && this.lines[this.lines.length - 1] !== "") {
      this.lines.push("");
    }
    return this;
  }

  toString(): string {
    return this.lines.join("\n").replace(/\n{3,}/g, "\n\n").trimStart() + "\n";
  }
}

const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
const num = (n: number, d = 3): string => n.toFixed(d);
const ms = (n: number): string => n.toFixed(0);

// ─── Sections ──────────────────────────────────────────────────────

function headline(doc: Doc, a: AggregateScore): void {
  doc.heading(2, "العناوين (الطبقة المقفلة فقط)");
  doc.table(
    ["مقياس", "القيمة"],
    [
      ["triple F1 (مبلغ ∧ اتجاه ∧ فئة)", `**${num(a.tripleF1)}**`],
      ["triple precision / recall", `${num(a.triplePrecision)} / ${num(a.tripleRecall)}`],
      ["amount F1", num(a.amountF1)],
      ["دقة الاتجاه", pct(a.typeAccuracy)],
      ["دقة الفئة", pct(a.categoryAccuracy)],
      ["دقة الفرعية", pct(a.subCategoryAccuracy)],
      ["تقسيم مضبوط تماماً", pct(a.segmentationExact)],
      ["متوسط خطأ عدد العمليات", num(a.countMae, 2)],
      ["تقسيم زائد / ناقص", `${pct(a.overSegmentRate)} / ${pct(a.underSegmentRate)}`],
      ["معدل الهلوسة", pct(a.hallucinationRate)],
      ["**تصنيفات غير شرعية**", `**${pct(a.taxonomyViolationRate)}**`],
      ["السقوط في متنوعات", pct(a.miscFallbackRate)],
      ["دقة المجاميع", pct(a.sumAccuracyMean)],
      ["إجمالي خطأ المبالغ", `${a.totalSumErrorEgp.toFixed(2)} جنيه`],
      ["دقة القرار", pct(a.decisionAccuracy)],
    ],
    ["left", "right"],
  );
}

function slices(
  doc: Doc,
  title: string,
  data: Record<string, AggregateScore | undefined>,
): void {
  doc.heading(2, title);
  const rows = Object.entries(data)
    .filter((e): e is [string, AggregateScore] => Boolean(e[1]))
    .sort((a, b) => a[1].tripleF1 - b[1].tripleF1)
    .map(([name, a]) => [
      name,
      a.cases,
      a.expectedItems,
      num(a.tripleF1),
      pct(a.segmentationExact),
      pct(a.hallucinationRate),
      pct(a.miscFallbackRate),
      pct(a.sumAccuracyMean),
      ms(a.cost.latencyP95),
    ]);
  doc.table(
    ["المجموعة", "حالات", "عمليات", "tripleF1", "تقسيم", "هلوسة", "متنوعات", "مجاميع", "p95 ms"],
    rows,
    ["left", "right", "right", "right", "right", "right", "right", "right", "right"],
  );
}

function systemSection(doc: Doc, m: SystemMetrics): void {
  doc.heading(2, "المنظومة — الأهداف الأربعة");

  doc.heading(3, "1) ألا يتعطل أو يفسد البيانات");
  doc.table(
    ["مقياس", "القيمة"],
    [
      ["انهيارات", `${m.crashes} (${pct(m.crashRate)})`],
      ["مخرجات فارغة رغم وجود عمليات", `${m.emptyOnValidInput} (${pct(m.emptyOnValidInputRate)})`],
      ["عمليات مخترعة من نص غير مالي", m.spuriousOnNonFinancial],
      ["**حفظ تلقائي رغم وجود خطأ**", `**${m.unsafeAutoSaves} (${pct(m.unsafeAutoSaveRate)})**`],
      ["استيضاح بلا داعٍ", m.needlessClarifications],
    ],
    ["left", "right"],
  );
  doc.quote(
    "«حفظ تلقائي رغم وجود خطأ» هو المقياس الأخطر: كل واحدة منها صف غلط يُكتب في\n" +
      "`expenses` بلا سؤال المستخدم، فيسمّم المحفظة والرسوم ولوحة الأدمن معاً.",
  );

  doc.heading(3, "2) هل نسبة الثقة تعني شيئاً؟");
  doc.table(
    ["مقياس", "القيمة"],
    [
      ["متوسط الثقة عند الإجابة الصحيحة", m.meanConfidenceWhenCorrect.toFixed(1)],
      ["متوسط الثقة عند الإجابة الخاطئة", m.meanConfidenceWhenWrong.toFixed(1)],
      ["**الفصل** (موجب = الثقة مفيدة)", `**${m.confidenceSeparation.toFixed(1)}**`],
      ["خطأ المعايرة المتوقع (ECE)", m.expectedCalibrationError.toFixed(3)],
      ["واثق وغلط (ثقة ≥ 90)", m.confidentlyWrong],
    ],
    ["left", "right"],
  );
  doc.table(
    ["شريحة الثقة", "عناصر", "متوسط الثقة", "الدقة الفعلية", "الفجوة"],
    m.bins.map((b) => [
      `${(b.lower * 100).toFixed(0)}-${(b.lower * 100 + 10).toFixed(0)}`,
      b.count,
      pct(b.meanConfidence),
      pct(b.accuracy),
      ((b.meanConfidence - b.accuracy) * 100).toFixed(1),
    ]),
    ["left", "right", "right", "right", "right"],
  );

  const s = m.segmentation;
  doc.heading(3, "3) عمق التقطيع (مش مجرد عدد)");
  doc.table(
    ["نوع الخطأ", "العدد"],
    [
      ["دمج عمليتين في واحدة", s.mergeErrors],
      ["تفتيت عملية واحدة لعدة", s.splitErrors],
      ["**تفتيت رقم مركّب** (مية وخمسين ← 100 + 50)", `**${s.numberCompositionErrors}**`],
      ["مفقود بلا تفسير", s.unexplainedMissing],
      ["زائد بلا تفسير", s.unexplainedSpurious],
    ],
    ["left", "right"],
  );

  doc.heading(3, "4) السرعة حسب طول المدخل");
  doc.table(
    ["الطول", "حالات", "p50 ms", "p95 ms"],
    m.latencyByLength.map((l) => [l.bucket, l.cases, ms(l.p50), ms(l.p95)]),
    ["left", "right", "right", "right"],
  );

  doc.heading(3, "سلامة بيانات لوحة الأدمن");
  const parsedBy = Object.entries(m.admin.parsedByValues)
    .map(([k, v]) => `${k}:${v}`)
    .join(" · ");
  doc.table(
    ["مقياس", "القيمة"],
    [
      ["قيم parsedBy المرصودة", parsedBy || "—"],
      ["نتائج بلا قرار", m.admin.missingDecision],
      ["ثقة غائبة أو خارج المدى", m.admin.invalidConfidence],
      ["مسار LLM بلا نسبة نموذج", m.admin.missingModelAttribution],
    ],
    ["left", "right"],
  );
}

function failures(doc: Doc, cases: CaseScore[], limit = 25): void {
  const failing = cases
    .filter((c) => c.failures.length > 0)
    .sort((a, b) => b.failures.length - a.failures.length)
    .slice(0, limit);

  if (failing.length === 0) {
    doc.heading(2, "الحالات الفاشلة").text("لا شيء.");
    return;
  }

  doc.heading(2, `الحالات الفاشلة (أعلى ${failing.length})`);
  for (const c of failing) {
    doc.heading(3, `${c.id} — ${c.bucket} (${c.tier}) — ${c.tripleHits}/${c.expectedCount}`);
    doc.text(c.failures.map((f) => `- ${f}`).join("\n"));
  }
}

// ─── Public API ────────────────────────────────────────────────────

export function buildMarkdown(run: BenchmarkRun): string {
  const doc = new Doc();

  doc.heading(1, `Classification Benchmark — ${run.mode === "live" ? "Live" : "Offline"} Result`);
  doc.text(
    [
      `Generated: ${run.generatedAt}`,
      `Git SHA: ${run.gitSha} · Pipeline: ${run.pipelineVersion} · Plan: ${run.plan} · Model: ${run.model}`,
      `Pass: **${run.pass}**`,
    ].join("  \n"),
  );

  if (run.aborted) {
    doc.quote(`⚠️ **أُجهض التشغيل**: ${run.aborted.reason} (عند ${run.aborted.atCase})`);
  }
  if (run.pass === "local") {
    doc.quote(
      "هذا التشغيل **محلي فقط** (بلا نداء LLM). يقيس التطبيع والتقسيم واستخراج المبالغ\n" +
        "ومحرك القواعد وشرعية التصنيف — لا يمثل الدقة الحقيقية من طرف لطرف.",
    );
  }

  headline(doc, run.overall);
  slices(doc, "حسب المجموعة", run.byBucket as Record<string, AggregateScore>);
  slices(doc, "حسب الطبقة", run.byTier as Record<string, AggregateScore>);

  doc.heading(2, "حسب الظاهرة اللغوية");
  doc.table(
    ["الوسم", "عمليات", "tripleF1", "تقسيم"],
    Object.entries(run.byTag)
      .sort((a, b) => a[1].tripleF1 - b[1].tripleF1)
      .map(([tag, t]) => [tag, t.expectedItems, num(t.tripleF1), pct(t.segmentationExact)]),
    ["left", "right", "right", "right"],
  );

  if (run.system) systemSection(doc, run.system);

  doc.heading(2, "التكلفة");
  doc.json(run.overall.cost);

  failures(doc, run.cases);

  return doc.toString();
}

function gitSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

export async function writeBenchmarkReport(
  input: ReportInput,
): Promise<BenchmarkRun> {
  const run: BenchmarkRun = {
    mode: input.mode,
    pass: input.pass,
    generatedAt: new Date().toISOString(),
    gitSha: gitSha(),
    pipelineVersion: input.pipelineVersion,
    plan: input.plan,
    model: input.model,
    overall: input.overall,
    byBucket: input.byBucket,
    byTier: input.byTier,
    byTag: input.byTag,
    cases: input.cases,
    system: input.system,
    aborted: input.aborted,
  };

  if (!input.force && process.env.CLASSIFY_BENCH_REPORT !== "1") return run;

  const mdPath = input.mode === "live" ? LIVE_REPORT_PATH : OFFLINE_REPORT_PATH;
  mkdirSync(dirname(mdPath), { recursive: true });
  writeFileSync(mdPath, buildMarkdown(run), "utf8");

  mkdirSync(RAW_DIR, { recursive: true });
  const stamp = run.generatedAt.replace(/[:.]/g, "-");
  const payload = JSON.stringify(run, null, 2);
  writeFileSync(join(RAW_DIR, `${input.mode}-${input.plan}-${run.gitSha}-${stamp}.json`), payload, "utf8");
  writeFileSync(join(RAW_DIR, `latest-${input.mode}.json`), payload, "utf8");

  console.log(`[bench] report -> ${mdPath}`);
  console.log(`[bench] raw    -> ${RAW_DIR}/latest-${input.mode}.json`);
  return run;
}
