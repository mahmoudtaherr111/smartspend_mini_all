/**
 * The reader's benchmark: every case in fixtures.ts, scored field by field. It fails when the reader is sure and
 * wrong (the worst mistake: it would be recorded without asking), and when a field's accuracy falls under its floor.
 * `npm run bench:capture` prints the table.
 */
import { describe, expect, it } from "vitest";
import { READER_CASES, type ReaderCase } from "./fixtures";
import { readMessage } from "./read";
import type { Reading } from "./types";

const RECEIVED = new Date("2025-11-24T17:00:00Z");

type Field = keyof ReaderCase["expect"];

function actual(reading: Reading, field: Field): unknown {
  switch (field) {
    case "status":
      return reading.status;
    case "kind":
      return reading.kind;
    case "direction":
      return reading.direction;
    case "amount":
      return reading.amount?.value;
    case "currency":
      return reading.amount?.currency;
    case "amountEgp":
      return reading.amountEgp?.value;
    case "card":
      return reading.card?.suffix;
    case "account":
      return reading.account?.suffix;
    case "merchantKey":
      return reading.counterparty?.merchantKey;
    case "counterpartyType":
      return reading.counterparty?.type;
    case "phoneTail":
      return reading.counterparty?.phoneTail;
    case "ipa":
      return reading.counterparty?.ipa;
    case "balance":
      return reading.balanceAfter?.value;
    case "limit":
      return reading.availableLimit?.value;
    case "reference":
      return reading.reference;
  }
}

const runs = READER_CASES.map((item) => ({
  item,
  reading: readMessage({ text: item.text, receivedAt: RECEIVED, sourceKind: item.sourceKind, sourceSlug: item.sourceSlug }),
}));

const score = new Map<Field, { right: number; total: number; wrong: string[] }>();
for (const { item, reading } of runs) {
  for (const [field, expected] of Object.entries(item.expect) as [Field, unknown][]) {
    const entry = score.get(field) ?? { right: 0, total: 0, wrong: [] };
    entry.total++;
    if (actual(reading, field) === expected) entry.right++;
    else entry.wrong.push(`${item.id}: expected ${String(expected)}, got ${String(actual(reading, field))}`);
    score.set(field, entry);
  }
}

if (process.env.CAPTURE_BENCH_REPORT === "1") {
  const rows = [...score.entries()].map(([field, { right, total, wrong }]) => ({
    field,
    accuracy: `${((100 * right) / total).toFixed(1)}%`,
    right,
    total,
    firstMisses: wrong.slice(0, 3).join(" | "),
  }));
  console.table(rows);
  console.info(`${READER_CASES.length} messages`);
}

/** The lowest accuracy each field may have on this corpus. */
const FLOORS: Partial<Record<Field, number>> = {
  status: 0.99,
  kind: 0.97,
  direction: 0.99,
  amount: 0.99,
  currency: 0.99,
  amountEgp: 0.99,
  card: 0.97,
  account: 0.95,
  merchantKey: 0.95,
  counterpartyType: 0.95,
  phoneTail: 0.99,
  ipa: 0.99,
  balance: 0.97,
  limit: 0.97,
  reference: 0.95,
};

describe("the reader on its corpus", () => {
  it("has at least 300 messages across banks, wallets and non-transactions", () => {
    expect(READER_CASES.length).toBeGreaterThanOrEqual(300);
    expect(new Set(READER_CASES.map((item) => item.id)).size).toBe(READER_CASES.length);
  });

  it("is never sure and wrong about what happened or how much", () => {
    const sureAndWrong = runs
      .filter(({ reading }) => reading.confidence === "certain")
      .filter(({ item, reading }) => reading.kind !== item.expect.kind || (item.expect.amount !== undefined && reading.amount?.value !== item.expect.amount))
      .map(({ item, reading }) => `${item.id}: ${reading.kind} ${reading.amount?.value}`);
    expect(sureAndWrong).toEqual([]);
  });

  it.each(Object.entries(FLOORS) as [Field, number][])("reads %s at or above its floor", (field, floor) => {
    const entry = score.get(field);
    if (!entry) return;
    expect({ field, accuracy: entry.right / entry.total, misses: entry.wrong.slice(0, 5) }).toMatchObject({ accuracy: expect.any(Number) });
    expect(entry.right / entry.total, entry.wrong.slice(0, 5).join("\n")).toBeGreaterThanOrEqual(floor);
  });
});
