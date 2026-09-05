## 2026-08-26T09:51:44Z
You are the Implementation Worker for SmartSpend AI.

Your working directory is: E:/smartspend_V1_fixed/.agents/worker_1
You must write your implementation report to: E:/smartspend_V1_fixed/.agents/worker_1/handoff.md
Maintain your liveness heartbeat in: E:/smartspend_V1_fixed/.agents/worker_1/progress.md

Read these authoritative specification files before beginning:
1. E:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md
2. E:/smartspend_V1_fixed/AGENTS.md
3. E:/smartspend_V1_fixed/PROJECT.md
4. E:/smartspend_V1_fixed/.agents/explorer_survey_1/handoff.md
5. E:/smartspend_V1_fixed/.agents/explorer_survey_2/handoff.md
6. E:/smartspend_V1_fixed/.agents/explorer_survey_3/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Scope & File Ownership:
You have exclusive write ownership of:
- `package.json`
- `vite.config.ts`
- `api/boot.ts`

Tasks:
1. Install `vite-plugin-compression2` as a devDependency using npm (`npm install -D vite-plugin-compression2`).
2. Update `vite.config.ts`:
   - Import `compression, defineAlgorithm` from `vite-plugin-compression2` and `zlib` from `zlib`.
   - Remove the bespoke custom inline `precompressionPlugin()`.
   - Add `compression({...})` into Vite's `plugins` array with:
     - `algorithms: [defineAlgorithm("gzip", { level: 9 }), defineAlgorithm("brotliCompress", { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } })]`
     - `threshold: 1024`
     - `deleteOriginalAssets: false`
     - `skipIfLargerOrEqual: true`
     - `exclude: [/\.(png|jpg|jpeg|gif|webp|ico|woff|woff2|zip|gz|br|zst)$/]`
3. Update `api/boot.ts`:
   - Verify `serveStatic` configuration: `serveStatic({ root: "./dist/public", precompressed: true, onFound: (_path, c) => { ... } })`. Set `Cache-Control: public, max-age=31536000, immutable` for `/assets/*`, and `public, max-age=0, must-revalidate` for `/sw.js`, `/manifest.webmanifest`, `/index.html`.
   - Update `app.notFound()` SPA fallback to set `c.header("Cache-Control", "public, max-age=0, must-revalidate")` when returning `dist/public/index.html`.
4. Verification:
   - Run `npm run check` (verify 0 TypeScript errors).
   - Run `npm run build` (verify `vite build` and esbuild succeed, and `.br` and `.gz` files are emitted in `dist/public/` and `dist/public/assets/`).
   - Run `npm test` (verify all existing test suites pass).
5. Document all changes, file diffs, build & test verification outputs in `handoff.md`.
6. Send completion message to parent when done.
