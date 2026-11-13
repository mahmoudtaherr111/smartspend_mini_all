/**
 * What a save takes from its reading: the log item it came from, whether it was saved as read,
 * and the metadata it is written with. A client's own `reading` never survives.
 */
import { describe, expect, it } from "vitest";
import { movementKindFor, readingItemFor, readingOf, savedAsRead, withReadingMetadata } from "./saved-reading";

const reading = (over: Record<string, unknown> = {}) => ({
  category: "housing", sub: "rent", kind: "spending", flow: "out", commitmentId: 12, commitmentDueDay: "2026-11-01",
  installments: 0, walletId: 3, flags: [], ...over,
});
const item = (amount: number, over: Record<string, unknown> = {}) => ({
  amount, category: "سكن", subCategory: "إيجار", type: "expense", reading: reading(), ...over,
});

describe("readingItemFor", () => {
  it("takes the only item, whatever its amount", () => {
    expect(readingItemFor([item(4000)], { amount: 3900 })?.reading.commitmentId).toBe(12);
  });

  it("takes the one item with the saved amount, and none when two share it", () => {
    const log = [item(4000), item(50, { reading: reading({ commitmentId: null, category: "dining" }) })];
    expect(readingItemFor(log, { amount: 50 })?.reading.category).toBe("dining");
    expect(readingItemFor([item(50), item(50)], { amount: 50 })).toBeNull();
    expect(readingItemFor(log, { amount: 77 })).toBeNull();
  });

  it("ignores a log without readings, from the rules engine", () => {
    expect(readingItemFor([{ amount: 50, category: "أكل وشرب", type: "expense" }], { amount: 50 })).toBeNull();
    expect(readingItemFor(null, { amount: 50 })).toBeNull();
    expect(readingItemFor([], { amount: 50 })).toBeNull();
  });
});

describe("readingOf", () => {
  it("refuses a malformed reading and cleans ids", () => {
    expect(readingOf({ ...reading(), kind: "gift" })).toBeNull();
    expect(readingOf({ ...reading(), flow: "sideways" })).toBeNull();
    expect(readingOf("x")).toBeNull();
    expect(readingOf(reading({ walletId: -4, commitmentId: "12" }))).toMatchObject({ walletId: null, commitmentId: null });
  });
});

describe("savedAsRead", () => {
  it("holds only when category, subcategory and type are unchanged", () => {
    const found = readingItemFor([item(4000)], { amount: 4000 })!;
    expect(savedAsRead(found, { category: "سكن", subCategory: "إيجار", type: "expense" })).toBe(true);
    expect(savedAsRead(found, { category: "سكن", subCategory: "صيانة", type: "expense" })).toBe(false);
    expect(savedAsRead(found, { category: "فواتير", subCategory: "إيجار", type: "expense" })).toBe(false);
    expect(savedAsRead(found, { category: "سكن", subCategory: "إيجار", type: "income" })).toBe(false);
    const general = readingItemFor([item(10, { subCategory: "" })], { amount: 10 })!;
    expect(savedAsRead(general, { category: "سكن", type: "expense" })).toBe(true);
  });
});

describe("movementKindFor", () => {
  it("is the reading's kind, except an unnamed refund stored as income", () => {
    expect(movementKindFor({ kind: "loan" }, "transfer")).toBe("loan");
    expect(movementKindFor({ kind: "refund" }, "expense")).toBe("refund");
    expect(movementKindFor({ kind: "refund" }, "income")).toBe("income");
  });
});

describe("withReadingMetadata", () => {
  const read = readingOf(reading())!;

  it("adds the reading, keeping a direction the writer would have kept", () => {
    expect(withReadingMetadata(undefined, "outgoing", read)).toEqual({
      direction: "outgoing", reading: { v: "2.0", category: "housing", sub: "rent", kind: "spending", flow: "out" },
    });
    expect(withReadingMetadata({ source: "x" }, "outgoing", read)).toMatchObject({ source: "x", reading: { category: "housing" } });
  });

  it("drops a reading the client sent, with or without one of its own", () => {
    const forged = { reading: { category: "salary" }, note: 1 };
    expect(withReadingMetadata(forged, undefined, null)).toEqual({ note: 1 });
    expect(withReadingMetadata(forged, undefined, read)?.reading).toMatchObject({ category: "housing" });
  });
});
