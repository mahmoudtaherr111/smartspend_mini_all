/** Maintenance CLI. Preview is the default; flags are explicit and reports contain no descriptions or money. */
import "dotenv/config";
import { migrateFinancialBatch, rollbackFinancialBatch, activateCashflowIfClean } from "../../api/services/financial-migration";
import { mysqlPool } from "../../api/queries/connection";

async function main() {
  const args = new Set(process.argv.slice(2));
  const allowed = new Set(["--apply", "--rollback", "--activate"]);
  if ([...args].some((arg) => !allowed.has(arg)) || (args.has("--rollback") && args.has("--activate"))) throw new Error("arguments");
  if (args.has("--rollback") && !args.has("--apply")) throw new Error("rollback_requires_apply");
  if (args.has("--activate") && !args.has("--apply")) throw new Error("activate_requires_apply");
  let cursor = 0, scanned = 0, changed = 0, unresolvedCount = 0;
  const unresolved: Array<{ id: number; reason: string }> = [];
  const report = (rows: Array<{ id: number; reason: string }>) => {
    unresolvedCount += rows.length;
    unresolved.push(...rows.slice(0, Math.max(0, 100 - unresolved.length)));
  };
  for (;;) {
    if (args.has("--rollback")) {
      const batch = await rollbackFinancialBatch({ cursor, batchSize: 100 });
      changed += batch.restored; report(batch.skipped); cursor = batch.cursor;
      if (batch.done) break;
    } else {
      const batch = await migrateFinancialBatch({ apply: args.has("--apply"), cursor, batchSize: 100 });
      scanned += batch.scanned; changed += batch.changed; report(batch.unresolved); cursor = batch.cursor;
      if (batch.done) break;
    }
  }
  const activation = args.has("--activate") && !unresolvedCount ? await activateCashflowIfClean() : { activated: false };
  process.stdout.write(`${JSON.stringify({ apply: args.has("--apply"), rollback: args.has("--rollback"), scanned, changed, unresolvedCount, unresolvedSample: unresolved, activation }, null, 2)}\n`);
  if (unresolvedCount || (args.has("--activate") && !activation.activated)) process.exitCode = 1;
}
main().catch(() => { process.stderr.write("Financial migration did not finish. Check the private database and arguments; no values are printed.\n"); process.exitCode = 2; })
  .finally(async () => { await mysqlPool.end(); });
