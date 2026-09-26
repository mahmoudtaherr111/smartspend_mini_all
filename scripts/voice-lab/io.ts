import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export function labReportPath(value: string | undefined): string {
  if (!value) throw new Error("json_report_path_required_under_agents");
  const output = resolve(value);
  const rel = relative(resolve(".agents"), output);
  if (!rel || rel.startsWith("..") || isAbsolute(rel) || !output.endsWith(".json")) throw new Error("report_must_be_json_under_agents");
  return output;
}

export function writeLabReport(file: string, value: unknown) {
  const path = labReportPath(file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}
