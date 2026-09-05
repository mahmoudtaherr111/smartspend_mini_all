/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { ExpenseInputLimits } from "../contracts/constants";

// ============================================================================
// Schemas & Mutation Idempotency Handlers
// ============================================================================

export const BalanceDecimalRegex = /^-?\d+(\.\d{1,2})?$/;

export const BalanceSchema = z
  .string()
  .trim()
  .regex(BalanceDecimalRegex, "صيغة الرصيد غير صالحة. استخدم أرقاماً بحد أقصى خانتين عشريتين")
  .refine((val) => {
    const num = Number(val);
    return !isNaN(num) && isFinite(num) && Math.abs(num) <= ExpenseInputLimits.amountMax;
  }, "قيمة الرصيد تتجاوز الحد الأقصى المسموح");

export const WalletCreationSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.string().min(1).max(50),
  lastFourDigits: z
    .string()
    .regex(/^\d{4}$/, "يجب أن تكون 4 أرقام")
    .optional()
    .or(z.literal("")),
  balance: BalanceSchema.optional().default("0.00"),
  clientRequestId: z.string().uuid().optional(),
});

export const BudgetCreationSchema = z.object({
  title: z.string().min(2).max(200),
  category: z.string().max(100).optional(),
  monthlyLimit: z
    .number()
    .positive("يجب أن يكون الحد الشهري أكبر من صفر")
    .max(ExpenseInputLimits.amountMax, "تجاوز الحد الأقصى المسموح"),
  periodStartDay: z.number().int().min(1).max(31).default(1),
  alertThresholdPercent: z.number().int().min(1).max(100).default(80),
  clientRequestId: z.string().uuid().optional(),
});

/**
 * Idempotent In-Memory Mutation Executor Simulator
 */
export class IdempotentMutationRegistry {
  private executedRequests = new Map<string, { result: any; timestamp: number }>();
  private wallets = new Map<number, any>();
  private nextWalletId = 1;

  public async executeCreateWallet(
    input: z.infer<typeof WalletCreationSchema>,
    userId: number
  ): Promise<{ success: boolean; walletId: number; isDuplicate: boolean }> {
    // Validate schema
    const validated = WalletCreationSchema.parse(input);

    if (validated.clientRequestId) {
      const existing = this.executedRequests.get(validated.clientRequestId);
      if (existing) {
        return {
          ...existing.result,
          isDuplicate: true,
        };
      }
    }

    const walletId = this.nextWalletId++;
    const newWallet = {
      id: walletId,
      userId,
      name: validated.name,
      provider: validated.provider,
      lastFourDigits: validated.lastFourDigits || null,
      balance: validated.balance,
    };
    this.wallets.set(walletId, newWallet);

    const result = { success: true, walletId, isDuplicate: false };

    if (validated.clientRequestId) {
      this.executedRequests.set(validated.clientRequestId, {
        result,
        timestamp: Date.now(),
      });
    }

    return result;
  }

  public getWallet(id: number) {
    return this.wallets.get(id);
  }

  public getWalletsCount() {
    return this.wallets.size;
  }

  public clear() {
    this.executedRequests.clear();
    this.wallets.clear();
    this.nextWalletId = 1;
  }
}

/**
 * Double-Tap Ref Lock Controller
 */
export class MutationLockController {
  private isLocked = false;
  private submissionCount = 0;

  public async executeWithLock<T>(fn: () => Promise<T>): Promise<{ executed: boolean; result?: T }> {
    if (this.isLocked) {
      return { executed: false };
    }

    this.isLocked = true;
    try {
      this.submissionCount++;
      const result = await fn();
      return { executed: true, result };
    } finally {
      this.isLocked = false;
    }
  }

  public getSubmissionCount(): number {
    return this.submissionCount;
  }

  public isCurrentlyLocked(): boolean {
    return this.isLocked;
  }
}

/**
 * Optimistic Query Cache with Rollback on Mutation Failure
 */
export class OptimisticQueryCache<T extends { id: number | string }> {
  private cache: T[] = [];

  constructor(initialData: T[] = []) {
    this.cache = [...initialData];
  }

  public getData(): T[] {
    return [...this.cache];
  }

  public async mutateOptimistically(
    optimisticItem: T,
    serverMutationFn: () => Promise<T>
  ): Promise<{ success: boolean; data: T[] }> {
    const previousSnapshot = [...this.cache];

    // 1. Apply optimistic update
    this.cache = [optimisticItem, ...this.cache];

    try {
      // 2. Execute server mutation
      const serverResult = await serverMutationFn();

      // Replace optimistic item with server confirmed item
      this.cache = this.cache.map((item) => (item.id === optimisticItem.id ? serverResult : item));
      return { success: true, data: [...this.cache] };
    } catch (error) {
      // 3. Rollback on failure
      this.cache = previousSnapshot;
      throw error;
    }
  }
}

// ============================================================================
// TEST SUITE: Financial Mutations, Idempotency & Validation
// ============================================================================

describe("Financial Mutations & Idempotency Test Suite", () => {
  let registry: IdempotentMutationRegistry;
  let lockController: MutationLockController;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new IdempotentMutationRegistry();
    lockController = new MutationLockController();
  });

  afterEach(() => {
    registry.clear();
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Tier 1: Strict Decimal Regex & Numerical Boundary Validation
  // --------------------------------------------------------------------------
  describe("Tier 1: Balance Decimal Validation & Boundary Analysis", () => {
    it("1.1 accepts valid integer and 1-2 decimal positive and negative balances", () => {
      const validBalances = ["0", "0.0", "0.00", "150", "150.5", "150.75", "-50", "-50.25", "999999999"];
      for (const val of validBalances) {
        const parsed = BalanceSchema.safeParse(val);
        expect(parsed.success, `Expected "${val}" to be valid`).toBe(true);
      }
    });

    it("1.2 rejects balances with >2 decimal places (fractional millimes)", () => {
      const invalidDecimals = ["10.123", "0.001", "150.999", "-5.555"];
      for (const val of invalidDecimals) {
        const parsed = BalanceSchema.safeParse(val);
        expect(parsed.success, `Expected "${val}" to be rejected due to 3+ decimals`).toBe(false);
      }
    });

    it("1.3 rejects NaN, Infinity, special characters, and unstripped commas", () => {
      const invalidInputs = ["NaN", "Infinity", "-Infinity", "1,000.00", "150EGP", "abc", "", "   ", "--100"];
      for (const val of invalidInputs) {
        const parsed = BalanceSchema.safeParse(val);
        expect(parsed.success, `Expected "${val}" to be rejected`).toBe(false);
      }
    });

    it("1.4 rejects values exceeding ExpenseInputLimits.amountMax", () => {
      const hugeValue = String(ExpenseInputLimits.amountMax + 1000);
      const parsed = BalanceSchema.safeParse(hugeValue);
      expect(parsed.success).toBe(false);
    });

    it("1.5 validates wallet creation input with default balance", () => {
      const valid = WalletCreationSchema.parse({
        name: "محفظة فودافون كاش",
        provider: "vodafone_cash",
        lastFourDigits: "4321",
      });

      expect(valid.balance).toBe("0.00");
      expect(valid.name).toBe("محفظة فودافون كاش");
      expect(valid.lastFourDigits).toBe("4321");
    });
  });

  // --------------------------------------------------------------------------
  // Tier 2: Budget Schema & Constraint Validation
  // --------------------------------------------------------------------------
  describe("Tier 2: Budget Schema Constraints & Boundaries", () => {
    it("2.1 validates valid budget creation input", () => {
      const valid = BudgetCreationSchema.parse({
        title: "ميزانية المطاعم والكافيهات",
        category: "طعام وشراب",
        monthlyLimit: 3500.5,
        periodStartDay: 1,
        alertThresholdPercent: 85,
      });

      expect(valid.monthlyLimit).toBe(3500.5);
      expect(valid.alertThresholdPercent).toBe(85);
    });

    it("2.2 rejects zero or negative budget monthly limit", () => {
      expect(
        BudgetCreationSchema.safeParse({
          title: "ميزانية",
          monthlyLimit: 0,
        }).success
      ).toBe(false);

      expect(
        BudgetCreationSchema.safeParse({
          title: "ميزانية",
          monthlyLimit: -500,
        }).success
      ).toBe(false);
    });

    it("2.3 enforces periodStartDay between 1 and 31", () => {
      expect(
        BudgetCreationSchema.safeParse({
          title: "ميزانية",
          monthlyLimit: 1000,
          periodStartDay: 0,
        }).success
      ).toBe(false);

      expect(
        BudgetCreationSchema.safeParse({
          title: "ميزانية",
          monthlyLimit: 1000,
          periodStartDay: 32,
        }).success
      ).toBe(false);

      expect(
        BudgetCreationSchema.safeParse({
          title: "ميزانية",
          monthlyLimit: 1000,
          periodStartDay: 28,
        }).success
      ).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Tier 3: clientRequestId Idempotency
  // --------------------------------------------------------------------------
  describe("Tier 3: clientRequestId Mutation Idempotency", () => {
    it("3.1 returns identical cached response and prevents duplicate DB rows on repeated clientRequestId", async () => {
      const clientRequestId = "550e8400-e29b-41d4-a716-446655440000";

      const payload = {
        name: "حساب بنك مصر",
        provider: "banque_misr",
        balance: "5000.00",
        clientRequestId,
      };

      // 1. First execution
      const res1 = await registry.executeCreateWallet(payload, 1);
      expect(res1.success).toBe(true);
      expect(res1.isDuplicate).toBe(false);
      expect(registry.getWalletsCount()).toBe(1);

      // 2. Duplicate network retry with identical clientRequestId
      const res2 = await registry.executeCreateWallet(payload, 1);
      expect(res2.success).toBe(true);
      expect(res2.isDuplicate).toBe(true);
      expect(res2.walletId).toBe(res1.walletId);

      // Critical check: Exactly 1 record created in database
      expect(registry.getWalletsCount()).toBe(1);
    });

    it("3.2 creates distinct records when different clientRequestIds are provided", async () => {
      const req1 = "11111111-1111-4111-8111-111111111111";
      const req2 = "22222222-2222-4222-8222-222222222222";

      const res1 = await registry.executeCreateWallet(
        { name: "محفظة 1", provider: "instapay", clientRequestId: req1 },
        1
      );
      const res2 = await registry.executeCreateWallet(
        { name: "محفظة 2", provider: "instapay", clientRequestId: req2 },
        1
      );

      expect(res1.walletId).not.toBe(res2.walletId);
      expect(registry.getWalletsCount()).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Tier 4: Double-Tap Prevention & Optimistic Rollbacks
  // --------------------------------------------------------------------------
  describe("Tier 4: Double-Tap Locks & Optimistic Rollbacks", () => {
    it("4.1 drops concurrent double-tap submissions while mutation is in-flight", async () => {
      let resolveSlowMutation!: () => void;
      const slowMutationPromise = new Promise<string>((r) => (resolveSlowMutation = r));

      // First click: starts slow async operation
      const firstClick = lockController.executeWithLock(async () => {
        await slowMutationPromise;
        return "first_done";
      });

      // Rapid second, third, fourth clicks while first is in-flight
      const secondClick = lockController.executeWithLock(async () => "second_done");
      const thirdClick = lockController.executeWithLock(async () => "third_done");

      expect((await secondClick).executed).toBe(false);
      expect((await thirdClick).executed).toBe(false);

      // Complete first mutation
      resolveSlowMutation();
      const firstResult = await firstClick;

      expect(firstResult.executed).toBe(true);
      expect(firstResult.result).toBe("first_done");
      expect(lockController.getSubmissionCount()).toBe(1);
      expect(lockController.isCurrentlyLocked()).toBe(false);
    });

    it("4.2 rolls back optimistic cache update when server mutation fails", async () => {
      const initialWallets = [
        { id: 1, name: "كاش", balance: "100.00" },
        { id: 2, name: "البنك الأهلي", balance: "500.00" },
      ];

      const cache = new OptimisticQueryCache(initialWallets);

      const optimisticWallet = { id: "temp-999", name: "محفظة جديدة", balance: "250.00" };

      // Attempt optimistic update that fails on server
      await expect(
        cache.mutateOptimistically(optimisticWallet, async () => {
          throw new Error("Server timeout / DB error");
        })
      ).rejects.toThrow("Server timeout / DB error");

      // Verify cache rolled back to original 2 items
      expect(cache.getData()).toEqual(initialWallets);
      expect(cache.getData()).toHaveLength(2);
    });

    it("4.3 updates optimistic placeholder with confirmed server entity on success", async () => {
      const initialWallets = [{ id: 1, name: "كاش", balance: "100.00" }];
      const cache = new OptimisticQueryCache(initialWallets);

      const optimisticWallet = { id: "temp-123", name: "فودافون كاش", balance: "300.00" };
      const serverConfirmed = { id: 2, name: "فودافون كاش", balance: "300.00" };

      const result = await cache.mutateOptimistically(optimisticWallet, async () => serverConfirmed);

      expect(result.success).toBe(true);
      expect(cache.getData()).toEqual([
        serverConfirmed,
        { id: 1, name: "كاش", balance: "100.00" },
      ]);
    });
  });
});
