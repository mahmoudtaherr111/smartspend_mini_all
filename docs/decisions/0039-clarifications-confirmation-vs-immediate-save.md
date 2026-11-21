# 0039. Clarifications use optimistic immediate save with undo banner instead of blocking confirmation modals

- Status: accepted
- Decided and recorded: 2026-10-31, resolving GAP-01 from the expense-capture system review.

## Context
When entering expenses via natural language (typed or spoken Egyptian Arabic), ambiguous sentences (such as an unknown person name, unclear merchant, or multiple implied line items) trigger a clarification stored in `pending_clarifications`.
When the user answers the clarification:
1. `expense.answerClarification` immediately persists the resolved expense transaction(s) into the database ledger.
2. The UI notifies the user that the expense was saved and offers an immediate "تراجع" (Undo) banner / snackbar.
3. GAP-01 raised the design question of whether answering a clarification should display an intermediate blocking confirmation modal prior to saving, and noted that legacy clarifications created before source capture defaulted to `manual`.

## Decision
1. **Immediate save with undo banner.** Answering a clarification immediately finalizes the expense creation and presents a visible undo notice. We do not insert a blocking confirmation step.
   - *Micro-transaction speed:* Daily expense tracking in Egypt involves high frequency, rapid micro-transactions (kiosk purchases, public transit, delivery tips). Friction and extra confirmation taps are the primary cause of tracking abandonment.
   - *Voice recording flow:* Voice input is typically used on-the-go (driving, walking, carrying items). Once the user clarifies the ambiguous detail, requiring another tap to confirm defeats the hands-free speed of voice capture.
   - *Safe and non-destructive reversal:* The transaction can be undone immediately with a single tap on the undo banner, or deleted/edited at any subsequent time from the transaction detail sheet.
   - *Network idempotency:* Over flaky mobile network connections, multi-phase confirmation flows create dangling client states, timeout confusion, and duplicate submission risks. Direct mutation with idempotency keys (`clientRequestId`) is much more reliable.
2. **Preserve source fidelity.** For all contemporary captures, the origin source (`voice`, `manual`, `image`, `sms`) is preserved from the initial intake pipeline through clarification resolution. Legacy records without a stored source falling back to `manual` is retained as an acceptable schema migration default.

## Consequences
- Fast, fluid recording experience with sub-second feedback.
- The undo banner must remain clearly visible for an adequate duration (5-7 seconds) with accessible contrast and haptic feedback.
- GAP-01 in `docs/systems/expense-capture.md` is resolved as an intentional architectural trade-off.
