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
  countedBy: "linked" | "keyword";
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
  linkedTotal: number | string,
): InstallmentProgress {
  const monthly = new Decimal(plan.monthlyAmount);
  const owedAfterBefore = monthly.times(Math.max(0, plan.totalInstallments - Math.max(0, plan.paidBefore)));
  const linked = Decimal.min(new Decimal(linkedTotal || 0), owedAfterBefore);
  const whole = monthly.gt(0) ? linked.div(monthly).floor().toNumber() : 0;
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
