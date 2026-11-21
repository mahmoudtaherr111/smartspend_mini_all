# 0046: Automatic capture uses atomic movement bundles and conservative linking

Date: 2026-11-04
Status: accepted; guarded, not activated

## Context
Model-first capture must save without per-payment confirmation. A fee can arrive inside a message, before it, or
after it. Retrying, undoing or editing must not create another payment or lose a user's edits.

## Decision
Use the shared writer's transactional primitives for principal, fee, tombstones and quota effects. Keep fee rows
individually accountable in the ledger, linked to their parent, and expose an atomic fee edit. Link a separate fee
only on a unique issuer-scoped reference plus its explicitly declared amount. Adopt an earlier row without changing
its edited contents. Do not recreate deleted fees. Keep bank evidence separate from editable ledger amounts.

For v4, amount/time similarity and approximate FX never justify a merge. Use compatible scoped references or
same-account balance evidence; otherwise keep ambiguity visible as waiting without guessing a ledger write.
Proved own-account legs enrich only wallet linkage. Recheck consent, current plan and operator controls at posting,
using short database locks after HTTP. Held releases obey current entitlement and consent, and count once.

## Validation and remaining release gates
Synthetic provider transport is the only mocked boundary in the automatic MySQL suite. HTTP intake, vault,
contract validation, queue leasing, ledger/quota/fees, concurrent undo, plan upgrade and operator-stop behavior are
real code. These tests do not qualify model accuracy, a physical Android phone, notification delivery or capacity.
Real private held-out messages and the approved rollout gates remain prerequisites for activation.
