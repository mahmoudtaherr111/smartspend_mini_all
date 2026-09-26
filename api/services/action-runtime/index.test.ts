import { confirmAction, createPendingGoalAction, createPendingRuntimeAction } from "./index";
import { invalidateMemoryUserCache } from "../ai-memory";

const { dbMock, insertedRows, updatedRows, state } = vi.hoisted(() => {
  const insertedRows: Array<Record<string, unknown>> = [];
  const updatedRows: Array<Record<string, unknown>> = [];
  const state: { nextId: number; pendingAction?: Record<string, unknown> } = {
    nextId: 50,
  };

  const dbMock: any = {
    select: vi.fn((fields?: Record<string, unknown>) => {
      const chain: any = {
        from: vi.fn(() => chain),
        where: vi.fn(() => {
          if (fields?.count) return Promise.resolve([{ count: 0 }]);
          return chain;
        }),
        limit: vi.fn(() => Promise.resolve(state.pendingAction ? [state.pendingAction] : [])),
      };
      return chain;
    }),
    insert: vi.fn(() => ({
      values: vi.fn((row: Record<string, unknown>) => {
        const id = state.nextId++;
        const stored = { ...row, id };
        insertedRows.push(stored);
        if (row.status === "pending_confirmation" && row.payload) {
          state.pendingAction = stored;
        }
        return Promise.resolve([{ insertId: id }]);
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((row: Record<string, unknown>) => {
        updatedRows.push(row);
        if (state.pendingAction) {
          state.pendingAction = { ...state.pendingAction, ...row };
        }
        return {
          where: vi.fn(() => Promise.resolve([{ affectedRows: 1 }])),
        };
      }),
    })),
  };
  // Money-moving actions write inside a transaction; the callback runs against the same fake.
  dbMock.transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(dbMock));

  return { dbMock, insertedRows, updatedRows, state };
});

vi.mock("../../queries/connection", () => ({
  db: dbMock,
}));

// The rollup and detail writes are covered by tests/expense-rollups.test.ts against a real database.
vi.mock("../expense-rollups", () => ({
  applyExpenseRollupDelta: vi.fn(async () => undefined),
  expenseToRollupDelta: vi.fn(() => ({})),
  ledgerAmount: (type: string, direction: string | undefined, amount: number) =>
    type === "expense" && direction === "incoming" ? -Math.abs(amount) : Math.abs(amount),
}));

vi.mock("../finance-semantic-layer", () => ({
  invalidateFinanceUserCache: vi.fn(async () => 0),
  bumpFinanceCacheGen: vi.fn(async () => 0),
}));

vi.mock("../../lib/muscle-memory", () => ({
  invalidateUserMemory: vi.fn(() => undefined),
}));

vi.mock("../ai-memory", () => ({
  invalidateMemoryUserCache: vi.fn(async () => 0),
}));

describe("action runtime goal.create flow", () => {
  beforeEach(() => {
    insertedRows.length = 0;
    updatedRows.length = 0;
    state.nextId = 50;
    state.pendingAction = undefined;
    vi.mocked(invalidateMemoryUserCache).mockClear();
  });

  it("creates a pending action and executes it after confirmation", async () => {
    const ctx = {
      userId: 1,
      userType: "oauth",
      userPlan: "free",
      conversationId: 42,
    };

    const draft = await createPendingGoalAction(ctx, {
      title: "هدف شراء عربية",
      targetAmount: 100000,
      description: "خطة عربية",
    });

    expect(draft.action).toMatchObject({
      name: "goal.create",
      status: "pending_confirmation",
      confirmationRequired: true,
    });
    expect(draft.artifact.type).toBe("action_confirmation");

    if (state.pendingAction?.payload) {
      state.pendingAction = {
        ...state.pendingAction,
        payload: JSON.stringify(state.pendingAction.payload),
      };
    }

    const result = await confirmAction(ctx, Number(draft.action.id));

    expect(result).toMatchObject({
      actionName: "goal.create",
      status: "executed",
      message: "تم إنشاء الهدف بنجاح.",
    });
    expect(insertedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "هدف شراء عربية",
          targetAmount: "100000",
          status: "active",
        }),
        expect.objectContaining({
          actionName: "goal.create",
          status: "executed",
        }),
      ]),
    );
    expect(updatedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "confirmed" }),
        expect.objectContaining({ status: "executed" }),
      ]),
    );
    expect(invalidateMemoryUserCache).toHaveBeenCalledWith(1, "oauth");
  });

  it("creates an expense only after confirmation", async () => {
    const ctx = {
      userId: 1,
      userType: "oauth",
      userPlan: "free",
      conversationId: 42,
    };

    const draft = await createPendingRuntimeAction(ctx, "expense.create", {
      amount: 45,
      type: "expense",
      category: "food",
      description: "مصروف من ستاربكس",
      rawText: "سجل عندك 45 جنيه قهوة من ستاربكس",
      placeHint: "ستاربكس",
    });

    expect(draft.action).toMatchObject({
      name: "expense.create",
      status: "pending_confirmation",
      confirmationRequired: true,
    });
    expect(insertedRows.some((row) => row.category === "food" && row.amount === "45")).toBe(false);

    if (state.pendingAction?.payload) {
      state.pendingAction = {
        ...state.pendingAction,
        payload: JSON.stringify(state.pendingAction.payload),
      };
    }

    const result = await confirmAction(ctx, Number(draft.action.id));

    expect(result).toMatchObject({
      actionName: "expense.create",
      status: "executed",
      message: "تم تسجيل المصروف بنجاح.",
    });
    expect(insertedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amount: "45",
          // expenses.category stores the Arabic name_ar. This path used to write the
          // English canonical id, which made the row invisible to every reader that
          // compares by exact string — budget matching, category filters, the person
          // -category set, and the CSV export.
          category: "أكل وشرب",
          source: "ai_parsed",
          placeHint: "ستاربكس",
        }),
        expect.objectContaining({
          actionName: "expense.create",
          status: "executed",
        }),
      ]),
    );
    expect(invalidateMemoryUserCache).toHaveBeenCalledWith(1, "oauth");
  });

  it("rejects confirmation when the pending action belongs to another conversation", async () => {
    const ctx = {
      userId: 1,
      userType: "oauth",
      userPlan: "free",
      conversationId: 42,
    };

    const draft = await createPendingGoalAction(ctx, {
      title: "ظ‡ط¯ظپ ط§ط¯ط®ط§ط±",
      targetAmount: 5000,
    });

    state.pendingAction = {
      ...state.pendingAction,
      conversationId: 99,
      payload: JSON.stringify(state.pendingAction?.payload ?? {}),
    };

    await expect(confirmAction(ctx, Number(draft.action.id))).rejects.toThrow(
      "Action does not belong to this conversation",
    );
    expect(updatedRows).not.toEqual(expect.arrayContaining([expect.objectContaining({ status: "confirmed" })]));
    expect(insertedRows).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "ظ‡ط¯ظپ ط§ط¯ط®ط§ط±",
          targetAmount: "5000",
          status: "active",
        }),
      ]),
    );
  });
});

/**
 * Risk is a contract the server keeps. Stopping a goal or undoing an action cannot be taken back, so confirming
 * one takes the words its card shows; the risk used to be stored with the draft and never read, and a tap or a
 * typed "تمام" ran a high-risk action exactly like a medium one.
 */
describe("confirming an action that cannot be taken back", () => {
  const ctx = { userId: 1, userType: "oauth", userPlan: "pro", conversationId: 42 };

  beforeEach(() => {
    insertedRows.length = 0;
    updatedRows.length = 0;
    state.nextId = 70;
    state.pendingAction = undefined;
  });

  it("asks for the words when the draft is made", async () => {
    const draft = await createPendingRuntimeAction(ctx, "goal.stop", { goalId: 9 });

    expect(draft.action).toMatchObject({ risk: "high", confirmationPhrase: "أوقف الهدف" });
    expect(draft.artifact.payload).toMatchObject({ confirmationPhrase: "أوقف الهدف" });
  });

  it("refuses a confirmation without them, and runs nothing", async () => {
    const draft = await createPendingRuntimeAction(ctx, "goal.stop", { goalId: 9 });

    await expect(confirmAction(ctx, Number(draft.action.id))).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    await expect(confirmAction(ctx, Number(draft.action.id), { phrase: "تمام" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(updatedRows).toEqual([]);
  });

  it("runs it once the words are typed, however the hamza and spaces fall", async () => {
    const draft = await createPendingRuntimeAction(ctx, "goal.stop", { goalId: 9 });

    const result = await confirmAction(ctx, Number(draft.action.id), { phrase: "  اوقف   الهدف " });

    expect(result).toMatchObject({ actionName: "goal.stop", status: "executed" });
    expect(updatedRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "confirmed" }),
        expect.objectContaining({ status: "cancelled" }),
        expect.objectContaining({ status: "executed" }),
      ]),
    );
  });

  it("leaves a medium action as it was: a plain confirmation runs it", async () => {
    const draft = await createPendingRuntimeAction(ctx, "wallet.create", { name: "محفظة السفر", provider: "cash" });

    expect(draft.action.risk).toBe("medium");
    expect(draft.action).not.toHaveProperty("confirmationPhrase");
    await expect(confirmAction(ctx, Number(draft.action.id))).resolves.toMatchObject({ status: "executed" });
  });
});
