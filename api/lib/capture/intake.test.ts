/** Invented messages in the shapes banks send: the repository is public. No database, no model. */
import { describe, expect, it } from "vitest";
import type { CaptureSignal } from "../../../contracts/capture-intake";
import type { CaptureCatalog, CaptureSource } from "./catalog";
import {
  admitSignal, autoPolicyOf, buildNotice, holdsCaptureKeyword, isPersonalSender, mayRecordAlone, newSignalReading, recordedNotice, suggestLedgerEntry, taxonomyNames,
  type SignalReading,
} from "./intake";
import { readingFromModel } from "./ai-queue";
import { checkCaptureReply, labelAmounts, proposeCapturePosting, type CaptureModelReply } from "./model-contract";
import { prepareCaptureText } from "./privacy";

const source = (slug: string, kind: CaptureSource["kind"], packages: string[], senderIds: string[] = []): CaptureSource => ({
  id: slug.length, slug, kind, nameAr: slug === "cib" ? "البنك التجاري الدولي" : slug, nameEn: slug === "cib" ? "CIB" : slug, countries: ["EG"],
  androidPackages: packages, senderIds, aliases: [], notes: null, priority: 1, status: "active", origin: "seed", adminEditedAt: null,
});
const catalog: CaptureCatalog = {
  version: "test",
  sources: [source("cib", "bank", ["com.example.cib"], ["CIB"]), source("google_messages", "sms_app", ["com.google.android.apps.messaging"])],
  subscriptions: [{ id: 1, slug: "netflix", name: "Netflix", nameAr: "نتفليكس", kind: "service", matchTokens: ["netflix"], categoryId: "subscriptions",
    subCategoryId: "streaming", cycle: "monthly", status: "active", origin: "seed", adminEditedAt: null }],
};
const receivedAt = new Date("2026-10-20T12:00:00.000Z");
const signal = (overrides: Partial<CaptureSignal>): CaptureSignal => ({
  id: "signal-0001", channel: "sms", app: null, sender: "CIB", text: "تم خصم EGP 450.00 من بطاقتك رقم 1234 عند CARREFOUR MAADI المتاح EGP 4,500.75",
  postedAt: receivedAt.toISOString(), ...overrides,
} as CaptureSignal);

/** A message read the way the worker reads it, with the model's reply written here. */
function modelReading(text: string, reply: Partial<CaptureModelReply>, src: CaptureSource | null = catalog.sources[0]): SignalReading {
  const prepared = prepareCaptureText(text);
  if (!prepared.ok) throw new Error("fixture");
  const check = checkCaptureReply({ status: "completed", kind: "purchase", direction: "out", amount: "N1", amountEgp: null, fee: null, feeIncluded: null, balance: null,
    party: null, partyType: "unknown", method: "card", category: null, subcategory: null, recurring: false, ...reply }, labelAmounts(prepared.value.text));
  if (!check.ok) throw new Error(check.codes.join());
  const stored = { ...newSignalReading(src, receivedAt, "CIB"), modelRead: { envelope: "sealed" } };
  return readingFromModel(stored, check.facts, proposeCapturePosting(check), prepared.value)!;
}

describe("which signals go on to the model", () => {
  it("takes an SMS from any bank, known to the catalog or not", () => {
    expect(admitSignal(signal({}), catalog)).toMatchObject({ accept: true, source: { slug: "cib" } });
    expect(admitSignal(signal({ sender: "NEWBANK" }), catalog)).toEqual({ accept: true, source: null });
  });
  it("ignores an SMS from a person's number and a text without a keyword", () => {
    expect(admitSignal(signal({ sender: "+20 100 123 4567" }), catalog)).toMatchObject({ accept: false, reason: "personal_sender" });
    expect(admitSignal(signal({ text: "هتيجي امتى؟" }), catalog)).toMatchObject({ accept: false, reason: "no_keyword" });
  });
  it("refuses an app notification from an app the catalog does not list", () => {
    expect(admitSignal(signal({ channel: "notification", app: "com.example.game" }), catalog)).toMatchObject({ accept: false, result: "rejected", reason: "unknown_app" });
    expect(admitSignal(signal({ channel: "notification", app: "com.example.cib", sender: null }), catalog)).toMatchObject({ accept: true, source: { slug: "cib" } });
  });
  it("folds keywords the way the phone does", () => {
    expect(holdsCaptureKeyword(null, "تم ايداع 500")).toBe(true);
    expect(holdsCaptureKeyword(null, "تمَّ تحويلُ ٥٠٠")).toBe(true);
    expect(holdsCaptureKeyword("PAYMENT", "x")).toBe(true);
    expect(holdsCaptureKeyword(null, "Your order is on its way")).toBe(false);
  });
  it("reads a sender as a person only when it is a long number", () => {
    expect(isPersonalSender("01001234567")).toBe(true);
    expect(isPersonalSender("19019")).toBe(false);
    expect(isPersonalSender("VF-Cash")).toBe(false);
  });
});

describe("the model's reading as the intake places it", () => {
  it("takes the card that paid, the merchant and the balance", () => {
    const reading = modelReading("Your card ending 4821 was charged EGP 85.00 at ZED MARKET. Avl bal EGP 675.60", { party: "ZED MARKET", partyType: "merchant", balance: "N2" });
    expect(reading).toMatchObject({ kind: "card_purchase", direction: "out", amount: { value: 85, currency: "EGP" }, cardSuffix: "4821",
      balanceAfter: { value: 675.6 }, counterparty: { type: "merchant", name: "ZED MARKET", merchantKey: "zed market" }, modelRead: { posting: { status: "ready" } } });
  });
  it("restores a phone kept on the server and keys the person by it", () => {
    const reading = modelReading("تم تحويل 500 جنيه الى 01012345678 رسوم 2.5 جنيه", { kind: "transfer", party: "[PHONE_1]", partyType: "person", fee: "N2", feeIncluded: false });
    expect(reading).toMatchObject({ kind: "transfer_out", counterparty: { type: "person", name: null, phoneTail: "5678", identityKind: "phone" } });
    expect(reading.counterparty?.identityHmac).toMatch(/^[a-f0-9]{64}$/);
    expect(reading.modelRead?.posting).toMatchObject({ totalEgp: "502.50" });
  });
  it("keeps a foreign charge without its pound value for the user's answer", () => {
    const reading = modelReading("Purchase USD 20.00 at OPENAI", { party: "OPENAI", partyType: "merchant" });
    expect(reading).toMatchObject({ kind: "international_purchase", confidence: "unsure", missing: ["egp_missing"], modelRead: { posting: { status: "waiting" } } });
    expect(mayRecordAlone({ policy: autoPolicyOf({}), reading, possibleDuplicate: false })).toBe(false);
    expect(buildNotice(reading, suggestLedgerEntry(reading, catalog), "ar").actions).toEqual([]);
  });
});

describe("where it is filed", () => {
  it("takes the model's category and subcategory, the subscription catalog first", () => {
    expect(suggestLedgerEntry(modelReading("Paid EGP 85 at TALABAT", { party: "TALABAT", partyType: "merchant", category: "food", subcategory: "delivery" }), catalog))
      .toMatchObject({ type: "expense", categoryId: "food", subCategoryId: "delivery", from: "model", amountEgp: 85 });
    expect(suggestLedgerEntry(modelReading("Paid EGP 199 at NETFLIX.COM", { party: "NETFLIX.COM", partyType: "merchant", category: "food" }), catalog))
      .toMatchObject({ categoryId: "subscriptions", subCategoryId: "streaming", from: "catalog" });
  });
  it("puts an unknown merchant under miscellaneous and money in under other income", () => {
    expect(suggestLedgerEntry(modelReading("Paid EGP 85 at XYZ", { party: "XYZ", partyType: "merchant" }), catalog)).toMatchObject({ categoryId: "miscellaneous", subCategoryId: "general" });
    expect(suggestLedgerEntry(modelReading("Received EGP 500", { kind: "transfer", direction: "in", partyType: "unknown" }), catalog)).toMatchObject({ categoryId: "transfer" });
  });
  it("names every filing with the taxonomy's own words", () => {
    expect(taxonomyNames("transfer", "atm")).toEqual({ category: "تحويل", subCategory: "سحب ATM" });
    expect(taxonomyNames("not_a_category", "x").category).toBe("متنوعات");
  });
});

describe("what is recorded on its own", () => {
  const reading = modelReading("Paid EGP 85 at ZED", { party: "ZED", partyType: "merchant" });
  it("records every complete reading, from any bank", () => {
    expect(mayRecordAlone({ policy: autoPolicyOf({}), reading, possibleDuplicate: false })).toBe(true);
    expect(mayRecordAlone({ policy: autoPolicyOf({}), reading: { ...reading, sourceSlug: null }, possibleDuplicate: false })).toBe(true);
  });
  it("asks about a possible duplicate and holds back a source the admin paused", () => {
    expect(mayRecordAlone({ policy: autoPolicyOf({}), reading, possibleDuplicate: true })).toBe(false);
    expect(mayRecordAlone({ policy: autoPolicyOf({ capture_paused_sources: "cib" }), reading, possibleDuplicate: false })).toBe(false);
  });
  it("tells the phone what it recorded, with undo", () => {
    const notice = recordedNotice(reading, suggestLedgerEntry(reading, catalog), "ar");
    expect(notice).toMatchObject({ title: "اتسجلت · البنك التجاري الدولي", actions: ["undo"] });
    expect(notice.body).toContain("85 ج.م");
  });
});
