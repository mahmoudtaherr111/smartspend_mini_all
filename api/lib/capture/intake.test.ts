import { describe, expect, it } from "vitest";
import type { CaptureSignal } from "../../../contracts/capture-intake";
import type { CaptureCatalog, CaptureSource } from "./catalog";
import { autoPolicyOf, buildNotice, canAnswerFromNotice, gateSignal, isPersonalSender, keepReading, mayRecordAlone, suggestLedgerEntry, taxonomyNames } from "./intake";

// Invented messages in the shapes banks send: the repository is public.
const source = (slug: string, kind: CaptureSource["kind"], packages: string[], senderIds: string[] = []): CaptureSource => ({
  id: slug.length,
  slug,
  kind,
  nameAr: slug === "cib" ? "البنك التجاري الدولي" : slug,
  nameEn: slug === "cib" ? "CIB" : slug,
  countries: ["EG"],
  androidPackages: packages,
  senderIds,
  aliases: [],
  notes: null,
  priority: 1,
  status: "active",
  origin: "seed",
  adminEditedAt: null,
});

const catalog: CaptureCatalog = {
  version: "test",
  sources: [
    source("cib", "bank", ["com.example.cib"], ["CIB"]),
    source("google_messages", "sms_app", ["com.google.android.apps.messaging"]),
  ],
  subscriptions: [
    {
      id: 1,
      slug: "netflix",
      name: "Netflix",
      nameAr: "نتفليكس",
      kind: "service",
      matchTokens: ["netflix"],
      categoryId: "entertainment",
      subCategoryId: "subscriptions",
      cycle: "monthly",
      status: "active",
      origin: "seed",
      adminEditedAt: null,
    },
  ],
};

const receivedAt = new Date("2026-10-20T12:00:00.000Z");
const signal = (overrides: Partial<CaptureSignal>): CaptureSignal => ({
  id: "signal-0001",
  channel: "notification",
  app: "com.example.cib",
  text: "تم خصم EGP 450.00 من بطاقتك رقم 1234 عند CARREFOUR MAADI المتاح EGP 4,500.75",
  postedAt: receivedAt.toISOString(),
  ...overrides,
});

const accepted = (outcome: ReturnType<typeof gateSignal>) => {
  if (!outcome.accept) throw new Error(`expected the signal to be kept, got ${outcome.reason}`);
  return outcome;
};

describe("which signals the server keeps", () => {
  it("keeps a bank app's purchase with the amount, the card and the merchant", () => {
    const kept = accepted(gateSignal(signal({}), catalog, receivedAt));
    const reading = keepReading(kept.reading, kept.source);
    expect(reading.amount).toEqual({ value: 450, currency: "EGP" });
    expect(reading.cardSuffix).toBe("1234");
    expect(reading.counterparty?.name).toContain("CARREFOUR");
    expect(reading.sourceSlug).toBe("cib");
  });

  it("stores nothing for a one-time code", () => {
    expect(gateSignal(signal({ text: "رمز التحقق 482913 لا تشاركه مع أي حد" }), catalog, receivedAt)).toMatchObject({ accept: false, result: "ignored" });
  });

  it("refuses an app the catalog does not list", () => {
    expect(gateSignal(signal({ app: "com.example.game" }), catalog, receivedAt)).toMatchObject({ accept: false, result: "rejected", reason: "unknown_app" });
  });

  it("ignores an SMS from a person's number, whatever it says", () => {
    const sms = signal({ channel: "sms", app: "com.google.android.apps.messaging", sender: "+20 100 123 4567" });
    expect(gateSignal(sms, catalog, receivedAt)).toMatchObject({ accept: false, reason: "personal_sender" });
  });

  it("takes an SMS from any messaging app when the sender is a known bank", () => {
    const sms = signal({ channel: "sms", app: "com.example.default.sms", sender: "CIB" });
    expect(accepted(gateSignal(sms, catalog, receivedAt)).source?.slug).toBe("cib");
  });

  it("asks an unknown SMS sender for proof the account is the user's", () => {
    const bare = signal({ channel: "sms", app: "com.google.android.apps.messaging", sender: "PROMO", text: "تم خصم 450 جنيه" });
    expect(gateSignal(bare, catalog, receivedAt)).toMatchObject({ accept: false, reason: "unknown_sender" });
    const withCard = signal({ channel: "sms", app: "com.google.android.apps.messaging", sender: "NEWBANK" });
    expect(gateSignal(withCard, catalog, receivedAt).accept).toBe(true);
  });

  it("keeps a bank's message the reader is unsure of for the model, even without an amount", () => {
    const kept = accepted(gateSignal(signal({ text: "تم خصم مبلغ من بطاقتكم رقم ****1234 لدى CARREFOUR" }), catalog, receivedAt));
    expect(kept.reading.confidence).toBe("unsure");
    expect(kept.reading.amount).toBeNull();
    // From a sender the catalog does not know, a message with no amount stays out.
    const unknown = gateSignal(
      signal({ channel: "sms", app: "com.google.android.apps.messaging", sender: "BANKX", text: "تم خصم مبلغ من بطاقتكم رقم ****1234 لدى CARREFOUR" }),
      catalog,
      receivedAt,
    );
    expect(unknown).toMatchObject({ accept: false, reason: "no_amount" });
  });

  it("reads a sender as a person only when it is a long number", () => {
    expect(isPersonalSender("01001234567")).toBe(true);
    expect(isPersonalSender("19019")).toBe(false);
    expect(isPersonalSender("CIB")).toBe(false);
    expect(isPersonalSender(null)).toBe(false);
  });
});

describe("where a captured transaction would be filed", () => {
  const readingOf = (text: string) => {
    const kept = accepted(gateSignal(signal({ text }), catalog, receivedAt));
    return keepReading(kept.reading, kept.source);
  };

  it("files an unknown merchant under miscellaneous, a known subscription where the catalog says", () => {
    expect(suggestLedgerEntry(readingOf("تم خصم EGP 450.00 من بطاقتك رقم 1234 عند CARREFOUR MAADI"), catalog)).toMatchObject({
      type: "expense",
      categoryId: "miscellaneous",
      amountEgp: 450,
    });
    expect(suggestLedgerEntry(readingOf("تم خصم EGP 199.00 من بطاقتك رقم 1234 عند NETFLIX.COM"), catalog)).toMatchObject({
      categoryId: "entertainment",
      subCategoryId: "subscriptions",
    });
  });

  it("files an ATM withdrawal as a transfer out, never as spending", () => {
    const reading = readingOf("تم سحب نقدي 1,000.00 جنيه من ماكينة الصراف ببطاقتك رقم 1234. الرصيد المتاح 7,000.00 جنيه");
    expect(suggestLedgerEntry(reading, catalog)).toMatchObject({ type: "transfer", direction: "outgoing", categoryId: "transfer", subCategoryId: "atm" });
  });

  it("has no pound amount for a foreign charge without its pound value", () => {
    const reading = readingOf("Your credit card ending with#1234 was charged for USD 20.00 at OPENAI *CHATGPT on 12/11/25 at 13:22");
    const suggestion = suggestLedgerEntry(reading, catalog);
    expect(suggestion.amountEgp).toBeNull();
    expect(canAnswerFromNotice(reading, suggestion)).toBe(false);
    expect(buildNotice(reading, suggestion, "ar").actions).toEqual([]);
  });

  it("names every filing it suggests with the taxonomy's own words", () => {
    expect(taxonomyNames("transfer", "atm")).toEqual({ category: "تحويل", subCategory: "سحب ATM" });
    expect(taxonomyNames("not_a_category", "x").category).toBe("متنوعات");
  });
});

describe("the notice the phone shows", () => {
  const kept = accepted(gateSignal(signal({}), catalog, receivedAt));
  const reading = keepReading(kept.reading, kept.source);
  const suggestion = suggestLedgerEntry(reading, catalog);

  it("asks in Arabic with both buttons when the reading is certain", () => {
    const notice = buildNotice(reading, suggestion, "ar");
    expect(notice.title).toBe("البنك التجاري الدولي");
    expect(notice.body).toContain("450 ج.م");
    expect(notice.body).toContain("نسجّلها؟");
    expect(notice.actions).toEqual(["record", "dismiss"]);
  });

  it("keeps a Latin merchant in its own direction inside Arabic text", () => {
    expect(buildNotice(reading, suggestion, "ar").body).toMatch(/⁨CARREFOUR[^⁩]*⁩/);
  });

  it("asks with both buttons for the model's reading, never for the reader's unsure one", () => {
    const reading = keepReading(accepted(gateSignal(signal({}), catalog, receivedAt)).reading, catalog.sources[0]);
    const suggestion = suggestLedgerEntry(reading, catalog);
    expect(canAnswerFromNotice({ ...reading, confidence: "likely", readBy: "model" }, suggestion)).toBe(true);
    expect(canAnswerFromNotice({ ...reading, confidence: "unsure" }, suggestion)).toBe(false);
  });

  it("speaks English for an English interface and keeps the category's name", () => {
    const notice = buildNotice(reading, suggestion, "en");
    expect(notice.body).toContain("EGP 450");
    expect(notice.body).toContain("متنوعات");
  });
});

describe("what is recorded without a question", () => {
  const kept = accepted(gateSignal(signal({}), catalog, receivedAt));
  const reading = keepReading(kept.reading, kept.source);
  const suggestion = suggestLedgerEntry(reading, catalog);
  const opened = autoPolicyOf({ capture_auto_pairs: "cib:card_purchase" });

  it("records an opened pair, or one the user agreed to, and nothing else", () => {
    expect(mayRecordAlone({ policy: opened, reading, suggestion, possibleDuplicate: false, userAgreed: false })).toBe(true);
    expect(mayRecordAlone({ policy: autoPolicyOf({}), reading, suggestion, possibleDuplicate: false, userAgreed: true })).toBe(true);
    expect(mayRecordAlone({ policy: autoPolicyOf({}), reading, suggestion, possibleDuplicate: false, userAgreed: false })).toBe(false);
    expect(mayRecordAlone({ policy: autoPolicyOf({ capture_auto_pairs: "*:card_purchase" }), reading, suggestion, possibleDuplicate: false, userAgreed: false })).toBe(true);
  });

  it("never records a possible duplicate, an unsure reading, a foreign amount or a paused bank", () => {
    const base = { policy: opened, reading, suggestion, possibleDuplicate: false, userAgreed: true };
    expect(mayRecordAlone({ ...base, possibleDuplicate: true })).toBe(false);
    expect(mayRecordAlone({ ...base, reading: { ...reading, confidence: "likely" } })).toBe(false);
    expect(mayRecordAlone({ ...base, suggestion: { ...suggestion, amountEgp: null } })).toBe(false);
    expect(mayRecordAlone({ ...base, policy: autoPolicyOf({ capture_auto_pairs: "cib:card_purchase", capture_paused_sources: "cib" }) })).toBe(false);
  });

  it("asks about a transfer to a person from the threshold up", () => {
    const transfer = { ...reading, kind: "transfer_out" as const, counterparty: { type: "person", name: "محمد علي", merchantKey: null, phoneTail: null, ipa: null } };
    const policy = autoPolicyOf({ capture_auto_pairs: "cib:transfer_out", capture_p2p_ask_above: "1000" });
    const small = { ...suggestion, amountEgp: 999 };
    expect(mayRecordAlone({ policy, reading: transfer, suggestion: small, possibleDuplicate: false, userAgreed: false })).toBe(true);
    expect(mayRecordAlone({ policy, reading: transfer, suggestion: { ...small, amountEgp: 1000 }, possibleDuplicate: false, userAgreed: false })).toBe(false);
  });
});
