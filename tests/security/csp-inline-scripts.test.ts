import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { inlineScriptHashes, securityHeaders } from "../../api/lib/security-headers";

const sha = (text: string) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

async function scriptSrc(isProduction: boolean, hashes: string[]) {
  const app = new Hono();
  app.use("*", securityHeaders(isProduction, hashes));
  app.get("/", (c) => c.text("ok"));
  const csp = (await app.request("/")).headers.get("content-security-policy") ?? "";
  return csp.split(";").map((part) => part.trim()).find((part) => part.startsWith("script-src")) ?? "";
}

describe("inline scripts under the content security policy", () => {
  it("hashes each inline script's exact text and skips scripts loaded by src", () => {
    const html = `<head><script>
  var a = 1;
</script><script type="module" crossorigin src="/assets/index.js"></script></head>
<body><script>window.b = 2;</script></body>`;
    expect(inlineScriptHashes(html)).toEqual([sha("\n  var a = 1;\n"), sha("window.b = 2;")]);
  });

  it("finds both inline scripts of the app's page", () => {
    const page = fs.readFileSync(path.resolve(__dirname, "../../index.html"), "utf8");
    expect(inlineScriptHashes(page)).toHaveLength(2);
  });

  it("allows inline scripts in production only by hash", async () => {
    const hashes = [sha("window.b = 2;")];
    const production = await scriptSrc(true, hashes);
    expect(production).not.toContain("'unsafe-inline'");
    expect(production).toContain(hashes[0]);
    expect(production).toContain("'self'");
    expect(production).toContain("https://challenges.cloudflare.com");

    // Development keeps Vite's inline scripts working.
    expect(await scriptSrc(false, [])).toContain("'unsafe-inline'");
  });
});
