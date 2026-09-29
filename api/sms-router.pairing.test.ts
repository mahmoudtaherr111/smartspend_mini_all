/**
 * The iOS Shortcut pairing code and the ingest rate limit are shared state (api/lib/redis-client.ts#stateSet), not
 * process memory: a code created by the request that reached one replica must be exchangeable on another.
 */
import { describe, expect, it, vi } from "vitest";

const { selectLimit } = vi.hoisted(() => ({ selectLimit: vi.fn(async () => [{ token: "live-webhook-token" }]) }));

vi.mock("./queries/connection", () => {
  const chain = { from: () => chain, where: () => chain, limit: selectLimit };
  const db = { select: () => chain };
  return { db, getDb: () => db };
});

import { smsApp, storeMagicCode } from "./sms-router";

async function exchange(code: string) {
  return smsApp.request("/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
}

describe("iOS Shortcut pairing codes", () => {
  it("hands out the user's current webhook token for a code, once", async () => {
    const code = await storeMagicCode(41, "local");
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    const first = await exchange(code.toLowerCase());
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ success: true, token: "live-webhook-token" });

    expect((await exchange(code)).status).toBe(401);
  });

  it("retires the previous code when the user asks for a new one", async () => {
    const older = await storeMagicCode(42, "oauth");
    const newer = await storeMagicCode(42, "oauth");

    expect((await exchange(older)).status).toBe(401);
    expect((await exchange(newer)).status).toBe(200);
  });

  it("refuses a code whose user no longer has a webhook token", async () => {
    const code = await storeMagicCode(43, "local");
    selectLimit.mockResolvedValueOnce([]);
    expect((await exchange(code)).status).toBe(401);
  });
});
