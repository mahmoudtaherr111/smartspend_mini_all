import { describe, expect, it } from "vitest";
import { matchSignal, type EventKeys, type SignalKeys } from "./events";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 20, 10, minute));

const signal = (overrides: Partial<SignalKeys> = {}): SignalKeys => ({
  channelKey: "1:sms:CIB",
  deviceId: 1,
  receivedAt: at(0),
  textHmac: "text-a",
  direction: "out",
  amount: 50,
  currency: "EGP",
  amountEgp: 50,
  timeFromMessage: false,
  occurredAt: at(0),
  cardSuffix: "1234",
  accountSuffix: null,
  merchantKey: "costa",
  referenceHmac: null,
  balanceAfter: null,
  ownAccount: false,
  ...overrides,
});

const event = (id: number, overrides: Partial<EventKeys> = {}): EventKeys => ({
  id,
  status: "review",
  direction: "out",
  amount: 50,
  currency: "EGP",
  amountEgp: 50,
  occurredAt: at(0),
  firstReceivedAt: at(0),
  cardSuffix: "1234",
  accountSuffix: null,
  merchantKey: "costa",
  referenceHmac: null,
  balanceAfter: null,
  ownAccount: false,
  channels: ["1:sms:CIB"],
  ...overrides,
});

describe("one payment, one event", () => {
  it("joins the bank's SMS and its app's notification of the same payment", () => {
    const fromApp = signal({ channelKey: "1:notification:com.cib.app", receivedAt: at(1) });
    expect(matchSignal(fromApp, [event(7)], [])).toEqual({ type: "merge", eventId: 7, rule: "cross_channel" });
  });

  it("keeps two coffees of the same price from the same channel apart", () => {
    const second = signal({ receivedAt: at(2), textHmac: "text-b" });
    expect(matchSignal(second, [event(7)], [])).toEqual({ type: "new" });
  });

  it("asks when the same channel says exactly the same thing twice within minutes", () => {
    const again = signal({ receivedAt: at(2) });
    const sameText = [{ eventId: 7, deviceId: 1, channelKey: "1:sms:CIB", receivedAt: at(0) }];
    expect(matchSignal(again, [event(7)], sameText)).toEqual({ type: "possible_duplicate", eventId: 7 });
  });

  it("treats the same words from the user's other phone as the same message", () => {
    const otherPhone = signal({ channelKey: "2:sms:CIB", deviceId: 2, receivedAt: at(3) });
    const sameText = [{ eventId: 7, deviceId: 1, channelKey: "1:sms:CIB", receivedAt: at(0) }];
    expect(matchSignal(otherPhone, [event(7)], sameText)).toMatchObject({ type: "merge", eventId: 7, rule: "same_text_other_device" });
  });

  it("gives each of two coffees its own app notification, in order", () => {
    const events = [event(7), event(8, { firstReceivedAt: at(2) })];
    const firstPush = signal({ channelKey: "1:notification:com.cib.app", receivedAt: at(3) });
    expect(matchSignal(firstPush, events, [])).toMatchObject({ eventId: 7 });
    events[0].channels.push("1:notification:com.cib.app");
    expect(matchSignal(firstPush, events, [])).toMatchObject({ eventId: 8 });
  });

  it("never joins across a different card, merchant or balance", () => {
    const fromApp = { channelKey: "1:notification:com.cib.app", receivedAt: at(1) };
    expect(matchSignal(signal({ ...fromApp, cardSuffix: "9999" }), [event(7)], [])).toEqual({ type: "new" });
    expect(matchSignal(signal({ ...fromApp, merchantKey: "starbucks" }), [event(7)], [])).toEqual({ type: "new" });
    expect(matchSignal(signal({ ...fromApp, balanceAfter: 900 }), [event(7, { balanceAfter: 950 })], [])).toEqual({ type: "new" });
  });

  it("compares a three-digit card suffix with a four-digit one", () => {
    const fromApp = signal({ channelKey: "1:notification:com.cib.app", receivedAt: at(1), cardSuffix: "234" });
    expect(matchSignal(fromApp, [event(7)], [])).toMatchObject({ type: "merge", eventId: 7 });
  });

  it("joins on the bank's reference whatever the channel and the delay", () => {
    const late = signal({ channelKey: "1:notification:com.instapay", receivedAt: at(90), referenceHmac: "ref-1", merchantKey: null });
    expect(matchSignal(late, [event(7, { referenceHmac: "ref-1" })], [])).toEqual({ type: "merge", eventId: 7, rule: "reference" });
  });

  it("waits longer when both messages give the same minute", () => {
    const late = signal({ channelKey: "1:notification:com.cib.app", receivedAt: at(12), timeFromMessage: true, occurredAt: at(0) });
    expect(matchSignal(late, [event(7)], [])).toMatchObject({ type: "merge", rule: "cross_channel" });
    expect(matchSignal({ ...late, timeFromMessage: false }, [event(7)], [])).toEqual({ type: "new" });
  });

  it("takes a foreign charge's pound posting into it", () => {
    const foreign = event(7, { currency: "USD", amount: 20, amountEgp: null, merchantKey: "openai chatgpt subscr" });
    const pounds = signal({ amount: 1010.5, amountEgp: 1010.5, receivedAt: at(600), merchantKey: "openai chatgpt subscr", channelKey: "1:notification:com.cib.app" });
    expect(matchSignal(pounds, [foreign], [])).toEqual({ type: "merge", eventId: 7, rule: "pound_posting" });
  });

  it("joins a transfer between the user's own accounts, and only then", () => {
    const out = event(7, { direction: "out", amount: 1000, ownAccount: true, merchantKey: null, cardSuffix: null });
    const arrived = signal({ direction: "in", amount: 1000, amountEgp: 1000, ownAccount: true, merchantKey: null, cardSuffix: null, receivedAt: at(20), channelKey: "1:sms:NBE" });
    expect(matchSignal(arrived, [out], [])).toEqual({ type: "merge", eventId: 7, rule: "own_transfer" });
    expect(matchSignal({ ...arrived, ownAccount: false }, [out], [])).toEqual({ type: "new" });
  });
});
