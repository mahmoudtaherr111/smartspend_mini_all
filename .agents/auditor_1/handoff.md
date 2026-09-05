# Forensic Audit Report: Build-Time Pre-compression & Static Serving Cache Headers

**Work Product**: Static file pre-compression (`vite.config.ts`, `api/boot.ts`, `package.json`, `tests/static-compression.test.ts`, and build outputs)  
**Integrity Mode**: Development (with strict behavioral and test verification standard)  
**Verdict**: **INTEGRITY VIOLATION**

---

## 1. Observation

### 1.1 Source Code and Configuration Analysis

1. **`package.json` (`package.json:150`)**:
   - `vite-plugin-compression2` version `^2.5.3` is installed in `devDependencies`.
   - `node_modules/vite-plugin-compression2/package.json` was verified on disk (v2.5.3, MIT license).

2. **`vite.config.ts` (`vite.config.ts:8, 24–37`)**:
   - Legitimately imports and invokes `compression({...})` using `defineAlgorithm("gzip", { level: 9 })` and `defineAlgorithm("brotliCompress", { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } })`.
   - Filters: `threshold: 1024`, `skipIfLargerOrEqual: true`, `deleteOriginalAssets: false`, and `exclude: [/\.(png|jpg|jpeg|gif|webp|ico|woff|woff2|zip|gz|br|zst)$/]`.
   - No hardcoded test stubs or mock facades exist in `vite.config.ts`.

3. **`api/boot.ts` (`api/boot.ts:482–503`)**:
   - Configures `@hono/node-server/serve-static` with:
     ```typescript
     app.use(
       "/*",
       serveStatic({
         root: "./dist/public",
         precompressed: true,
         onFound: (_path, c) => {
           const reqPath = c.req.path;
           if (reqPath.startsWith("/assets/")) {
             c.header("Cache-Control", "public, max-age=31536000, immutable");
           } else if (
             reqPath === "/sw.js" ||
             reqPath === "/manifest.webmanifest" ||
             reqPath === "/index.html" ||
             reqPath === "/"
           ) {
             c.header("Cache-Control", "public, max-age=0, must-revalidate");
           } else {
             c.header("Cache-Control", "public, max-age=86400");
           }
         },
       }),
     );
     ```
   - **Flaw Detected in `@hono/node-server/dist/serve-static.js:154, 170–171`**:
     Inside `@hono/node-server`, `result = c.body(...)` creates and snapshots the HTTP `Response` object on line 154 *before* invoking `await options.onFound?.(path, c)` on line 170. Calling `c.header("Cache-Control", ...)` inside `onFound` mutates the context header bag, but does NOT modify `result.headers`. As a result, static asset responses are served with `Cache-Control: null`.

### 1.2 Build Outputs & Companion File Generation

- `npm run build` executed successfully (exit code 0).
- `dist/public/` contains genuine `.br` and `.gz` companions for assets $\ge 1024$ bytes:
  - `index.html` (15,991 B) $\rightarrow$ `index.html.br` (2,379 B), `index.html.gz` (3,000 B)
  - `manifest.webmanifest` (1,100 B) $\rightarrow$ `manifest.webmanifest.br` (432 B), `manifest.webmanifest.gz` (561 B)
  - Bundled JS (e.g. `index-CdCaOD_g.js` 529 KB $\rightarrow$ `.br` 131 KB, `.gz` 158 KB; `vendor-B77QgKtm.js` 351 KB $\rightarrow$ `.br` 93 KB, `.gz` 109 KB)
  - Bundled CSS (`index-BzN62tvf.css` 235 KB $\rightarrow$ `.br` 26 KB, `.gz` 35 KB)
- Sub-1KB assets (e.g. `check-DHGx9O-t.js` 120 B, `apple-By5jhh1v.js` 320 B) and binary files (`icon.png`, `.woff2` font files) correctly omit `.br` and `.gz` companions.

### 1.3 Test Suite Execution & Failure Logs

1. **`npm run check`**:
   - Result: **PASS** (exit code 0, 0 TypeScript errors).

2. **`npm run build`**:
   - Result: **PASS** (exit code 0, all chunks and companions compiled).

3. **`npm test`**:
   - Result: **FAIL** (exit code 1, 5 failed test files, 14 failed tests out of 567 total tests).
   - Verbatim breakdown of test failures:
     - **`tests/static-compression.test.ts` (9 failed tests)**:
       - `Tier 3 > serves JavaScript assets with proper Content-Type and 1-year immutable Cache-Control`: `AssertionError: expected null to be 'public, max-age=31536000, immutable'`
       - `Tier 3 > serves CSS assets with proper Content-Type and 1-year immutable Cache-Control`: `AssertionError: expected null to be 'public, max-age=31536000, immutable'`
       - `Tier 3 > serves WOFF2 fonts with font/woff2 and 1-year immutable Cache-Control`: `AssertionError: expected null to be 'public, max-age=31536000, immutable'`
       - `Tier 3 > serves index.html with text/html and must-revalidate Cache-Control`: `AssertionError: expected null to be 'public, max-age=0, must-revalidate'`
       - `Tier 3 > serves manifest.webmanifest with application/manifest+json and must-revalidate Cache-Control`: `AssertionError: expected null to be 'public, max-age=0, must-revalidate'`
       - `Tier 3 > serves sw.js service worker with must-revalidate Cache-Control`: `AssertionError: expected null to be 'public, max-age=0, must-revalidate'`
       - `Tier 4 > falls back to index.html for client-side SPA routes (e.g. /dashboard)`: `AssertionError: expected '<!doctype html>...' to contain '<!DOCTYPE html>'` (case sensitivity mismatch)
       - `Tier 4 > falls back to index.html for deep nested client routes`: `AssertionError: expected '<!doctype html>...' to contain '<!DOCTYPE html>'`
       - `Adversarial > prevents directory traversal attempts and returns 404`: `AssertionError: expected 200 to be 404`
     - **`tests/fonts-self-hosted.test.ts` (1 failed test)**:
       - `verifies service worker (sw.js) precaches variable font assets for 100% offline access`: expected `dist/public/sw.js` to precache variable fonts (`cairo-arabic-`).
     - **`src/components/pwa/PullToRefreshWrapper.test.ts` (1 failed test)**:
       - `guards rubberband dimension against 0 or undefined window.innerHeight`: regex formatting mismatch.
     - **`api/lib/e2e-classification.test.ts` & `api/lib/comprehensive-classification.test.ts` (3 failed tests)**:
       - MySQL database connection refused / test timeout (30s / 15s).

---

## 2. Logic Chain

1. **Premise 1**: The project requirements in `PROJECT.md` (Features 3, 5, 6) mandate that static file serving delivers fine-grained `Cache-Control` response headers (`public, max-age=31536000, immutable` for `/assets/*` and `public, max-age=0, must-revalidate` for HTML/PWA entrypoints) and that the test suite passes with 0 regressions.
2. **Premise 2**: In `api/boot.ts`, the implementation attempted to set `Cache-Control` via `onFound` in `serveStatic`.
3. **Premise 3**: Inspection of `@hono/node-server/dist/serve-static.js:154, 170` proves that `onFound` is executed after the response body and headers are constructed (`result = c.body(...)`). Calling `c.header(...)` inside `onFound` does not populate `result.headers`.
4. **Premise 4**: Direct empirical execution of `npm test` failed with 14 test errors across 5 test suites, with 6 tests directly failing because `res.headers.get("cache-control")` is `null`.
5. **Premise 5**: Under Integrity Forensics standard: "The build must succeed and tests must execute — a project that doesn't build or whose tests don't run is automatically flagged. If ANY check fails, your verdict is INTEGRITY VIOLATION and you MUST reject the work product."
6. **Inference**: Because the target deliverables fail behavioral test assertions and the claimed `Cache-Control` header policy is not functioning in the HTTP responses, the work product cannot be approved as clean.

---

## 3. Caveats

- The build pipeline (`vite.config.ts`, `vite-plugin-compression2`) is genuinely installed and emits valid, authentic Brotli quality 11 and Gzip level 9 binary streams without facade or mock implementations.
- No tests were maliciously deleted, skipped, or altered to fabricate passing marks.
- The root cause of the `Cache-Control` header failure is an architectural mismatch between `@hono/node-server/serve-static`'s execution order and `c.header()` context mutation. To fix it, static caching headers should be applied via a preceding middleware handler (e.g. `app.use('/assets/*', async (c, next) => { await next(); c.header('Cache-Control', 'public, max-age=31536000, immutable'); })`) or by adjusting the response in an outer middleware wrapper.

---

## 4. Conclusion

- **Verdict**: **INTEGRITY VIOLATION**
- **Reason**:
  1. `npm test` fails with 14 errors (including 9 in the new `tests/static-compression.test.ts` suite).
  2. `Cache-Control` header policy claimed in `api/boot.ts` does not attach to HTTP responses returned by `@hono/node-server/serve-static`.
  3. Case sensitivity in SPA fallback HTML assertions (`<!doctype html>` vs `<!DOCTYPE html>`) causes route tests to fail.

---

## 5. Verification Method

To independently reproduce the audit findings:

1. **Verify TypeScript Compilation**:
   ```bash
   npm run check
   ```
   *Result*: Passes with 0 errors.

2. **Verify Production Build & Companion Generation**:
   ```bash
   npm run build
   ```
   *Result*: Passes with 0 errors; `.br` and `.gz` files appear in `dist/public/` and `dist/public/assets/`.

3. **Verify Test Suite Failures**:
   ```bash
   npm test
   ```
   *Result*: Fails with 14 test failures across 5 test suites, demonstrating `res.headers.get("cache-control") === null`.
