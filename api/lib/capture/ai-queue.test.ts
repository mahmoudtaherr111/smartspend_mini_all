/**
 * How the model's answer becomes a reading the intake places (decision 0031). No model and no database: the replies
 * are written here. Every message is invented; the repository is public.
 */
import { describe, expect, it } from "vitest";
import type { SmsModelReply } from "../sms-ai-contract";
import { readingFromModel } from "./ai-queue";
import type { SignalReading } from "./intake";

const stored: SignalReading = {
  readerVersion: "reader-v1",
  kind: "card_purchase",
  direction: null,
  confidence: "unsure",
  amount: null,
  currencyInferred: false,
  amountEgp: null,
  fee: null,
  balanceAfter: { value: 4500.75, currency: "EGP" },
  cardSuffix: "1234",
  accountSuffix: null,
  counterparty: null,
  occurredAt: "2026-10-20T12:00:00.000Z",
  timeFromMessage: false,
  missing: ["amount"],
  sourceSlug: "cib",
  sourceName: { ar: "البنك التجاري الدولي", en: "CIB" },
  referenceHmac: "ref-hmac",
  readBy: "reader",
};

const reply = (overrides: Partial<SmsModelReply> = {}): SmsModelReply => ({
  isFinancial: true,
  kind: "card_purchase",
  direction: "out",
  amount: { value: 450, currency: "EGP" },
  amountEgp: null,
  fee: null,
  balanceAfter: null,
  counterparty: { type: "merchant", name: "CARREFOUR MAADI" },
  rail: "card",
  occurredAt: null,
  category: null,
  subCategory: null,
  subscriptionHint: false,
  confidence: { kind: 0.9, amount: 0.9, direction: 0.9, category: 0.5 },
  ...overrides,
});

describe("the model's reading", () => {
  it("takes the amount and the merchant from the model, and the card, balance and reference from the reader", () => {
    const reading = readingFromModel(stored, reply())!;
    expect(reading).toMatchObject({
      readBy: "model",
      confidence: "likely",
      amount: { value: 450, currency: "EGP" },
      direction: "out",
      cardSuffix: "1234",
      balanceAfter: { value: 4500.75, currency: "EGP" },
      referenceHmac: "ref-hmac",
      counterparty: { type: "merchant", name: "CARREFOUR MAADI" },
      missing: [],
    });
    expect(reading.counterparty?.merchantKey).toBeTruthy();
    expect(reading.readerVersion).toMatch(/^model:/);
  });

  it("keeps the merchant the reader found over the model's", () => {
    const party = { type: "merchant", name: "SPINNEYS", merchantKey: "spinneys", phoneTail: null, ipa: null };
    expect(readingFromModel({ ...stored, counterparty: party }, reply())?.counterparty).toEqual(party);
  });

  it("gives nothing to place when the model reads no money that moved", () => {
    expect(readingFromModel(stored, reply({ amount: null }))).toBeNull();
    expect(readingFromModel(stored, reply({ direction: null }))).toBeNull();
    expect(readingFromModel(stored, reply({ isFinancial: false }))).toBeNull();
  });

  it("keeps a foreign amount with its pound value when the text gave one", () => {
    const reading = readingFromModel(stored, reply({ amount: { value: 20, currency: "USD" }, amountEgp: 990 }))!;
    expect(reading.amount).toEqual({ value: 20, currency: "USD" });
    expect(reading.amountEgp).toEqual({ value: 990, currency: "EGP" });
  });
});
