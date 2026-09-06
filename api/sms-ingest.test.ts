import { beforeEach, expect, it, vi } from "vitest";
import {
  webhookTokens,
  users,
  localUsers,
  financialCaptures,
} from "../db/schema";
import { smsApp } from "./sms-router";
const io = vi.hoisted(() => ({
  token: true,
  owner: true,
  quota: 0,
  failAuth: false,
  create: vi.fn(),
  find: vi.fn(),
}));
vi.mock("./queries/connection", () => ({
  getDb: () => ({
    select: () => ({
      from: (table: unknown) => {
        const chain = {
          where: () => chain,
          limit: async () => {
            if (io.failAuth)
              throw new Error(
                "database credential must not appear in response",
              );
            if (table === webhookTokens)
              return io.token ? [{ userId: 7, userType: "local" }] : [];
            if (table === users || table === localUsers)
              return io.owner ? [{ id: 7, plan: "free" }] : [];
            return [];
          },
          then: (resolve: (value: unknown) => void) =>
            Promise.resolve([
              { count: table === financialCaptures ? io.quota : 0 },
            ]).then(resolve),
        };
        return chain;
      },
    }),
  }),
}));
vi.mock("./services/financial-capture-store", () => ({
  captureHash: (v: unknown) => JSON.stringify(v),
  createCapture: io.create,
  findCaptureForRequest: io.find,
}));
vi.mock("./lib/settings-cache", () => ({
  getSystemSettings: async () => ({ sms_limit_free: "5" }),
}));
const payload = {
  message: "Paid EGP 100 at NETFLIX",
  sender: "Bank",
  timestamp: "2026-09-06T10:00:00Z",
};
const send = (body: unknown = payload, token = "test-" + Math.random()) =>
  smsApp.request("/ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  io.token = true;
  io.owner = true;
  io.failAuth = false;
  io.quota = 0;
  io.find.mockResolvedValue(null);
  io.create.mockResolvedValue({
    id: "capture",
    version: 1,
    state: "review",
    questions: [],
  });
});
it("authenticates before accepting any notification", async () => {
  expect((await send(payload, "")).status).toBe(401);
  io.token = false;
  expect((await send()).status).toBe(403);
  expect(io.create).not.toHaveBeenCalled();
});
it("owner identity comes from webhook token, never from message fields", async () => {
  const response = await send({ ...payload, userId: 99, userType: "oauth" });
  expect(response.status).toBe(202);
  expect(io.create.mock.calls[0][0]).toEqual({ id: 7, type: "local" });
  expect(await response.json()).toMatchObject({
    received: true,
    saved: false,
    status: "review",
  });
});
it("OTP is acknowledged as ignored without storing it", async () => {
  const response = await send({
    ...payload,
    message: "Your OTP is 234567 for payment EGP 100",
  });
  expect(await response.json()).toMatchObject({
    received: true,
    status: "ignored",
  });
  expect(io.find).not.toHaveBeenCalled();
  expect(io.create).not.toHaveBeenCalled();
});
it("validates notification field types and both size limits", async () => {
  expect((await send({ ...payload, sender: { bad: true } })).status).toBe(400);
  expect((await send({ ...payload, message: "x".repeat(12001) })).status).toBe(
    400,
  );
  expect((await send({ ...payload, message: "x".repeat(90000) })).status).toBe(
    413,
  );
  expect(io.create).not.toHaveBeenCalled();
});
it("replays an acknowledged capture without spending another quota slot", async () => {
  io.quota = 99;
  io.find.mockResolvedValue({
    id: "capture",
    version: 1,
    state: "saved",
    questions: [],
  });
  const response = await send();
  expect(await response.json()).toMatchObject({ received: true, saved: true });
  expect(io.create).not.toHaveBeenCalled();
});
it("a quota rejection is not a delivery acknowledgment", async () => {
  io.quota = 5;
  const response = await send();
  expect(response.status).toBe(429);
  expect((await response.json()).received).not.toBe(true);
  expect(io.create).not.toHaveBeenCalled();
});
it("a persistence failure tells the phone to retain and retry", async () => {
  io.create.mockRejectedValue(new Error("storage unavailable"));
  const response = await send();
  expect(response.status).toBe(503);
  expect((await response.json()).received).not.toBe(true);
});
it("an authentication storage failure never exposes credentials or acknowledges delivery", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  io.failAuth = true;
  try {
    const response = await send();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("credential");
    expect(warn).toHaveBeenCalledWith(
      "[SMS] Request could not be completed; retry is required",
    );
  } finally {
    warn.mockRestore();
  }
});
