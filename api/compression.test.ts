import { describe, it, expect } from "vitest";
import { app } from "./boot";

describe("Compression & Precompressed Static Assets", () => {
  it("compresses large dynamic JSON responses when client accepts gzip", async () => {
    app.get("/api/test-compression-payload", (c) => {
      const largePayload = {
        data: "SmartSpend Egyptian Financial Platform ".repeat(100),
      };
      return c.json(largePayload);
    });

    const resGzip = await app.request("/api/test-compression-payload", {
      headers: {
        "Accept-Encoding": "gzip, deflate, br",
      },
    });

    expect(resGzip.status).toBe(200);
    expect(resGzip.headers.get("content-encoding")).toBe("gzip");
  });

  it("does not compress when client does not send Accept-Encoding", async () => {
    const res = await app.request("/api/test-compression-payload");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBeNull();
  });
});
