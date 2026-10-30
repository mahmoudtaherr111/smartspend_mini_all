import { describe, expect, it } from "vitest";
import { movesForward, nextAttemptAt } from "./outbox";

describe("retrying a queued message", () => {
  it("waits longer each time and gives up after the sixth try", () => {
    const now = new Date("2026-10-29T10:00:00Z");
    const waits = [1, 2, 3, 4, 5].map((attempts) => (nextAttemptAt(attempts, now)!.getTime() - now.getTime()) / 60_000);
    expect(waits).toEqual([1, 5, 30, 120, 720]);
    expect(nextAttemptAt(6, now)).toBeNull();
  });
});

describe("status webhooks", () => {
  it("only move a message forward, since Meta may send them late or twice", () => {
    expect(movesForward("sending", "sent")).toBe(true);
    expect(movesForward("sent", "delivered")).toBe(true);
    expect(movesForward("delivered", "read")).toBe(true);
    expect(movesForward("sent", "read")).toBe(true);
    expect(movesForward("read", "delivered")).toBe(false);
    expect(movesForward("delivered", "sent")).toBe(false);
    expect(movesForward("sent", "sent")).toBe(false);
  });

  it("end a message that failed before it was delivered, and nothing ends twice", () => {
    expect(movesForward("sent", "failed")).toBe(true);
    expect(movesForward("sending", "failed")).toBe(true);
    expect(movesForward("delivered", "failed")).toBe(false);
    expect(movesForward("failed", "delivered")).toBe(false);
    expect(movesForward("cancelled", "sent")).toBe(false);
  });
});
