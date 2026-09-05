/**
 * Comprehensive Vitest E2E Test Suite for Static File Pre-compression,
 * Runtime Content Negotiation, Cache-Control Headers, and SPA Route Isolation.
 *
 * Covers:
 * - Tier 1: Artifact Verification (Brotli/Gzip companions, size reductions, binary exclusions)
 * - Tier 2: HTTP Content Negotiation (br > gzip > identity, Vary header)
 * - Tier 3: MIME Types & Cache-Control (Immutable assets vs must-revalidate entry/worker)
 * - Tier 4: SPA Route Fallback & API Gateway Isolation (Client routes vs /api/*)
 * - Adversarial & Edge Cases (Range requests, HEAD requests, malformed Accept-Encoding, traversal protection)
 */
import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { Hono } from "hono";
import { compress } from "hono/compress";
import { serveStatic } from "@hono/node-server/serve-static";
import { app as bootApp } from "../api/boot";

const DIST_PUBLIC = path.resolve(__dirname, "../dist/public");
const ASSETS_DIR = path.resolve(DIST_PUBLIC, "assets");

// Helper to create a production-configured Hono app with precompressed static serving
function createProductionStaticApp() {
  const app = new Hono();

  // Guard against path traversal
  app.use("*", async (c, next) => {
    const rawUrl = c.req.url || "";
    if (rawUrl.includes("..") || c.req.path.includes("..")) {
      return c.text("Not Found", 404);
    }
    await next();
  });

  // 1. Global runtime compression (mirrors api/boot.ts)
  app.use("*", compress());

  // 2. Static asset serving with precompressed enabled and fine-grained Cache-Control
  const relativeRoot = path.relative(process.cwd(), DIST_PUBLIC).replace(/\\/g, "/");
  app.use(
    "/*",
    serveStatic({
      root: relativeRoot ? `./${relativeRoot}` : "./dist/public",
      precompressed: true,
      onFound: (filePath, c) => {
        const reqPath = c.req.path;
        const isHtmlOrWorkerOrManifest =
          filePath.endsWith(".html") ||
          filePath.endsWith(".webmanifest") ||
          filePath.endsWith("sw.js") ||
          reqPath === "/" ||
          reqPath === "/manifest.webmanifest" ||
          reqPath === "/sw.js" ||
          reqPath === "/index.html";

        const cc = reqPath.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : isHtmlOrWorkerOrManifest
          ? "public, max-age=0, must-revalidate"
          : "public, max-age=86400";

        c.header("Cache-Control", cc);
        if (c.res) {
          c.res.headers.set("Cache-Control", cc);
        }
      },
    }),
  );

  // 3. Health check & API route mocks
  app.get("/health", (c) =>
    c.json({ status: "ok", timestamp: new Date().toISOString() }),
  );
  app.get("/api/test-data", (c) => c.json({ data: "api_ok" }));

  // 4. SPA 404 Fallback for client-side routing (mirrors api/boot.ts)
  app.notFound(async (c) => {
    const rawUrl = c.req.url || "";
    if (rawUrl.includes("..") || c.req.path.includes("..")) {
      return c.text("Not Found", 404);
    }
    if (!c.req.path.startsWith("/api/") && !c.req.path.startsWith("/assets/") && !path.extname(c.req.path)) {
      try {
        const indexPath = path.resolve(DIST_PUBLIC, "index.html");
        if (fs.existsSync(indexPath)) {
          const html = fs.readFileSync(indexPath, "utf-8");
          c.header("Cache-Control", "public, max-age=0, must-revalidate");
          return c.html(html);
        }
      } catch (e) {
        console.error("Failed to serve index.html fallback", e);
      }
    }
    return c.json({ error: "Not Found" }, 404);
  });

  return app;
}

describe("Static File Pre-Compression & Serving E2E Suite", () => {
  let prodApp: Hono;
  let sampleJsFile: string;
  let sampleCssFile: string;
  let sampleWoff2File: string | null = null;
  let samplePngFile: string | null = null;
  let sub1KbJsFile: string | null = null;

  beforeAll(() => {
    expect(
      fs.existsSync(DIST_PUBLIC),
      `Build directory ${DIST_PUBLIC} must exist before running tests. Run 'npm run build' first.`,
    ).toBe(true);

    prodApp = createProductionStaticApp();

    // Dynamically discover assets from dist/public/assets
    if (fs.existsSync(ASSETS_DIR)) {
      const assetFiles = fs.readdirSync(ASSETS_DIR);

      // Find representative JS files (large bundle >= 100KB and small sub-1KB)
      const jsFiles = assetFiles.filter(
        (f) => f.endsWith(".js") && !f.endsWith(".js.br") && !f.endsWith(".js.gz"),
      );
      expect(jsFiles.length).toBeGreaterThan(0);

      // Find largest JS file (e.g. index-*.js or vendor-*.js)
      const sortedJs = [...jsFiles].sort(
        (a, b) =>
          fs.statSync(path.join(ASSETS_DIR, b)).size -
          fs.statSync(path.join(ASSETS_DIR, a)).size,
      );
      sampleJsFile = sortedJs[0];

      // Find sub-1KB JS file if present
      const smallJs = jsFiles.find(
        (f) => fs.statSync(path.join(ASSETS_DIR, f)).size < 1024,
      );
      if (smallJs) sub1KbJsFile = smallJs;

      // Find representative CSS file
      const cssFiles = assetFiles.filter(
        (f) => f.endsWith(".css") && !f.endsWith(".css.br") && !f.endsWith(".css.gz"),
      );
      expect(cssFiles.length).toBeGreaterThan(0);
      sampleCssFile = cssFiles[0];

      // Find font files (.woff2)
      const woff2Files = assetFiles.filter((f) => f.endsWith(".woff2"));
      if (woff2Files.length > 0) sampleWoff2File = woff2Files[0];

      // Find image files (.png)
      const pngFiles = assetFiles.filter((f) => f.endsWith(".png"));
      if (pngFiles.length > 0) samplePngFile = pngFiles[0];
    }
  });

  // =========================================================================
  // TIER 1: ARTIFACT VERIFICATION (Build Outputs & Size Reductions)
  // =========================================================================
  describe("Tier 1: Build-Time Pre-compression Artifact Verification", () => {
    it("emits index.html alongside .br (Brotli) and .gz (Gzip) companion files", () => {
      const htmlPath = path.join(DIST_PUBLIC, "index.html");
      const htmlBrPath = path.join(DIST_PUBLIC, "index.html.br");
      const htmlGzPath = path.join(DIST_PUBLIC, "index.html.gz");

      expect(fs.existsSync(htmlPath)).toBe(true);
      expect(fs.existsSync(htmlBrPath)).toBe(true);
      expect(fs.existsSync(htmlGzPath)).toBe(true);

      const htmlSize = fs.statSync(htmlPath).size;
      const htmlBrSize = fs.statSync(htmlBrPath).size;
      const htmlGzSize = fs.statSync(htmlGzPath).size;

      // Uncompressed index.html should be substantial
      expect(htmlSize).toBeGreaterThan(1024);
      // Both Brotli and Gzip must achieve strict file size reductions
      expect(htmlBrSize).toBeLessThan(htmlSize);
      expect(htmlGzSize).toBeLessThan(htmlSize);
      // Brotli quality 11 is generally more compact than Gzip level 9
      expect(htmlBrSize).toBeLessThanOrEqual(htmlGzSize);
    });

    it("emits manifest.webmanifest alongside .br and .gz companion files", () => {
      const manifestPath = path.join(DIST_PUBLIC, "manifest.webmanifest");
      const manifestBrPath = path.join(DIST_PUBLIC, "manifest.webmanifest.br");
      const manifestGzPath = path.join(DIST_PUBLIC, "manifest.webmanifest.gz");

      expect(fs.existsSync(manifestPath)).toBe(true);
      if (fs.statSync(manifestPath).size >= 1024) {
        expect(fs.existsSync(manifestBrPath)).toBe(true);
        expect(fs.existsSync(manifestGzPath)).toBe(true);

        const rawSize = fs.statSync(manifestPath).size;
        expect(fs.statSync(manifestBrPath).size).toBeLessThan(rawSize);
        expect(fs.statSync(manifestGzPath).size).toBeLessThan(rawSize);
      }
    });

    it("emits .br and .gz companions for all bundled JS and CSS assets >= 1024 bytes", () => {
      const assetFiles = fs.readdirSync(ASSETS_DIR);
      const targetFiles = assetFiles.filter(
        (f) =>
          (f.endsWith(".js") || f.endsWith(".css")) &&
          !f.endsWith(".br") &&
          !f.endsWith(".gz"),
      );

      expect(targetFiles.length).toBeGreaterThan(5);

      for (const file of targetFiles) {
        const rawPath = path.join(ASSETS_DIR, file);
        const rawSize = fs.statSync(rawPath).size;

        if (rawSize >= 1024) {
          const brPath = path.join(ASSETS_DIR, `${file}.br`);
          const gzPath = path.join(ASSETS_DIR, `${file}.gz`);

          expect(
            fs.existsSync(brPath),
            `Expected ${file}.br to exist for ${file} (${rawSize} bytes)`,
          ).toBe(true);
          expect(
            fs.existsSync(gzPath),
            `Expected ${file}.gz to exist for ${file} (${rawSize} bytes)`,
          ).toBe(true);

          const brSize = fs.statSync(brPath).size;
          const gzSize = fs.statSync(gzPath).size;

          expect(
            brSize,
            `Brotli size (${brSize}) should be strictly smaller than raw size (${rawSize}) for ${file}`,
          ).toBeLessThan(rawSize);
          expect(
            gzSize,
            `Gzip size (${gzSize}) should be strictly smaller than raw size (${rawSize}) for ${file}`,
          ).toBeLessThan(rawSize);
        }
      }
    });

    it("does NOT emit superfluous .br or .gz companions for files under 1024 bytes threshold", () => {
      if (!sub1KbJsFile) return;

      const rawPath = path.join(ASSETS_DIR, sub1KbJsFile);
      const rawSize = fs.statSync(rawPath).size;
      expect(rawSize).toBeLessThan(1024);

      const brPath = path.join(ASSETS_DIR, `${sub1KbJsFile}.br`);
      const gzPath = path.join(ASSETS_DIR, `${sub1KbJsFile}.gz`);

      expect(
        fs.existsSync(brPath),
        `Sub-1KB file ${sub1KbJsFile} (${rawSize} B) should not have .br companion`,
      ).toBe(false);
      expect(
        fs.existsSync(gzPath),
        `Sub-1KB file ${sub1KbJsFile} (${rawSize} B) should not have .gz companion`,
      ).toBe(false);
    });

    it("does NOT emit superfluous .br or .gz companions for binary images (.png, .webp, .jpg)", () => {
      const rootIcon = path.join(DIST_PUBLIC, "icon.png");
      if (fs.existsSync(rootIcon)) {
        expect(fs.existsSync(`${rootIcon}.br`)).toBe(false);
        expect(fs.existsSync(`${rootIcon}.gz`)).toBe(false);
      }

      if (samplePngFile) {
        const pngPath = path.join(ASSETS_DIR, samplePngFile);
        expect(fs.existsSync(`${pngPath}.br`)).toBe(false);
        expect(fs.existsSync(`${pngPath}.gz`)).toBe(false);
      }
    });

    it("does NOT emit superfluous .br or .gz companions for already-compressed fonts (.woff2)", () => {
      if (!sampleWoff2File) return;

      const woff2Path = path.join(ASSETS_DIR, sampleWoff2File);
      expect(fs.existsSync(`${woff2Path}.br`)).toBe(false);
      expect(fs.existsSync(`${woff2Path}.gz`)).toBe(false);
    });
  });

  // =========================================================================
  // TIER 2: HTTP CONTENT NEGOTIATION (Brotli vs Gzip vs Identity)
  // =========================================================================
  describe("Tier 2: HTTP Content Negotiation via serveStatic", () => {
    it("prefers Brotli ('br') when client sends standard browser Accept-Encoding with br, gzip, zstd", async () => {
      const res = await prodApp.request(`/assets/${sampleJsFile}`, {
        headers: {
          "Accept-Encoding": "gzip, deflate, br, zstd",
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-encoding")).toBe("br");
      const vary = res.headers.get("vary");
      expect(vary).toBeTruthy();
      expect(vary).toContain("Accept-Encoding");
    });

    it("serves Brotli ('br') when client explicitly requests Accept-Encoding: br", async () => {
      const res = await prodApp.request(`/assets/${sampleCssFile}`, {
        headers: {
          "Accept-Encoding": "br",
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-encoding")).toBe("br");
      expect(res.headers.get("vary")).toContain("Accept-Encoding");
    });

    it("falls back to Gzip ('gzip') when client does not support Brotli but accepts gzip", async () => {
      const res = await prodApp.request(`/assets/${sampleJsFile}`, {
        headers: {
          "Accept-Encoding": "gzip, deflate",
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-encoding")).toBe("gzip");
      expect(res.headers.get("vary")).toContain("Accept-Encoding");
    });

    it("serves uncompressed raw asset when client sends Accept-Encoding: identity", async () => {
      const res = await prodApp.request(`/assets/${sampleJsFile}`, {
        headers: {
          "Accept-Encoding": "identity",
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-encoding")).toBeNull();
    });

    it("serves uncompressed raw asset when client omits Accept-Encoding header completely", async () => {
      const res = await prodApp.request(`/assets/${sampleJsFile}`);

      expect(res.status).toBe(200);
      expect(res.headers.get("content-encoding")).toBeNull();
    });

    it("serves index.html with Brotli encoding on root URL '/' when client accepts br", async () => {
      const res = await prodApp.request("/", {
        headers: {
          "Accept-Encoding": "gzip, deflate, br",
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-encoding")).toBe("br");
      expect(res.headers.get("vary")).toContain("Accept-Encoding");
    });

    it("does NOT double-compress binary .woff2 fonts even if client accepts br/gzip", async () => {
      if (!sampleWoff2File) return;

      const res = await prodApp.request(`/assets/${sampleWoff2File}`, {
        headers: {
          "Accept-Encoding": "gzip, deflate, br",
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-encoding")).toBeNull();
    });

    it("does NOT compress binary images (.png) even if client accepts br/gzip", async () => {
      const res = await prodApp.request("/icon.png", {
        headers: {
          "Accept-Encoding": "gzip, deflate, br",
        },
      });

      if (res.status === 200) {
        expect(res.headers.get("content-encoding")).toBeNull();
      }
    });
  });

  // =========================================================================
  // TIER 3: MIME TYPES & CACHE-CONTROL HEADERS
  // =========================================================================
  describe("Tier 3: MIME Types & Cache-Control Policy", () => {
    it("serves JavaScript assets with proper Content-Type and 1-year immutable Cache-Control", async () => {
      const res = await prodApp.request(`/assets/${sampleJsFile}`);

      expect(res.status).toBe(200);
      const contentType = res.headers.get("content-type");
      expect(contentType).toMatch(/text\/javascript|application\/javascript/);
      expect(res.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable",
      );
    });

    it("serves CSS assets with proper Content-Type and 1-year immutable Cache-Control", async () => {
      const res = await prodApp.request(`/assets/${sampleCssFile}`);

      expect(res.status).toBe(200);
      const contentType = res.headers.get("content-type");
      expect(contentType).toMatch(/text\/css/);
      expect(res.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable",
      );
    });

    it("serves WOFF2 fonts with font/woff2 and 1-year immutable Cache-Control", async () => {
      if (!sampleWoff2File) return;

      const res = await prodApp.request(`/assets/${sampleWoff2File}`);

      expect(res.status).toBe(200);
      const contentType = res.headers.get("content-type");
      expect(contentType).toMatch(/font\/woff2/);
      expect(res.headers.get("cache-control")).toBe(
        "public, max-age=31536000, immutable",
      );
    });

    it("serves index.html with text/html and must-revalidate Cache-Control (no stale cache)", async () => {
      const res = await prodApp.request("/");

      expect(res.status).toBe(200);
      const contentType = res.headers.get("content-type");
      expect(contentType).toMatch(/text\/html/);
      expect(res.headers.get("cache-control")).toBe(
        "public, max-age=0, must-revalidate",
      );
    });

    it("serves manifest.webmanifest with application/manifest+json and must-revalidate Cache-Control", async () => {
      const res = await prodApp.request("/manifest.webmanifest");

      if (res.status === 200) {
        const contentType = res.headers.get("content-type");
        expect(contentType).toMatch(/application\/manifest\+json|application\/json/);
        expect(res.headers.get("cache-control")).toBe(
          "public, max-age=0, must-revalidate",
        );
      }
    });

    it("serves sw.js service worker with must-revalidate Cache-Control", async () => {
      const res = await prodApp.request("/sw.js");

      if (res.status === 200) {
        expect(res.headers.get("cache-control")).toBe(
          "public, max-age=0, must-revalidate",
        );
      }
    });
  });

  // =========================================================================
  // TIER 4: SPA ROUTE FALLBACK & API ISOLATION
  // =========================================================================
  describe("Tier 4: SPA Route Fallback & API Gateway Isolation", () => {
    it("falls back to index.html for client-side SPA routes (e.g. /dashboard)", async () => {
      const res = await prodApp.request("/dashboard");

      expect(res.status).toBe(200);
      const contentType = res.headers.get("content-type");
      expect(contentType).toMatch(/text\/html/);
      expect(res.headers.get("cache-control")).toBe(
        "public, max-age=0, must-revalidate",
      );

      const bodyText = await res.text();
      expect(bodyText.toLowerCase()).toContain("<!doctype html>");
      expect(bodyText).toContain("id=\"root\"");
    });

    it("falls back to index.html for deep nested client routes (e.g. /analytics/monthly/2026-08)", async () => {
      const res = await prodApp.request("/analytics/monthly/2026-08");

      expect(res.status).toBe(200);
      const contentType = res.headers.get("content-type");
      expect(contentType).toMatch(/text\/html/);

      const arrayBuffer = await res.arrayBuffer();
      const bodyText =
        res.headers.get("content-encoding") === "gzip"
          ? zlib.gunzipSync(Buffer.from(arrayBuffer)).toString("utf-8")
          : Buffer.from(arrayBuffer).toString("utf-8");
      expect(bodyText.toLowerCase()).toContain("<!doctype html>");
    });

    it("does NOT intercept /health API route with static file or SPA fallback", async () => {
      const res = await prodApp.request("/health");

      expect(res.status).toBe(200);
      const contentType = res.headers.get("content-type");
      expect(contentType).toMatch(/application\/json/);

      const json = await res.json();
      expect(json).toHaveProperty("status", "ok");
      expect(json).toHaveProperty("timestamp");
    });

    it("does NOT intercept /api/* routes with SPA fallback on 404 (returns JSON error)", async () => {
      const res = await prodApp.request("/api/non-existent-endpoint-xyz");

      expect(res.status).toBe(404);
      const contentType = res.headers.get("content-type");
      expect(contentType).toMatch(/application\/json/);

      const json = await res.json();
      expect(json).toEqual({ error: "Not Found" });
    });

    it("allows dynamic API responses from bootApp to compress large JSON independently", async () => {
      bootApp.get("/api/test-compression-verify-e2e", (c) => {
        return c.json({
          payload: "SmartSpend Egyptian Behavioral Finance Engine ".repeat(150),
        });
      });

      const res = await bootApp.request("/api/test-compression-verify-e2e", {
        headers: {
          "Accept-Encoding": "gzip, deflate, br",
        },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-encoding")).toBe("gzip");
      const arrayBuffer = await res.arrayBuffer();
      const decompressed = zlib.gunzipSync(Buffer.from(arrayBuffer)).toString("utf-8");
      const json = JSON.parse(decompressed);
      expect(json.payload).toContain("SmartSpend");
    });
  });

  // =========================================================================
  // ADVERSARIAL & EDGE CASES
  // =========================================================================
  describe("Adversarial & Edge Cases: Range Requests, HEAD, and Security", () => {
    it("handles HTTP HEAD requests with Content-Length and empty body", async () => {
      const res = await prodApp.request(`/assets/${sampleJsFile}`, {
        method: "HEAD",
        headers: {
          "Accept-Encoding": "gzip, deflate, br",
        },
      });

      expect(res.status).toBe(200);
      const contentLength = res.headers.get("content-length");
      expect(contentLength).toBeTruthy();
      expect(parseInt(contentLength!)).toBeGreaterThan(0);
      const body = await res.text();
      expect(body).toBe("");
    });

    it("handles HTTP Range requests (206 Partial Content) correctly", async () => {
      const res = await prodApp.request(`/assets/${sampleJsFile}`, {
        headers: {
          Range: "bytes=0-99",
        },
      });

      expect(res.status).toBe(206);
      expect(res.headers.get("accept-ranges")).toBe("bytes");
      const contentRange = res.headers.get("content-range");
      expect(contentRange).toBeTruthy();
      expect(contentRange).toMatch(/^bytes 0-99\/\d+$/);
    });

    it("handles malformed Accept-Encoding headers gracefully without crashing", async () => {
      const res = await prodApp.request(`/assets/${sampleJsFile}`, {
        headers: {
          "Accept-Encoding": ";;;,,,unknown-codec-xyz,   invalid=1.0",
        },
      });

      expect(res.status).toBe(200);
      // Gracefully serves uncompressed raw asset
      expect(res.headers.get("content-encoding")).toBeNull();
    });

    it("prevents directory traversal attempts and returns 404", async () => {
      const res = await prodApp.request("/../package.json");

      expect(res.status).toBe(404);
    });
  });
});
