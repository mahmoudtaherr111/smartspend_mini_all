import { describe, expect, it } from "vitest";
import { captureOpenFor, olderThan } from "./access";
import { isIgnored, markerValue } from "./markers";

const owner = { userId: 12, userType: "local" };

describe("who capture is open to", () => {
  it("is closed until the admin opens it, then follows the platforms and the beta list", () => {
    expect(captureOpenFor({}, owner)).toBe(false);
    expect(captureOpenFor({ capture_enabled: "true" }, owner, "android")).toBe(true);
    expect(captureOpenFor({ capture_enabled: "true", capture_platforms: "android" }, owner, "ios")).toBe(false);
    expect(captureOpenFor({ capture_enabled: "true", capture_beta_users: "oauth:12, local:7" }, owner)).toBe(false);
    expect(captureOpenFor({ capture_enabled: "true", capture_beta_users: "oauth:12, local:12" }, owner)).toBe(true);
  });

  it("refuses only builds older than the oldest allowed", () => {
    expect(olderThan("0.9.9", "1.0.0")).toBe(true);
    expect(olderThan("1.0.0+45", "1.0.0")).toBe(false);
    expect(olderThan("1.10.0", "1.9.3")).toBe(false);
    expect(olderThan("not-a-version", "1.0.0")).toBe(false);
  });
});

describe("what the user asked to ignore", () => {
  it("keeps the last three digits of a card, and refuses a word every bank message has", () => {
    expect(markerValue("ignore_card", "٫١٢٣٤")).toEqual({ value: "234" });
    expect(markerValue("ignore_card", "12")).toHaveProperty("error");
    expect(markerValue("ignore_phrase", "EGP")).toHaveProperty("error");
    expect(markerValue("ignore_phrase", "خصم")).toHaveProperty("error");
    expect(markerValue("ignore_phrase", "  SHELL   Maadi ")).toEqual({ value: "shell maadi" });
  });

  it("drops a message of an ignored card whether it writes three or four digits, or with an ignored phrase", () => {
    const rules = { cards: new Set(["234"]), phrases: ["shell maadi"] };
    const none = { cardSuffix: null, accountSuffix: null };
    expect(isIgnored(rules, { cardSuffix: "1234", accountSuffix: null }, "")).toBe(true);
    expect(isIgnored(rules, { cardSuffix: "234", accountSuffix: null }, "")).toBe(true);
    expect(isIgnored(rules, { cardSuffix: "5678", accountSuffix: null }, "")).toBe(false);
    expect(isIgnored(rules, none, "تم خصم 300 جنيه عند SHELL  MAADI")).toBe(true);
    expect(isIgnored(rules, none, "تم خصم 300 جنيه عند CARREFOUR")).toBe(false);
  });
});
