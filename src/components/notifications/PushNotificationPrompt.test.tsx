/** @vitest-environment jsdom */
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.hoisted(() => ({ isSupported: true }));

vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({
    isSupported: push.isSupported,
    isSubscribed: false,
    subscribeToPush: vi.fn(),
  }),
}));

import { PushNotificationPrompt } from "./PushNotificationPrompt";

describe("the push permission prompt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    Object.defineProperty(window, "Notification", {
      value: { permission: "default" },
      configurable: true,
      writable: true,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function shownAfterDelay() {
    render(<PushNotificationPrompt />);
    act(() => {
      vi.advanceTimersByTime(8_000);
    });
    return document.body.querySelector("h3") !== null;
  }

  it("appears when this build can deliver a push", () => {
    push.isSupported = true;
    expect(shownAfterDelay()).toBe(true);
  });

  it("stays hidden when the build has neither Firebase nor a Web Push key", () => {
    push.isSupported = false;
    expect(shownAfterDelay()).toBe(false);
  });
});
