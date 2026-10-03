import type { ToolDeclaration } from "../../engine/types";
import type { CallIdentity, ToolRunOutcome } from "../../gateway/call-session";
import type { DraftBook } from "../drafts";
import type { FactLedger } from "../facts";

export interface ParsedExpenseItem {
  amount: number;
  type: string;
  category: string;
  subCategory?: string;
  description?: string;
  date?: string;
  /** A refund ("incoming" expense), or which way a loan or gam3eya transfer moved (contracts/expense-save.ts). */
  direction?: "incoming" | "outgoing";
  /** The person beside the purpose, linked to a contact on save; both or neither. */
  personName?: string;
  personRelationship?: string;
}

export interface ParseOutcome {
  decision: "auto_save" | "review" | "clarify";
  items: ParsedExpenseItem[];
  clarificationQuestion?: string;
  clarificationId?: number;
  classificationLogId?: number;
}

export interface SaveExpenseItem extends ParsedExpenseItem {
  businessId?: number;
  rawText: string;
  classificationLogId?: number;
  clientRequestId: string;
}

/** A bank message kept for the user's review (over the plan's monthly limit), as the Home card lists it. */
export interface BankSuggestion {
  id: number;
  amount: number;
  type: string;
  direction: "incoming" | "outgoing" | null;
  category: string;
  what: string;
  day: string;
}

/** "ليك وعليك", as the debts screen shows it (`expense.getDebtBalances`). */
export interface DebtStanding {
  people: Array<{
    name: string;
    contactId?: number | null;
    balance: number;
    lent: number;
    received: number;
    count: number;
    lastDate: string;
  }>;
  owedToYou: number;
  youOwe: number;
  gam3eya: {
    paid: number;
    received: number;
    held: number;
    installments: number;
  };
}

/** An installment plan with what is left, as the installments screen shows it (`expense.listInstallmentPlans`). */
export interface InstallmentStanding {
  title: string;
  keyword: string;
  monthlyAmount: number;
  totalInstallments: number;
  paid: number;
  remaining: number;
  remainingAmount: number;
  /** linked: from payments tied to its due dates; keyword: from payments whose words name it. */
  countedBy: "linked" | "keyword" | "ambiguous";
}

/** A season's personal spending and the same season a year before (`expense.getSeasonSpending`). */
export interface SeasonSpending {
  label: string;
  startDay: string;
  endDay: string;
  total: number;
  count: number;
  byCategory: Array<{ category: string; amount: number }>;
  previous: { startDay: string; endDay: string; total: number } | null;
}

export interface BudgetStatus {
  id: number;
  /** Active budgets count spending; a paused one is listed so it can be resumed. */
  status: "active" | "paused";
  title: string;
  category: string | null;
  limit: number;
  spent: number;
  percent: number;
  exceeded: boolean;
}

/**
 * What the call does through the app's own procedures, so a spoken expense is parsed, saved and undone exactly
 * like a typed one (the classification pipeline, rollups, streak, caches, budget alerts). Built in the server
 * entry points from the tRPC router; tests pass fakes.
 */
export interface VoiceAppCalls {
  parseExpense(
    identity: CallIdentity,
    text: string,
    scope?: { businessId: number },
  ): Promise<ParseOutcome>;
  saveExpenses(identity: CallIdentity, items: SaveExpenseItem[]): Promise<{ ids: number[] }>;
  /** Deletes the call's own records; answers how many were deleted, so a partial undo is said as one. */
  deleteExpenses(identity: CallIdentity, ids: number[]): Promise<{ deleted: number }>;
  listBudgets(identity: CallIdentity): Promise<BudgetStatus[]>;
  /** Bank messages waiting for the user's review (`profile.getSmsSuggestions`), newest first. */
  bankSuggestions(identity: CallIdentity): Promise<BankSuggestion[]>;
  /** Records a waiting bank message as the Home card's confirm does; false when it was already recorded or dropped. */
  confirmBankSuggestion(identity: CallIdentity, id: number): Promise<boolean>;
  dismissBankSuggestion(identity: CallIdentity, id: number): Promise<boolean>;
  /** Debts and the gam3eya, from the loans and gam3eya transfers recorded (the debts screen's procedure). */
  debts(identity: CallIdentity): Promise<DebtStanding>;
  /** Active installment plans (the installments screen's procedure). */
  installments(identity: CallIdentity): Promise<InstallmentStanding[]>;
  /** A season's spending; null when the season is not known for that year. */
  season(identity: CallIdentity, season: string, year?: number): Promise<SeasonSpending | null>;
  /**
   * The user's business (the business screen's procedure, behind its plan feature): its id and name, "none" without
   * one, "not_in_plan" when the plan does not include businesses.
   */
  business(identity: CallIdentity): Promise<{ id: number; name: string } | "none" | "not_in_plan">;
  /** Changes a budget's monthly limit or pauses/resumes it (the budget screen's procedure, which checks ownership). */
  updateBudget(identity: CallIdentity, budgetId: number, change: { monthlyLimit?: number; status?: "active" | "paused" }): Promise<void>;
  /** A question the parser opened for the home screen that the call has answered itself. */
  dismissClarification(identity: CallIdentity, clarificationId: number): Promise<void>;
  /** The words of an entry still waiting for the user's answer, when it is theirs and still waiting. */
  waitingEntry(identity: CallIdentity, clarificationId: number): Promise<{ words: string } | null>;
  /** The user's answer to a profile question, saved as a tap on the Home card would save it. */
  answerProfileQuestion(identity: CallIdentity, key: string, value: unknown, skipped: boolean): Promise<void>;
}

export interface ToolContext {
  identity: CallIdentity;
  ledger: FactLedger;
  drafts: DraftBook;
  app: VoiceAppCalls;
  signal: AbortSignal;
  now: () => Date;
  /** Salary day for the finance layer, read once per call. */
  salaryDay: () => Promise<number | undefined>;
  /** Questions the parser opened on the home screen during this call, closed once the call records the expense. */
  openClarifications: number[];
  /**
   * The user's ledger generation (`getFinanceCacheGen`) the call last saw. When a read finds it moved without a
   * write of the call's own (a bank message, another device), every figure read before is out of date.
   */
  records?: { seen: number | null };
  /** The coach call: its plan and commitment reads and drafts are available (api/services/voice/brain/tools/coach.ts). */
  coach?: boolean;
  /** What the user asked to forget during the call, handed to the post-call summary with the words (never stored). */
  forgotten?: string[];
  beforeWrite?: (draftId: string) => Promise<boolean>;
}

export interface VoiceTool {
  declaration: ToolDeclaration;
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolRunOutcome>;
}

export const str = (value: unknown, max = 200): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;

export const num = (value: unknown): number | undefined => {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};
