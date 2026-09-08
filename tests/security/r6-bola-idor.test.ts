import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

/**
 * Security Suite R6: Broken Object Level Authorization (BOLA / IDOR) Prevention
 * Covers:
 *  1. Expense creation foreign-key ownership checks (walletId, contactId, businessId)
 *  2. Budget creation foreign-key ownership checks (linkedGoalId)
 *  3. Batch expense ingestion BOLA defense
 *  4. Dual-user polymorphic isolation (local vs oauth with identical numeric user IDs)
 */

type MockWallet = {
  id: number;
  userId: number;
  userType: "oauth" | "local";
  name: string;
};

type MockContact = {
  id: number;
  userId: number;
  userType: "oauth" | "local";
  name: string;
};

type MockBusiness = {
  id: number;
  userId: number;
  userType: "oauth" | "local";
  name: string;
};

type MockGoal = {
  id: number;
  userId: number;
  userType: "oauth" | "local";
  title: string;
};

describe("R6 Security: Broken Object Level Authorization (BOLA / IDOR) Prevention", () => {
  // Multi-tenant fixtures
  let wallets: MockWallet[] = [];
  let contacts: MockContact[] = [];
  let businesses: MockBusiness[] = [];
  let goals: MockGoal[] = [];

  beforeEach(() => {
    // Tenant 1 (User 1, OAuth)
    // Tenant 2 (User 2, OAuth - Victim / Foreign Tenant)
    // Tenant 3 (User 1, Local - Polymorphic Twin with same ID 1 but different type)
    wallets = [
      { id: 101, userId: 1, userType: "oauth", name: "Tenant 1 Wallet" },
      { id: 102, userId: 2, userType: "oauth", name: "Tenant 2 Wallet" },
      { id: 103, userId: 1, userType: "local", name: "Tenant 3 Local Wallet" },
    ];

    contacts = [
      { id: 201, userId: 1, userType: "oauth", name: "Tenant 1 Contact" },
      { id: 202, userId: 2, userType: "oauth", name: "Tenant 2 Contact" },
      { id: 203, userId: 1, userType: "local", name: "Tenant 3 Local Contact" },
    ];

    businesses = [
      { id: 301, userId: 1, userType: "oauth", name: "Tenant 1 Store" },
      { id: 302, userId: 2, userType: "oauth", name: "Tenant 2 Clinic" },
      { id: 303, userId: 1, userType: "local", name: "Tenant 3 Local Business" },
    ];

    goals = [
      { id: 401, userId: 1, userType: "oauth", title: "Tenant 1 Car Goal" },
      { id: 402, userId: 2, userType: "oauth", title: "Tenant 2 Marriage Goal" },
      { id: 403, userId: 1, userType: "local", title: "Tenant 3 Local Goal" },
    ];
  });

  /**
   * Reference Verification Guard for Financial Mutations (SSoT implementation for R6)
   */
  function assertEntityOwnership(
    caller: { userId: number; userType: "oauth" | "local" },
    entityType: "wallet" | "contact" | "business" | "goal",
    entityId?: number | null,
  ) {
    if (!entityId) return;

    let found = false;

    if (entityType === "wallet") {
      found = wallets.some(
        (w) => w.id === entityId && w.userId === caller.userId && w.userType === caller.userType,
      );
    } else if (entityType === "contact") {
      found = contacts.some(
        (c) => c.id === entityId && c.userId === caller.userId && c.userType === caller.userType,
      );
    } else if (entityType === "business") {
      found = businesses.some(
        (b) => b.id === entityId && b.userId === caller.userId && b.userType === caller.userType,
      );
    } else if (entityType === "goal") {
      found = goals.some(
        (g) => g.id === entityId && g.userId === caller.userId && g.userType === caller.userType,
      );
    }

    if (!found) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `المعرف المحدد (${entityType} #${entityId}) غير موجود أو غير تابع لحسابك.`,
      });
    }
  }

  // Simulated Expense Creation Procedure with Strict BOLA Gates
  async function createExpenseMutation(
    caller: { userId: number; userType: "oauth" | "local" },
    input: {
      amount: number;
      category: string;
      walletId?: number;
      contactId?: number;
      businessId?: number;
    },
  ) {
    assertEntityOwnership(caller, "wallet", input.walletId);
    assertEntityOwnership(caller, "contact", input.contactId);
    assertEntityOwnership(caller, "business", input.businessId);

    return { success: true, expenseId: 9999 };
  }

  // Simulated Budget Creation Procedure with Strict BOLA Gates
  async function createBudgetMutation(
    caller: { userId: number; userType: "oauth" | "local" },
    input: {
      title: string;
      monthlyLimit: number;
      linkedGoalId?: number;
    },
  ) {
    assertEntityOwnership(caller, "goal", input.linkedGoalId);

    return { success: true, budgetId: 8888 };
  }

  describe("Single Expense Mutation BOLA Protection", () => {
    const callerTenant1 = { userId: 1, userType: "oauth" as const };

    it("rejects expense creation when walletId belongs to another tenant (IDOR)", async () => {
      await expect(
        createExpenseMutation(callerTenant1, {
          amount: 250,
          category: "طعام",
          walletId: 102, // Owned by Tenant 2 (userId: 2)
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("rejects expense creation when contactId belongs to another tenant (IDOR)", async () => {
      await expect(
        createExpenseMutation(callerTenant1, {
          amount: 500,
          category: "شخص",
          contactId: 202, // Owned by Tenant 2 (userId: 2)
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("rejects expense creation when businessId belongs to another tenant (IDOR)", async () => {
      await expect(
        createExpenseMutation(callerTenant1, {
          amount: 1200,
          category: "أعمال",
          businessId: 302, // Owned by Tenant 2 (userId: 2)
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("allows expense creation when all references belong to the calling tenant", async () => {
      const result = await createExpenseMutation(callerTenant1, {
        amount: 300,
        category: "طعام",
        walletId: 101, // Owned by Tenant 1
        contactId: 201, // Owned by Tenant 1
        businessId: 301, // Owned by Tenant 1
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Budget Creation linkedGoalId BOLA Protection", () => {
    const callerTenant1 = { userId: 1, userType: "oauth" as const };

    it("rejects budget creation when linkedGoalId belongs to another tenant", async () => {
      await expect(
        createBudgetMutation(callerTenant1, {
          title: "ميزانية جديدة",
          monthlyLimit: 4000,
          linkedGoalId: 402, // Owned by Tenant 2
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("allows budget creation with user's own linkedGoalId", async () => {
      const result = await createBudgetMutation(callerTenant1, {
        title: "ميزانية الادخار",
        monthlyLimit: 5000,
        linkedGoalId: 401, // Owned by Tenant 1
      });

      expect(result.success).toBe(true);
    });

    it("allows budget creation without any linkedGoalId (null/undefined)", async () => {
      const result = await createBudgetMutation(callerTenant1, {
        title: "ميزانية عامة",
        monthlyLimit: 2000,
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Polymorphic Dual-User Isolation (Local vs OAuth)", () => {
    const localUser1 = { userId: 1, userType: "local" as const };
    const oauthUser1 = { userId: 1, userType: "oauth" as const };

    it("prevents Local User 1 from claiming OAuth User 1's wallet despite identical numeric ID", async () => {
      // Local User 1 attempts to use OAuth User 1's Wallet 101
      await expect(
        createExpenseMutation(localUser1, {
          amount: 150,
          category: "تسوق",
          walletId: 101, // Belongs to (1, "oauth")
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("prevents OAuth User 1 from claiming Local User 1's contact despite identical numeric ID", async () => {
      // OAuth User 1 attempts to use Local User 1's Contact 203
      await expect(
        createExpenseMutation(oauthUser1, {
          amount: 200,
          category: "شخص",
          contactId: 203, // Belongs to (1, "local")
        }),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("allows Local User 1 to attach their own local entities", async () => {
      const result = await createExpenseMutation(localUser1, {
        amount: 80,
        category: "طعام",
        walletId: 103, // Belongs to (1, "local")
        contactId: 203, // Belongs to (1, "local")
      });

      expect(result.success).toBe(true);
    });
  });

  describe("Batch Expense Ingestion BOLA Protection", () => {
    const callerTenant1 = { userId: 1, userType: "oauth" as const };

    async function createBatchExpensesMutation(
      caller: { userId: number; userType: "oauth" | "local" },
      items: Array<{
        amount: number;
        category: string;
        walletId?: number;
        contactId?: number;
      }>,
    ) {
      for (const item of items) {
        assertEntityOwnership(caller, "wallet", item.walletId);
        assertEntityOwnership(caller, "contact", item.contactId);
      }
      return { success: true, count: items.length };
    }

    it("fails the entire batch if a single item contains a foreign walletId", async () => {
      const batchItems = [
        { amount: 50, category: "طعام", walletId: 101 }, // Valid (Tenant 1)
        { amount: 120, category: "مواصلات", walletId: 102 }, // Malicious (Tenant 2)
        { amount: 85, category: "فواتير", walletId: 101 }, // Valid (Tenant 1)
      ];

      await expect(
        createBatchExpensesMutation(callerTenant1, batchItems),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("fails the entire batch if a single item contains a foreign contactId", async () => {
      const batchItems = [
        { amount: 50, category: "طعام", contactId: 201 }, // Valid
        { amount: 90, category: "شخص", contactId: 202 }, // Malicious (Tenant 2)
      ];

      await expect(
        createBatchExpensesMutation(callerTenant1, batchItems),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("succeeds when all items in the batch belong to the calling tenant", async () => {
      const batchItems = [
        { amount: 50, category: "طعام", walletId: 101, contactId: 201 },
        { amount: 75, category: "تسوق", walletId: 101 },
        { amount: 110, category: "فواتير" },
      ];

      const result = await createBatchExpensesMutation(callerTenant1, batchItems);
      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
    });
  });
});
