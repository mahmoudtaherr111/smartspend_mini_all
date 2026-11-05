/**
 * The ledger's two-kind cutover (decision 0045) without a person at a terminal (decision 0049): every row is
 * migrated in bounded batches, and the `capture_financial_version` flag turns on only when no legacy row is left,
 * under the same exclusive lock the manual command uses (`npm run ledger:cashflow -- --apply --activate`). A ledger
 * with rows it cannot resolve stays as it is and the admin is told; nothing is guessed. Once active it does nothing.
 */
import { createLogger } from "../lib/log";
import { getSystemSettings } from "../lib/settings-cache";
import { activateCashflowIfClean, migrateFinancialBatch } from "../services/financial-migration";
import { notifyAdmins } from "../lib/capture/operations";

const log = createLogger("cashflow-cutover");

export async function runCashflowCutoverJob(): Promise<{ active: boolean; changed: number; unresolved: number }> {
  if ((await getSystemSettings()).capture_financial_version === "cashflow-v1") return { active: true, changed: 0, unresolved: 0 };
  let cursor = 0, changed = 0, unresolved = 0;
  // A bounded pass: a very large legacy ledger finishes over several runs.
  for (let batch = 0; batch < 200; batch++) {
    const result = await migrateFinancialBatch({ apply: true, cursor, batchSize: 200 });
    changed += result.changed;
    unresolved += result.unresolved.length;
    cursor = result.cursor;
    if (result.done) {
      if (unresolved > 0) break;
      const activation = await activateCashflowIfClean();
      log.info({ event: "cashflow.cutover", changed, activated: activation.activated, remaining: activation.remaining }, "Cashflow cutover pass");
      return { active: activation.activated, changed, unresolved };
    }
  }
  // Counts only: the rows are the users' money. Capture waits until the admin resolves them.
  log.warn({ event: "cashflow.cutover_blocked", changed, unresolved }, "Cashflow cutover left legacy rows it cannot resolve");
  await notifyAdmins(
    "تسجيل رسايل البنك مستني الدفتر",
    `فيه ${unresolved} عملية قديمة في الدفتر مش واضح هي داخلة ولا خارجة، فتحويل الدفتر للدخل والصرف ماخلصش والتسجيل من الرسايل مستني. شغّل npm run ledger:cashflow على السيرفر وشوف التقرير.`,
    "cashflow-cutover",
  );
  return { active: false, changed, unresolved };
}
