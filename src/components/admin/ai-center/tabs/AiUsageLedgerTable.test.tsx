import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UsageLedgerRows } from "./AiUsageLedgerTable";
import type { LedgerItemData } from "../modals/TokenAnatomyModal";

vi.mock("@/providers/trpc", () => ({ trpc: {} }));

describe("admin usage rows", () => {
  it("renders missing historical measurements as unknown, never the old numeric defaults", () => {
    const rows = [
      { id: 1, promptTokens: 987654, cachedTokens: 876543, costUsd: "100" },
    ] as LedgerItemData[];
    const html = renderToStaticMarkup(
      <table>
        <UsageLedgerRows rows={rows} inspect={() => {}} />
      </table>,
    );
    expect(html).toContain("غير متاح");
    expect(html).not.toContain("987654");
    expect(html).not.toContain("$100");
  });
  it("shows provider counters separately from local result reuse and configured cost", () => {
    const rows = [
      {
        id: 1,
        providerSlug: "test-provider",
        modelId: "configured-model",
        metadata: {
          accounting: {
            operationId: "operation-123",
            status: "failed",
            cacheKind: "provider",
            usage: {
              promptTokens: 1000,
              completionTokens: 100,
              cachedTokens: 800,
              cacheWriteTokens: 0,
            },
            cost: { usd: 0.00136, source: "configured_rates" },
          },
        },
      },
      {
        id: 2,
        metadata: {
          accounting: {
            cacheKind: "result_cache",
            usage: { promptTokens: 0, completionTokens: 0, cachedTokens: 0 },
            cost: { usd: 0, source: "local" },
          },
        },
      },
    ] as LedgerItemData[];
    const html = renderToStaticMarkup(
      <table>
        <UsageLedgerRows rows={rows} inspect={() => {}} />
      </table>,
    );
    expect(html).toContain("$0.00136000");
    expect(html).toContain("تقدير بأسعار الأدمن");
    expect(html).toContain("فشلت");
    expect(html).toContain("نتيجة محلية");
    expect(html).toContain("$0.00000000");
    expect(html).toContain("configured-model");
  });
});
