import type { ActionDraft, Artifact } from "../ai-kernel/types";
import type {
  BudgetCreatePayload,
  ExpenseCreatePayload,
  ExpenseRecategorizePayload,
  GoalCreatePayload,
  GoalStopPayload,
  GoalUpdatePayload,
  ProfileUpdatePayload,
  RuntimeActionName,
  RuntimeActionPayload,
  UndoPayload,
  WalletCreatePayload,
  WalletUpdatePayload,
} from "./types";

export function goalSummary(payload: GoalCreatePayload): string {
  const parts = [payload.title];
  if (payload.targetAmount) parts.push(`${payload.targetAmount.toLocaleString("ar-EG")} جنيه`);
  if (payload.targetDate) parts.push(`حتى ${payload.targetDate}`);
  return parts.join(" - ");
}

import { displayFinanceCategory } from "../finance-semantic-layer/category-matcher";

function displayCategoryAr(value: string | undefined): string {
  if (!value || value === "uncategorized") return "غير مصنف";
  return displayFinanceCategory(value);
}

export function actionSummary(actionName: RuntimeActionName, payload: RuntimeActionPayload): string {
  if (actionName === "goal.create") return goalSummary(payload as GoalCreatePayload);
  if (actionName === "goal.update") {
    const goal = payload as GoalUpdatePayload;
    return `تعديل هدف #${goal.goalId}${goal.title ? ` - ${goal.title}` : ""}${goal.targetAmount ? ` - ${goal.targetAmount.toLocaleString("ar-EG")} جنيه` : ""}`;
  }
  if (actionName === "goal.stop") {
    const goal = payload as GoalStopPayload;
    return `إيقاف هدف #${goal.goalId}${goal.reason ? ` - ${goal.reason.slice(0, 80)}` : ""}`;
  }
  if (actionName === "expense.create") {
    const expense = payload as ExpenseCreatePayload;
    return `تسجيل ${expense.amount.toLocaleString("ar-EG")} جنيه - ${displayCategoryAr(expense.category)}${expense.placeHint ? ` - ${expense.placeHint}` : ""}`;
  }
  if (actionName === "expense.recategorize") {
    const expense = payload as ExpenseRecategorizePayload;
    return `تعديل تصنيف مصروف #${expense.expenseId} إلى ${displayCategoryAr(expense.category)}`;
  }
  if (actionName === "budget.create") {
    const budget = payload as BudgetCreatePayload;
    return `اقتراح ميزانية: ${budget.title} - ${budget.monthlyLimit.toLocaleString("ar-EG")} جنيه${budget.category ? ` - ${displayCategoryAr(budget.category)}` : ""}`;
  }
  if (actionName === "profile.update") {
    const profile = payload as ProfileUpdatePayload;
    return `تعديل الملف الشخصي - ${profile.section}: ${Object.keys(profile.patch).join("، ")}`;
  }
  if (actionName === "wallet.create") {
    const wallet = payload as WalletCreatePayload;
    return `إضافة محفظة ${wallet.name} (${wallet.provider})`;
  }
  if (actionName === "wallet.update") {
    const wallet = payload as WalletUpdatePayload;
    return `تحديث محفظة #${wallet.walletId}${wallet.name ? ` - ${wallet.name}` : ""}${wallet.balance ? ` - رصيد ${wallet.balance}` : ""}`;
  }
  const undo = payload as UndoPayload;
  return `تراجع عن ${undo.targetActionName ?? "آخر عملية قابلة للتراجع"}`;
}

function actionTitle(actionName: RuntimeActionName): string {
  const titles: Record<RuntimeActionName, string> = {
    "goal.create": "تأكيد إنشاء الهدف",
    "goal.update": "تأكيد تعديل الهدف",
    "goal.stop": "تأكيد إيقاف الهدف",
    "expense.create": "تأكيد تسجيل المصروف",
    "expense.recategorize": "تأكيد تعديل التصنيف",
    "budget.create": "تأكيد خطة الميزانية",
    "profile.update": "تأكيد تعديل الملف الشخصي",
    "wallet.create": "تأكيد إضافة المحفظة",
    "wallet.update": "تأكيد تحديث المحفظة",
    "action.undo": "تأكيد التراجع",
  };
  return titles[actionName] ?? "تأكيد العملية";
}

export function actionConfirmationArtifact(action: ActionDraft): Artifact {
  return {
    id: `action_confirmation:${action.id}`,
    type: "action_confirmation",
    title: actionTitle(action.name as RuntimeActionName),
    payload: {
      actionId: action.id,
      actionName: action.name,
      summary: action.summary,
      risk: action.risk,
      fields: action.payload,
      confirmLabel: "تأكيد",
      cancelLabel: "إلغاء",
    },
  };
}
