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
}

export interface ParseOutcome {
  decision: "auto_save" | "review" | "clarify";
  items: ParsedExpenseItem[];
  clarificationQuestion?: string;
  clarificationId?: number;
  classificationLogId?: number;
}

export interface SaveExpenseItem extends ParsedExpenseItem {
  rawText: string;
  classificationLogId?: number;
  clientRequestId: string;
}

export interface BudgetStatus {
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
  parseExpense(identity: CallIdentity, text: string): Promise<ParseOutcome>;
  saveExpenses(identity: CallIdentity, items: SaveExpenseItem[]): Promise<{ ids: number[] }>;
  deleteExpenses(identity: CallIdentity, ids: number[]): Promise<void>;
  listBudgets(identity: CallIdentity): Promise<BudgetStatus[]>;
  /** A question the parser opened for the home screen that the call has answered itself. */
  dismissClarification(identity: CallIdentity, clarificationId: number): Promise<void>;
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
