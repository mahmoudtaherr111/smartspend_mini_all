## 2026-08-29T12:07:09Z
You are a teamwork_preview_test_writer assigned to write comprehensive security regression test suites for SmartSpend.
Your working directory is: e:/smartspend_V1_fixed/.agents/worker_e2e_tests
The authoritative user request is: e:/smartspend_V1_fixed/.agents/ORIGINAL_REQUEST.md
The security audit report is: e:/smartspend_V1_fixed/SECURITY_AUDIT_REPORT.md
Survey analysis references: e:/smartspend_V1_fixed/.agents/explorer_survey_1/survey_phase1.md, e:/smartspend_V1_fixed/.agents/explorer_survey_2/survey_phase2.md, e:/smartspend_V1_fixed/.agents/explorer_survey_3/survey_phase3_4.md

Tasks to Implement:
1. Write security regression tests verifying:
   - Business BOLA: verify updateCategory, removeCategory, linkContact reject unauthorized tenant access (wrong userId / userType).
   - Subscription Expiry: verify cancelled subscriptions downgrade to expired plan after endDate.
   - Cryptographic OTP: verify OTP generation format and randomness.
   - Admin Backup: verify API keys and secrets are masked.
   - Expense Router BOLA: verify create and batchCreate reject unowned walletId and businessId.
   - Client IP & Rate Limiting: verify IP anti-spoofing and isolated bucket behavior.
   - Zod Validation Bounds: verify invalid wallet balances, negative amounts, oversized strings, and invalid dates are rejected.
   - Error Sanitization: verify tRPC errors do not leak stack traces or raw SQL in production mode.
2. Run vitest on all new security test files.
3. Document all test suites and results in e:/smartspend_V1_fixed/.agents/worker_e2e_tests/test_report.md and handoff in e:/smartspend_V1_fixed/.agents/worker_e2e_tests/handoff.md.
When done, notify parent with send_message.
