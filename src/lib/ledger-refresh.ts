import type { trpc } from "@/providers/trpc";

type Utils = ReturnType<typeof trpc.useUtils>;

/**
 * Everything on screen that is computed from the ledger, refreshed after any write to it:
 * a save, an edit, an undo, a delete, an answered question, a confirmed bank suggestion, a
 * receipt, an action confirmed in the AI Center. Each write used to refresh the three
 * queries its author thought of, so a delete from the list left the month's totals, the
 * installments, the seasons and «ليك وعليك» showing the old numbers.
 */
export function refreshLedgerViews(utils: Utils): void {
  void utils.expense.invalidate();
  void utils.budget.invalidate();
  void utils.wallet.invalidate();
  void utils.ai.getUserLimits.invalidate();
}
