import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluateCaptureContract } from "./capture-contract-runner";

const fixture = fileURLToPath(new URL("./fixtures/capture-contract-cases.json", import.meta.url));
const runner = fileURLToPath(new URL("./capture-contract-runner.ts", import.meta.url));

describe("offline capture contract evaluation", () => {
  it("runs the actual CLI on synthetic cases without credentials or service connections", () => {
    const output = execFileSync(process.execPath, ["--import", "tsx", runner, "--cases", fixture], { encoding: "utf8" });
    const report = JSON.parse(output);
    expect(report).toMatchObject({ cases: 4, passed: 4, failed: 0, qualifiesForAutomaticRecording: false });
    expect(output).not.toMatch(/SYNTHETIC SHOP|500|USD/);
  });
  it("rejects invalid input and duplicate case IDs without echoing private data", () => {
    expect(() => evaluateCaptureContract([{ id: "SECRET PERSON", message: "SECRET" }])).toThrow("invalid_corpus");
    expect(() => evaluateCaptureContract([{ id: "CASE_1", message: "SECRET", expected: { status: "rejected", codes: ["shape"] } }])).toThrow("invalid_corpus");
    expect(() => evaluateCaptureContract([{ id: "SECRET_PERSON", message: "SECRET", reply: null, expected: { status: "rejected", codes: ["shape"] } }])).toThrow("invalid_corpus");
    const row = { id: "CASE_1", message: "SECRET", reply: null, expected: { status: "rejected", codes: ["shape"] } };
    expect(() => evaluateCaptureContract([row, row])).toThrow("duplicate_case_id");
  });
  it("reports a failed outcome without exposing a message or model response", () => {
    const report = evaluateCaptureContract([{ id: "CASE_1", message: "PRIVATE PHRASE", reply: { text: "PRIVATE REPLY" }, expected: { status: "waiting", reason: "unknown" } }]);
    expect(report).toMatchObject({ cases: 1, passed: 0, failed: 1, failures: [{ id: "CASE_1", status: "rejected" }] });
    expect(JSON.stringify(report)).not.toMatch(/PRIVATE/);
  });
  it("returns a nonzero exit for a missing input file and prints no private path", () => {
    const run = spawnSync(process.execPath, ["--import", "tsx", runner, "--cases", "PRIVATE_MISSING_FILE.json"], { encoding: "utf8" });
    expect(run.status).toBe(2);
    expect(run.stderr).not.toContain("PRIVATE_MISSING_FILE");
  });
  it("returns exit 1 for a mismatched expectation so CI cannot mistake a rejected reply for a passing run", () => {
    const cases = fileURLToPath(new URL("./fixtures/capture-contract-mismatch.json", import.meta.url));
    const run = spawnSync(process.execPath, ["--import", "tsx", runner, "--cases", cases], { encoding: "utf8" });
    expect(run.status).toBe(1);
    expect(JSON.parse(run.stdout)).toMatchObject({ passed: 0, failed: 1, failures: [{ id: "CASE_1", status: "rejected" }] });
    expect(run.stdout).not.toContain("SYNTHETIC");
  });
});
