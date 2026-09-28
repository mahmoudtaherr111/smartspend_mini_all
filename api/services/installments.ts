/**
 * «فاضل كام قسط»: where an installment plan stands. Payments already made before the plan
 * was added are the user's own count; later ones are their recorded installment expenses
 * that name the plan.
 */
export interface InstallmentProgress {
  paid: number;
  remaining: number;
  remainingAmount: number;
  done: boolean;
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
  };
}
