/**
 * One payment, one event (decision 0029). A payment can reach the server as several signals: the bank's SMS and its
 * app's notification, an InstaPay notification, the same notification from two phones. `matchSignal` decides which
 * event a new signal belongs to, or that it starts one.
 *
 * The rules lean one way on purpose: a wrong merge loses a real payment without anyone noticing, a duplicate is one
 * tap away. So two signals from the same channel are never merged on a guess (two identical coffees are two
 * payments); when they say exactly the same thing within minutes the user is asked. Pure: no database, no clock.
 */

/** What a new signal is matched on. */
export interface SignalKeys {
  /** The device and the way it arrived ("12:sms:CIB", "12:notification:com.bank.app"). */
  channelKey: string;
  deviceId: number;
  receivedAt: Date;
  textHmac: string;
  direction: "in" | "out" | "internal" | null;
  amount: number;
  currency: string;
  amountEgp: number | null;
  /** The message gave its own time (not the phone's receipt time). */
  timeFromMessage: boolean;
  occurredAt: Date;
  cardSuffix: string | null;
  accountSuffix: string | null;
  merchantKey: string | null;
  referenceHmac: string | null;
  balanceAfter: number | null;
  /** The message or the user's wallets show the account is the user's own. */
  ownAccount: boolean;
}

/** An event already kept for the user, with what its signals said. */
export interface EventKeys {
  id: number;
  status: string;
  direction: "in" | "out" | "internal" | null;
  amount: number;
  currency: string;
  amountEgp: number | null;
  occurredAt: Date;
  firstReceivedAt: Date;
  cardSuffix: string | null;
  accountSuffix: string | null;
  merchantKey: string | null;
  referenceHmac: string | null;
  balanceAfter: number | null;
  ownAccount: boolean;
  channels: string[];
}

/** Another signal of the user with the same text, and the event it went to. */
export interface SameText {
  eventId: number;
  deviceId: number;
  channelKey: string;
  receivedAt: Date;
}

export type MatchRule =
  | "reference"
  | "same_text_other_device"
  | "cross_channel"
  | "pound_posting"
  | "own_transfer";

export type Match =
  | { type: "merge"; eventId: number; rule: MatchRule }
  /** Same channel, same words, minutes apart: kept as its own event, and the user is asked. */
  | { type: "possible_duplicate"; eventId: number }
  | { type: "new" };

const MINUTE = 60_000;
export const MATCH_WINDOWS = {
  reference: 24 * 60 * MINUTE,
  sameTextOtherDevice: 10 * MINUTE,
  sameTextSameChannel: 5 * MINUTE,
  crossChannel: 5 * MINUTE,
  /** When both messages give their own time and it is the same minute. */
  crossChannelSameMinute: 15 * MINUTE,
  poundPosting: 3 * 24 * 60 * MINUTE,
  ownTransfer: 60 * MINUTE,
} as const;

const apart = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime());
const sameMinute = (a: Date, b: Date) => Math.floor(a.getTime() / MINUTE) === Math.floor(b.getTime() / MINUTE);

/** Card suffixes agree on their last three digits: some banks write three, some four. */
function cardsAgree(a: string | null, b: string | null): boolean {
  return !a || !b || a.slice(-3) === b.slice(-3);
}

/** Anything that proves two signals are different payments. */
function conflicts(signal: SignalKeys, event: EventKeys): boolean {
  if (!cardsAgree(signal.cardSuffix, event.cardSuffix)) return true;
  if (signal.merchantKey && event.merchantKey && signal.merchantKey !== event.merchantKey) return true;
  // The same account left at two different balances: two moments, two payments.
  const sameAccount =
    (signal.cardSuffix && event.cardSuffix && cardsAgree(signal.cardSuffix, event.cardSuffix)) ||
    (signal.accountSuffix && event.accountSuffix && signal.accountSuffix === event.accountSuffix);
  if (sameAccount && signal.balanceAfter !== null && event.balanceAfter !== null && signal.balanceAfter !== event.balanceAfter) return true;
  return false;
}

/** Both sides must say which way the money went: a message whose direction is unknown never joins on a guess. */
function directionsAgree(a: SignalKeys["direction"], b: EventKeys["direction"]): boolean {
  if (!a || !b) return false;
  return a === b || a === "internal" || b === "internal";
}

/** The same money: the same amount in the same currency, or a foreign amount and its pound value within 1.5%. */
function sameMoney(signal: SignalKeys, event: EventKeys): boolean {
  if (signal.currency === event.currency) return signal.amount === event.amount;
  const close = (pounds: number, other: number | null) => other !== null && Math.abs(pounds - other) <= pounds * 0.015;
  if (signal.currency === "EGP") return close(signal.amount, event.amountEgp);
  if (event.currency === "EGP") return close(event.amount, signal.amountEgp);
  return false;
}

export function matchSignal(signal: SignalKeys, events: EventKeys[], sameText: SameText[]): Match {
  const byAge = [...events].sort((a, b) => a.firstReceivedAt.getTime() - b.firstReceivedAt.getTime());

  // 1. The bank's own reference: the same payment, whatever the channel.
  if (signal.referenceHmac) {
    const found = byAge.find(
      (event) =>
        event.referenceHmac === signal.referenceHmac &&
        sameMoney(signal, event) &&
        apart(signal.receivedAt, event.firstReceivedAt) <= MATCH_WINDOWS.reference,
    );
    if (found) return { type: "merge", eventId: found.id, rule: "reference" };
  }

  // 2. The same words from another phone of the user's: the same message, received twice.
  const otherDevice = sameText.find(
    (other) => other.deviceId !== signal.deviceId && apart(signal.receivedAt, other.receivedAt) <= MATCH_WINDOWS.sameTextOtherDevice,
  );
  if (otherDevice) return { type: "merge", eventId: otherDevice.eventId, rule: "same_text_other_device" };

  // 3. The same words from the same channel minutes apart: two payments or one message twice; the user says.
  const sameChannel = sameText.find(
    (other) => other.channelKey === signal.channelKey && apart(signal.receivedAt, other.receivedAt) <= MATCH_WINDOWS.sameTextSameChannel,
  );
  if (sameChannel) return { type: "possible_duplicate", eventId: sameChannel.eventId };

  // 4. Another channel, the same money, close in time, nothing in conflict, and that channel not on the event yet.
  for (const event of byAge) {
    if (event.channels.includes(signal.channelKey)) continue;
    if (!directionsAgree(signal.direction, event.direction) || !sameMoney(signal, event) || conflicts(signal, event)) continue;
    const window =
      signal.timeFromMessage && sameMinute(signal.occurredAt, event.occurredAt) ? MATCH_WINDOWS.crossChannelSameMinute : MATCH_WINDOWS.crossChannel;
    if (apart(signal.receivedAt, event.firstReceivedAt) <= window) return { type: "merge", eventId: event.id, rule: "cross_channel" };
  }

  // 5. The pound posting of a foreign charge still waiting for its pound value: the same card and merchant.
  if (signal.currency === "EGP" && signal.direction !== "in") {
    const foreign = byAge.find(
      (event) =>
        event.status === "review" &&
        event.currency !== "EGP" &&
        event.amountEgp === null &&
        Boolean(signal.cardSuffix && event.cardSuffix && cardsAgree(signal.cardSuffix, event.cardSuffix)) &&
        Boolean(signal.merchantKey && signal.merchantKey === event.merchantKey) &&
        apart(signal.receivedAt, event.firstReceivedAt) <= MATCH_WINDOWS.poundPosting,
    );
    if (foreign) return { type: "merge", eventId: foreign.id, rule: "pound_posting" };
  }

  // 6. Money leaving one of the user's accounts and arriving in another: one transfer, only when both sides show
  //    the accounts are the user's. "Sent 1000 to a friend" and "received 1000 from someone" stay two.
  if (signal.ownAccount && (signal.direction === "in" || signal.direction === "out")) {
    const otherLeg = byAge.find(
      (event) =>
        event.ownAccount &&
        event.direction !== null &&
        event.direction !== signal.direction &&
        event.direction !== "internal" &&
        event.currency === signal.currency &&
        event.amount === signal.amount &&
        apart(signal.receivedAt, event.firstReceivedAt) <= MATCH_WINDOWS.ownTransfer,
    );
    if (otherLeg) return { type: "merge", eventId: otherLeg.id, rule: "own_transfer" };
  }

  return { type: "new" };
}
