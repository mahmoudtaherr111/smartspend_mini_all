# 0032. A bank whose recordings are taken back stops recording on its own, and the admin can undo a bank's recordings in bulk

- Status: accepted. Built in `api/lib/capture/operations.ts` (`runCaptureBreaker`, `previewBulkUndo`,
  `applyBulkUndo`, `captureFunnel`), the protected job `capture-breaker`, `captureAdmin.funnel` and
  `captureAdmin.bulkUndo`, the console's «الأرقام» tab (`src/components/admin/capture/AdminCaptureNumbers.tsx`), and
  `capture_events.source_slug` and `reader_version` (migration 0037).
- Decided and recorded: 2026-10-28, from the capture production plan (P4).

## Context
Recording on its own (decision 0030) trusts a bank's messages to keep their shape. When a bank changes its wording,
or a reader release reads it wrong, rows are written without a question until someone notices, and fixing them by
hand means editing users' ledgers one row at a time. The signals that would show which bank and reader wrote a row
are deleted after 30 days.

## Decision
1. **Each payment keeps its bank and reader version** (`capture_events.source_slug`, `reader_version`), so the numbers,
   the breaker and the bulk undo work for as long as the payment is kept.
2. **The breaker.** Every 15 minutes, for each bank, the payments recorded on their own in the last 24 hours: with
   twenty or more, and more than one in twenty taken back (undone, or deleted from the ledger), the bank is added to
   `capture_paused_sources` and its payments are asked about again. Only the admin takes it out of the list.
3. **The bulk undo.** The admin names a bank, a period, optionally a reader version, and whether only payments recorded
   on their own count (the default). The console counts first, then asks once more; each row is removed through the
   ledger writer, the payment stays as a tombstone so a late message does not bring it back, and the month's count is
   given back. At most 500 rows a run.
4. **The numbers.** Per bank and kind over 1, 7 or 30 days: recorded, waiting, held, dismissed, deleted, recorded on
   their own and taken back; the model queue's outcomes and its oldest waiting job; the stopped banks.

## Consequences
- A bank that changes its messages costs at most a day of wrong rows before it is asked about again, and those rows
  can be removed in one action.
- Signals the server ignored (codes, offers) are not stored, so the numbers start at what was kept.
- There is no alert channel to the admin yet: a stopped bank shows in the console and in the logs
  (`capture.breaker.tripped`). A canary account and alerts are left for later.
