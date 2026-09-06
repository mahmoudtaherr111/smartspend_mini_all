# JOURNEY / J0 — 2026-09-06

**Status: implementation checkpoint, not a production-ready classification release.** Work is on `codex/classification-journey-20260906`, based on prompt/accounting commit `efd812b` plus G1-R changes from `5633beb`. Main and the original working copy were not used for edits.

## What changed

- Notifications and receipt images now create owner-scoped durable drafts instead of directly inserting financial records. `capture.answer` updates one event field with a checked version; `capture.confirm` revalidates and saves all events, details, rollups and a repeatable receipt in one MySQL transaction.
- A shared review inbox displays source text, all events, missing facts and blocking reasons. It reports saved counts from the returned receipt. Network failure is not a success toast. Typed answers cannot overwrite neighbouring events.
- Notification extraction separates explicit currency amounts from balance, fees and reference digits; preserves unknown/pending/rejected/refund meanings; excludes OTP before storage. Named services can suggest subscription categories; recurring/renewal text is required for that claim. Fawry/Amazon alone do not identify purchases.
- Receipt vision uses the mapped model and structured evidence validated locally. It preserves multiple payments, checks arithmetic, treats invoices as unproven payment, rejects incomplete/invalid model output and oversized encoded images. Removed the unused legacy first-amount OCR helper and its misleading confidence test; replaced it with tests of the actual vision boundary.
- Image input/output/cache/total usage is recorded before rejecting invalid output, using the existing admin accounting metadata contract. Provider failures retain unknown usage/cost. Result replay records a local zero-cost operation, not fabricated provider cache tokens. Vision prices remain unavailable until a verified route/rate binding exists.
- Removed unnecessary month-expense, dictionary and profile queries from image extraction. Result replay bypasses vision once a draft exists. Concurrent first requests can still duplicate external vision calls; DB idempotency is not provider-call deduplication.
- Android source was truncated and did not form a valid service. Restored the class structure and added a durable bounded delivery queue scoped to token + endpoint; only acknowledged items are removed. Added explicit pairing-destination confirmation, HTTPS/path validation and disabled redirects. **APK/device behaviour is not verified.** Package lists are not a verified catalogue.
- Added selected text safety guards for Egyptian negation/object suffixes, price vs number «تمن», repeated events and unsupported financial relationships. These guards do not solve the underlying fact extraction failures.
- Integrated G1-R test inventory/reporting, added new tests to the core list, added the inventory command to CI, and added a real MySQL capture job. The existing general test job now provisions its required disposable database. New challenge CI intentionally fails on unsolved cases and uploads a per-run report rather than a stale tracked report.
- Updated authoritative SMS and classification documentation to match actual call paths. Research, UX scenarios, Mermaid flow, architectural gaps and prioritised completion stages are in [the journey design](../../classification-journey-design-2026-09-06.md).

## Verification

| Check | Result | Meaning / limits |
| --- | --- | --- |
| `npm run test:classification:core` | 946 passed / 57 files | Offline established core plus added guards, UI, notification HTTP boundary and vision/usage mocks |
| `npm run test:classification:manifest` | 12 passed | Included/excluded test inventory and command consistency; static check, not proof that every reachable line is tested |
| `RUN_CAPTURE_MYSQL_INTEGRATION=1 npm run test:capture:mysql` | 13 passed on MySQL 8 | Duplicate intakes/confirms, lost-response replay, owner-type isolation, stale answers, equal-amount distinct events, partial insert rollback, expiry/dismiss, foreign business, migration/ORM parity |
| `npm run test` with disposable MySQL | 46 passed / 12 files | General auth/storage/rollup tests; previously 8 failures without valid test DB reproduced on the prior branch and disappeared with Docker |
| Admin usage display / ledger UI | 5 passed / 2 files | Existing provider-neutral UI contract remains compatible |
| `npm run check` | Passed, including new QA tests | New tests are explicitly included in `tsconfig.qa.json`, not merely transpiled by Vitest |
| `npm run build` | Passed | Browser/PWA/backend build; generated tracked dist files restored rather than committed |
| Changed-file ESLint comparison | No introduced diagnostics; 67 baseline → 55 current | Legacy violations remain; this is not a clean repository-wide lint claim |
| `npm run report:classification:core` | Success, 172 cases | triple F1 0.8885; amount F1 0.9808; 4 wrong triple/count automatic accepts of 85 (4.71%); 7 with any scored error of 85 (8.24%) |
| `npm run qa:classification:journey` | **Fails: 89 / 100 cases match specified fields** | 50 synthetic notifications, 30 local texts, 20 post-OCR document inputs; not production accuracy and not all-field accuracy |

The 172-case report being green does not mean 100% correctness or an acceptable auto-save error rate. Its current thresholds permit the above errors. Those thresholds were not weakened here.

The first challenge run had 72/100 under v1 labels. Four annotation corrections were recorded in `label-revisions.json`. Rescoring the saved first-run results with v2 labels gives **70/100**, versus **89/100** now. This is improvement between iterations **within this development round**, not a comparison against the original production classifier. `challenge-fixture-v1.json` was recovered byte-for-byte with its original SHA; v2 is in the QA fixture directory. Do not advertise 89% as product accuracy.

Open challenge IDs: SMS-046; TXT-007, 009, 012, 014, 015, 017, 018, 021, 024, 030. SMS-046 needs annotation/merchant-boundary adjudication for a cropped source; the remaining text cases expose deeper extraction/intent limitations. None was quietly removed.

## Migration and operation

- New `db/migrations/0022_financial_capture_loop.sql`; journal entry and ORM relations/table class included. Applied to a probe table and compared actual MySQL columns/indexes to ORM-created `financial_captures`: passed.
- Test DB only: container `smartspend-capture-test-20260906`, MySQL 8, `127.0.0.1:33071/capture_test`. No production migration executed. Docker container retained because the user started Docker for continued testing.
- A fresh test schema was created by `drizzle-kit push --force` **only inside the disposable database**. This does not verify replay of the complete historical production migration chain. Existing missing migration snapshots should be reconciled before relying on future automatic generation.
- Deploying the new backend without migration 0022 would break capture intake. No deployment or merge to main was done.
- Review expires after 30 days. Non-saved rows are eligible for cleanup seven days after expiry; saved receipts remain. Account purge includes capture rows for both auth types. Saved-source minimization and local Android queue retention are not complete privacy lifecycle implementations.
- The capture writer updates cache generations with a bounded response wait; prolonged cache failure can still expose stale aggregates. Durable invalidation/outbox remains a follow-up.

## Mandatory next work (do not start with more keyword patches)

1. Build money-role and event-relationship extraction: price/unit/quantity/paid total, principal/installment/fee, repeated payment/refund, negation scope and actor/direction. Define an evidence-bearing semantic extraction contract before using an LLM to repair them.
2. Extend the review loop for splitting fees/events, adding/removing an event, resolving contradictory evidence and linking refunds/debts/transfers. The current fee/crop/arithmetic blockers preserve safety but often require re-entry; they are not a finished UX.
3. Connect text/voice and other writing paths to the same validated draft/transaction boundary. Contract enum support is not actual endpoint integration. Preserve source text and question context across all routes.
4. Add ambiguity-based semantic fallback to the new notification path; it currently uses local extraction plus human review only. Category-only fallback cannot fix missing events or wrong amounts. Use model mapping and verified capabilities, not hardcoded provider/model combinations.
5. Correlate different observations of the same financial event (receipt + bank SMS, pending + completion + reversal); request idempotency alone cannot solve this.
6. Gather consented, redacted production-like SMS/audio/images across banks, wallets, devices and language variations. Create independent holdout and risk/coverage calibration; run signed APK and actual iOS shortcut tests. No public source proves complete bank-template coverage.
7. Atomic quotas, provider-call reservations/single-flight, image provider capabilities/rates, durable usage/invalidation outboxes, new admin capture visibility, and realistic latency/fault/load measurements.

## Self-review / known limitations

No independent agent review was claimed. This round's review includes real DB faults, request-boundary tests, UI rendering tests, source tracing and new adversarial development inputs; it is not a substitute for independent code review and device testing.

New images and notifications are **review-first**, which is a deliberate behaviour change and can increase user effort. The original task's desired selective automation is not complete. Foreign currency/refund/debt cannot be confirmed through this writer yet; wallet/contact attribution and learned corrections from this inbox are not integrated. The legacy admin SMS logs do not show new capture rows. Some old usage rollups discard unknown-cost semantics despite the detailed admin rows displaying unknown correctly. Vision extraction still uses the Gemini SDK and the new key/provider capability fallback is not complete. These are release blockers or follow-ups, not work silently reported as closed.
