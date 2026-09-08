## 2026-09-08T05:00:00Z
You are Worker M1 for the SmartSpend AI enterprise-grade security remediation project.

Your Identity & Working Directory:
- Role: Security Implementation Worker (Milestone M1: R2 & R4)
- Working Directory: e:/smartspend_V1_fixed/.agents/worker_sec_m1/
- Project Root: e:/smartspend_V1_fixed
- Authoritative Request: e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md (MANDATORY: READ THIS FIRST!)
- Project Scope: e:/smartspend_V1_fixed/.agents/PROJECT.md
- Survey Reports to read:
  - e:/smartspend_V1_fixed/.agents/explorer_sec_r1_r4/report.md and handoff.md
  - e:/smartspend_V1_fixed/.agents/explorer_sec_r2_r3_r7/report.md and handoff.md
- Test Oracle: `tests/security/r2-injection-prevention.test.ts`
- Rules: Follow AGENTS.md in project root.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Exclusive File Ownership:
- `api/services/pro-report-engine.ts`
- `api/export-router.ts`
- `package.json`
- `package-lock.json`
- `.github/workflows/ci.yml`

Your Tasks:
1. R2 (Stored/Reflected XSS in HTML Reports):
   - In `api/services/pro-report-engine.ts`, implement robust HTML escaping for all user-controlled variables interpolated into HTML in `wrapReportAsPrintableHtml` (`userName`, `header`, `footer`, `alerts`, `text`).
   - Add `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';"/>` in `<head>`.
2. R2 & R4 (Spreadsheet Formula Injection Neutralization & ExcelJS Migration):
   - Replace `xlsx@0.18.5` with `exceljs@^4.4.0` in `package.json`.
   - Run `npm uninstall xlsx` and `npm install exceljs`.
   - In `api/export-router.ts`:
     - Refactor export handlers to use `exceljs` instead of `xlsx`.
     - Maintain the exact return contract: `{ format: "xlsx", data: base64String, filename: string }` and `{ format: "csv", data: string, filename: string }`.
     - Implement formula injection sanitization: prepend a single quote (`'`) to any string starting with `=`, `+`, `-`, `@`, `\t`, `\r` for both CSV and XLSX exports, preserving normal numbers (e.g. `150.00`) and pure JSON responses.
3. R4 (Automated Security Audit in CI):
   - In `.github/workflows/ci.yml`, add a dedicated `security-audit` job that runs `npm audit --audit-level=high`.
4. Verification:
   - Run `npx vitest run tests/security/r2-injection-prevention.test.ts`.
   - Run `npm audit --audit-level=high` (must show 0 vulnerabilities).
   - Run `npm run check` (must pass with 0 errors).
5. Output Deliverables:
   - Write your handoff report to `e:/smartspend_V1_fixed/.agents/worker_sec_m1/handoff.md`. Include test commands and outputs.
   - Send a message to the orchestrator with your results.
