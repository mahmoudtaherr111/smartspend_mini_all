import { describe, expect, it, vi } from "vitest";
const { records, stored } = vi.hoisted(() => ({ records: [] as unknown[], stored: [] as unknown[] }));
vi.mock("../lib/log", () => ({
  createLogger: () => ({ info: (record: unknown) => records.push(record) }),
}));
vi.mock("../queries/connection", () => ({
  db: { insert: () => ({ values: async (row: unknown) => { stored.push(row); } }) },
}));
import { recordAICostMetric } from "./ai-cost-policy";

describe("AI cost log privacy", () => {
  it("never forwards arbitrary trace metadata, even when text is nested beyond normal redaction", async () => {
    records.length = 0;
    stored.length = 0;
    await recordAICostMetric({
      userId: 7,
      userType: "local",
      channel: "parse",
      inputTokens: 12,
      metadata: {
        text: "private expense",
        phone: "secret phone",
        routing: { events: [{ text: "private voice" }] },
      },
    });
    expect(records).toHaveLength(1);
    const written = JSON.stringify(records);
    expect(written).not.toMatch(/private|secret|routing|events|phone/);
    expect(stored).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toMatch(/private|secret|events|phone/);
    expect(records[0]).toMatchObject({
      event: "ai.cost",
      userId: 7,
      inputTokens: 12,
    });
  });
});
