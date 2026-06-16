import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function extractBlockAfter(source: string, marker: string): string {
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) {
    throw new Error(`Marker not found: ${marker}`);
  }

  const start = source.indexOf("{", markerIndex);
  if (start < 0) {
    throw new Error(`Opening brace not found after marker: ${marker}`);
  }

  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Closing brace not found after marker: ${marker}`);
}

describe("ExpenseForm quick save flow", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/components/expenses/ExpenseForm.tsx"),
    "utf8",
  );

  it("routes text quick save through ai.parseExpense before any expense create mutation", () => {
    const handleSubmit = extractBlockAfter(source, "const handleSubmit =");

    expect(handleSubmit).toContain("parseMutation.mutate");
    expect(handleSubmit).toContain('inputChannel: "text"');
    expect(handleSubmit).not.toContain("createMutation.mutate");
    expect(handleSubmit).not.toContain("batchCreateMutation.mutate");
  });

  it("keeps text offline sync on the parser path while allowing manual offline records to save directly", () => {
    const syncOfflineData = extractBlockAfter(source, "const syncOfflineData =");
    const textSyncIndex = syncOfflineData.indexOf("// 1. Sync Text (AI) Transactions");
    const manualSyncIndex = syncOfflineData.indexOf("// 2. Sync Manual Transactions");

    expect(textSyncIndex).toBeGreaterThanOrEqual(0);
    expect(manualSyncIndex).toBeGreaterThan(textSyncIndex);

    const textSyncBlock = syncOfflineData.slice(textSyncIndex, manualSyncIndex);
    const manualSyncBlock = syncOfflineData.slice(manualSyncIndex);

    expect(textSyncBlock).toContain("parseMutation.mutateAsync");
    expect(textSyncBlock).toContain('inputChannel: "text"');
    expect(textSyncBlock).not.toContain("createMutation.mutateAsync");

    expect(manualSyncBlock).toContain("createMutation.mutateAsync");
  });

  it("surfaces parser trace returned by text and voice parsing", () => {
    expect(source).toContain("function ParserTracePanel");
    expect(source).toContain("parser-trace route=");
    expect(source).toContain("<ParserTracePanel trace={latestParserTrace} />");
    expect(source).toContain("setLatestParserTrace(asParserTrace((data as { trace?: unknown }).trace))");
  });

  it("keeps the dev-only browser QA text path on the parser route", () => {
    expect(source).toContain('params.get("expense_qa_text")');
    expect(source).toContain("expenseQaTextSentRef");

    const qaEffectIndex = source.indexOf('params.get("expense_qa_text")');
    const qaEffectBlock = source.slice(qaEffectIndex, source.indexOf("const handleSkip", qaEffectIndex));

    expect(qaEffectBlock).toContain("parseMutation.mutate");
    expect(qaEffectBlock).toContain('inputChannel: "text"');
    expect(qaEffectBlock).toContain("skipClarification");
    expect(qaEffectBlock).not.toContain("createMutation.mutate");
    expect(qaEffectBlock).not.toContain("batchCreateMutation.mutate");
  });

  it("clears stale parser trace before starting a new parse", () => {
    const handleSubmit = extractBlockAfter(source, "const handleSubmit =");
    expect(handleSubmit).toContain("setLatestParserTrace(null)");

    const submitClarificationAnswer = extractBlockAfter(
      source,
      "const submitClarificationAnswer =",
    );
    expect(submitClarificationAnswer).toContain("setLatestParserTrace(null)");
  });
});
