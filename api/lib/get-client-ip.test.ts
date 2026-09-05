import { beforeEach, describe, expect, it } from "vitest";
import { env } from "./env";
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
  beforeEach(() => {
    env.TRUSTED_PROXY_HEADER = "x-forwarded-for";
  });

  it("uses the rightmost trusted IP from x-forwarded-for to prevent spoofing", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "203.0.113.5, 198.51.100.22" },
    });
    expect(getClientIp(req, "127.0.0.1")).toBe("198.51.100.22");
  });

  it("ignores forwarded headers when the immediate peer is not trusted", () => {
    const req = new Request("http://localhost", {
      headers: {
        "cf-connecting-ip": "198.51.100.9",
        "x-real-ip": "192.0.2.1",
        "x-forwarded-for": "203.0.113.1, 10.0.0.1",
      },
    });
    expect(getClientIp(req, "203.0.113.200")).toBe("203.0.113.200");
  });

  it("uses only the explicitly configured proxy header", () => {
    const req = new Request("http://localhost", {
      headers: {
        "cf-connecting-ip": "198.51.100.9",
        "x-real-ip": "192.0.2.1",
        "x-forwarded-for": "203.0.113.1, 10.0.0.1",
      },
    });
    expect(getClientIp(req, "::1")).toBe("10.0.0.1");
  });

  it("normalizes IPv6-mapped IPv4 addresses", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "::ffff:203.0.113.199" },
    });
    expect(getClientIp(req, "127.0.0.1")).toBe("203.0.113.199");
  });

  it("rejects malformed forwarded values instead of using them as limiter keys", () => {
    const req = new Request("http://localhost", {
      headers: { "x-forwarded-for": "attacker-controlled-value" },
    });
    expect(getClientIp(req, "127.0.0.1")).toBe("127.0.0.1");
  });

  it("returns 127.0.0.1 when no proxy headers exist and no socket IP", () => {
    const req = new Request("http://localhost");
    expect(getClientIp(req)).toBe("127.0.0.1");
  });
});
