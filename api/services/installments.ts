/**
 * «فاضل كام قسط»: where an installment plan stands. Payments already made before the plan
 * was added are the user's own count; later ones are, when the plan has a schedule of due dates,
 * the payments the user linked to them (partial ones included), else their recorded installment
 * expenses that name the plan (a word two plans share, or a partial payment, miscounts there).
 */
import Decimal from "decimal.js";

export interface InstallmentProgress {
  paid: number;
  remaining: number;
  remainingAmount: number;
  done: boolean;
  /** How later payments were counted: linked to due dates, or found by the plan's word. */
  countedBy: "linked" | "keyword" | "ambiguous";
}

export function installmentProgress(
  plan: { monthlyAmount: number; totalInstallments: number; paidBefore: number },
  paymentsRecorded: number,
): InstallmentProgress {
  const paid = Math.min(plan.totalInstallments, Math.max(0, plan.paidBefore) + Math.max(0, paymentsRecorded));
  const remaining = Math.max(0, plan.totalInstallments - paid);
  return {
    paid,
    remaining,
    remainingAmount: Math.round(remaining * plan.monthlyAmount * 100) / 100,
    done: remaining === 0,
    countedBy: "keyword",
  };
}

/**
 * Progress from what was linked to the plan's due dates: the amount left is exact (a partial payment counts for
 * what it paid), and an installment counts as paid once its whole amount is in.
 */
export function installmentProgressFromLinked(
  plan: { monthlyAmount: number; totalInstallments: number; paidBefore: number },
  linkedTotal: number | string | Array<number | string>,
): InstallmentProgress {
  const monthly = new Decimal(plan.monthlyAmount);
  const owedAfterBefore = monthly.times(Math.max(0, plan.totalInstallments - Math.max(0, plan.paidBefore)));
  const amounts = Array.isArray(linkedTotal) ? linkedTotal.map((value) => Decimal.max(new Decimal(value || 0), 0)) : null;
  const total = amounts ? amounts.reduce((sum, value) => sum.plus(value), new Decimal(0)) : new Decimal(linkedTotal as number | string || 0);
  const linked = Decimal.min(Decimal.max(total, 0), owedAfterBefore);
  const whole = monthly.gt(0) ? amounts ? amounts.filter((amount) => amount.gte(monthly)).length : linked.div(monthly).floor().toNumber() : 0;
  const paid = Math.min(plan.totalInstallments, Math.max(0, plan.paidBefore) + whole);
  const remainingAmount = owedAfterBefore.minus(linked).toDecimalPlaces(2).toNumber();
  return {
    paid,
    remaining: Math.max(0, plan.totalInstallments - paid),
    remainingAmount,
    done: remainingAmount <= 0,
    countedBy: "linked",
  };
}

/** Keyword matches are estimates by money paid, never by number of rows (a row can be a partial payment). */
export function installmentProgressFromRecorded(
  plan: { monthlyAmount: number; totalInstallments: number; paidBefore: number },
  amount: number | string,
): InstallmentProgress {
  return { ...installmentProgressFromLinked(plan, amount), countedBy: "keyword" };
}
