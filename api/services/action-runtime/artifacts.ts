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
  if (payload.targetAmount) parts.push(`${payload.targetAmount} EGP`);
  if (payload.targetDate) parts.push(`until ${payload.targetDate}`);
  return parts.join(" - ");
}

function displayCategory(value: string | undefined): string {
  const categories: Record<string, string> = {
    food: "food",
    transport: "transport",
    shopping: "shopping",
    health: "health",
    bills: "bills",
    saving: "saving",
    uncategorized: "uncategorized",
  };
  return categories[value ?? ""] ?? value ?? "uncategorized";
}

export function actionSummary(actionName: RuntimeActionName, payload: RuntimeActionPayload): string {
  if (actionName === "goal.create") return goalSummary(payload as GoalCreatePayload);
  if (actionName === "goal.update") {
    const goal = payload as GoalUpdatePayload;
    return `Update goal #${goal.goalId}${goal.title ? ` - ${goal.title}` : ""}${goal.targetAmount ? ` - ${goal.targetAmount} EGP` : ""}`;
  }
  if (actionName === "goal.stop") {
    const goal = payload as GoalStopPayload;
    return `Stop goal #${goal.goalId}${goal.reason ? ` - ${goal.reason.slice(0, 80)}` : ""}`;
  }
  if (actionName === "expense.create") {
    const expense = payload as ExpenseCreatePayload;
    return `Record expense ${expense.amount} EGP - ${displayCategory(expense.category)}${expense.placeHint ? ` - ${expense.placeHint}` : ""}`;
  }
  if (actionName === "expense.recategorize") {
    const expense = payload as ExpenseRecategorizePayload;
    return `Recategorize expense #${expense.expenseId} to ${displayCategory(expense.category)}`;
  }
  if (actionName === "budget.create") {
    const budget = payload as BudgetCreatePayload;
    return `${budget.title} - ${budget.monthlyLimit} EGP${budget.category ? ` - ${displayCategory(budget.category)}` : ""}`;
  }
  if (actionName === "profile.update") {
    const profile = payload as ProfileUpdatePayload;
    return `Update profile ${profile.section}: ${Object.keys(profile.patch).join(", ")}`;
  }
  if (actionName === "wallet.create") {
    const wallet = payload as WalletCreatePayload;
    return `Create wallet ${wallet.name} (${wallet.provider})`;
  }
  if (actionName === "wallet.update") {
    const wallet = payload as WalletUpdatePayload;
    return `Update wallet #${wallet.walletId}${wallet.name ? ` - ${wallet.name}` : ""}${wallet.balance ? ` - balance ${wallet.balance}` : ""}`;
  }
  const undo = payload as UndoPayload;
  return `Undo ${undo.targetActionName ?? "last reversible action"}`;
}

function actionTitle(actionName: RuntimeActionName): string {
  const titles: Record<RuntimeActionName, string> = {
    "goal.create": "Confirm goal creation",
    "goal.update": "Confirm goal update",
    "goal.stop": "Confirm goal stop",
    "expense.create": "Confirm expense recording",
    "expense.recategorize": "Confirm expense recategorization",
    "budget.create": "Confirm budget plan",
    "profile.update": "Confirm profile update",
    "wallet.create": "Confirm wallet creation",
    "wallet.update": "Confirm wallet update",
    "action.undo": "Confirm undo",
  };
  return titles[actionName] ?? "Confirm action";
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
      confirmLabel: "Confirm",
      cancelLabel: "Cancel",
    },
  };
}
