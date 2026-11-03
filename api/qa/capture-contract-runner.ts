/** Offline evaluation of saved candidate replies against sms-v4; no provider, database or ledger calls. */
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { CAPTURE_TEXT_MAX } from "../../contracts/capture-intake";
import { CAPTURE_PROMPT_VERSION, checkCaptureReply, proposeCapturePosting } from "../lib/capture/model-contract";

const pounds = z.string().regex(/^\d+\.\d{2}$/);
const expectedSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("ready"), flow: z.enum(["in", "out"]), principalEgp: pounds, feeEgp: pounds, totalEgp: pounds }),
  z.strictObject({ status: z.literal("waiting"), reason: z.string().min(1).max(40) }),
  z.strictObject({ status: z.literal("no_posting"), state: z.enum(["failed", "held", "none"]) }),
  z.strictObject({ status: z.literal("rejected"), codes: z.array(z.string().regex(/^[a-z_]+$/)).min(1) }),
]);
const corpusSchema = z.array(z.strictObject({
  // Reports may leave the private corpus directory; do not accept names or other identifying labels as IDs.
  id: z.string().regex(/^CASE_[0-9]{1,8}$/),
  message: z.string().min(1).max(CAPTURE_TEXT_MAX),
  reply: z.unknown().refine((value) => value !== undefined),
  expected: expectedSchema,
})).min(1).max(100_000);

/** These metrics describe contract checks on supplied replies, not live accuracy, coverage or source qualification. */
export function evaluateCaptureContract(input: unknown) {
  const parsed = corpusSchema.safeParse(input);
  if (!parsed.success) throw new Error("invalid_corpus");
  const seen = new Set<string>();
  const failures: Array<{ id: string; status: string }> = [];
  const outcomes: Record<string, number> = {};
  for (const row of parsed.data) {
    if (seen.has(row.id)) throw new Error("duplicate_case_id");
    seen.add(row.id);
    const actual = proposeCapturePosting(checkCaptureReply(row.reply, row.message));
    outcomes[actual.status] = (outcomes[actual.status] ?? 0) + 1;
    // Compare only the declared outcome. Ownership is a separate account-linking concern.
    const pass = actual.status === row.expected.status && (row.expected.status === "rejected"
      ? actual.status === "rejected" && row.expected.codes.every((code) => actual.codes.includes(code))
      : Object.entries(row.expected).every(([key, value]) => actual[key as keyof typeof actual] === value));
    if (!pass) failures.push({ id: row.id, status: actual.status });
  }
  return {
    metric: "offline_contract_consistency", promptVersion: CAPTURE_PROMPT_VERSION,
    qualifiesForAutomaticRecording: false,
    cases: parsed.data.length, passed: parsed.data.length - failures.length, failed: failures.length,
    outcomes, failures,
  };
}

function main(args: string[]): number {
  if (args.length !== 2 || args[0] !== "--cases") {
    process.stderr.write("Usage: npm run bench:capture:contract -- --cases <local-json-path>\n");
    return 2;
  }
  try {
    const path = resolve(args[1]);
    const stat = statSync(path);
    if (!stat.isFile() || stat.size > 10 * 1024 * 1024) throw new Error("invalid_input_file");
    const report = evaluateCaptureContract(JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, "")));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.failed === 0 ? 0 : 1;
  } catch {
    // Input can be private. Do not print parser errors, path names, message text or rejected values.
    process.stderr.write("Capture evaluation refused: invalid, duplicate, oversized or unreadable cases.\n");
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
