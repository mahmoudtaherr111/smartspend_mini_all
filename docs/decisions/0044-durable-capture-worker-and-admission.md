# 0044. Durable identity maps and capture-only resource admission

- Status: implemented behind reader/financial cutover and qualification controls; full automatic ledger cutover pending.
- Date: 2026-11-04.

## Decision
Identity-map ciphertext is scoped by AES-256-GCM authenticated data to both owner fields, device, signal id and the
redacted text hash. Keys are domain-separated from the gateway key ring, with rotation but no plaintext fallback.
The stored redacted payload can be rehydrated on a different worker; original values never form the provider prompt.

Capture's cost and capacity are reserved in MySQL before each HTTP attempt, under a short daily row lock. Monthly
owner counters are distinct from general AI budgets. A reservation expires for capacity but not for uncertain
spending; an actual-usage settlement is idempotent and owner-scoped. Account deletion clears private reservations and
owner counters, while anonymous daily cost remains. Creating a reservation and changing consent lock the identity row
to prevent resurrection after deletion. Calls and follow-up consent reads do not acquire a second pool connection
from inside a write transaction. No model call takes place in a database transaction.

The model-first intake does not trust the old reader's semantic veto. The worker requires consent, account existence,
financial readiness and an exact current model/source qualification. Two distinct approved admin providers are required;
invalid caps and unknown pricing fail closed. Semantic failures try one other route; outages and disabled/budget-blocked
states have bounded durable retries. Pending model jobs do not receive the finished-job seven-day expiry.

## Deployment
Migrations 0044 and 0045 add resource tables and retention indexes. They were tested on a disposable local MySQL;
production migrations and feature activation are separate actions. Optional-table cleanup is safe before installation.
`capture_read_mode` remains reader_first and `capture_financial_version` empty until the shared ledger, clients,
qualification and capacity work completes. A settings value alone is not evidence of measured production readiness.
