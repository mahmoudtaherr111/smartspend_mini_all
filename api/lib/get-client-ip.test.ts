import { describe, expect, it } from "vitest";
import { getClientIp, getIncomingHeader } from "./get-client-ip";

describe("getIncomingHeader", () => {
  it("reads headers from a Fetch Request", () => {
    const req = new Request("http://localhost", {
      headers: {
        Authorization: "Bearer test-token",
        "x-forwarded-for": "203.0.113.1, 10.0.0.1",
      },
    });

    expect(getIncomingHeader(req, "Authorization")).toBe("Bearer test-token");
    expect(getIncomingHeader(req, "x-forwarded-for")).toBe(
      "203.0.113.1, 10.0.0.1",
    );
  });

  it("reads headers from a Hono-style request object", () => {
    const req = {
      header: (name: string) =>
        name === "x-real-ip" ? "198.51.100.2" : undefined,
    };

    expect(getIncomingHeader(req as never, "x-real-ip")).toBe("198.51.100.2");
  });
});

describe("getClientIp", () => {
  it("uses the first IP from x-forwarded-for on Fetch Request", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.5, 10.0.0.2" },
    });
    expect(getClientIp(req)).toBe("203.0.113.5");
  });

  it("falls back to cf-connecting-ip and x-real-ip", () => {
    const cfReq = new Request("http://localhost", {
      headers: { "cf-connecting-ip": "198.51.100.9" },
    });
    expect(getClientIp(cfReq)).toBe("198.51.100.9");

    const realReq = new Request("http://localhost", {
      headers: { "x-real-ip": "192.0.2.1" },
    });
    expect(getClientIp(realReq)).toBe("192.0.2.1");
  });

  it("returns 127.0.0.1 when no proxy headers exist", () => {
    const req = new Request("http://localhost");
    expect(getClientIp(req)).toBe("127.0.0.1");
  });
});
