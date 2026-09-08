import { db } from "../queries/connection";
import { userWallets, userBusinesses, financialGoals, userContacts } from "../../db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

/**
 * Validates that a wallet belongs to the specified user.
 * Returns true if the entity exists and belongs to the user, false otherwise.
 */
export async function validateWalletOwnership(
  userId: number,
  walletId: number,
  userType?: string,
): Promise<boolean> {
  if (!walletId || typeof walletId !== "number" || walletId <= 0) return false;
  const conditions = [eq(userWallets.id, walletId), eq(userWallets.userId, userId)];
  if (userType) {
    conditions.push(eq(userWallets.userType, userType));
  }
  const [wallet] = await db
    .select({ id: userWallets.id })
    .from(userWallets)
    .where(and(...conditions))
    .limit(1);
  return Boolean(wallet);
}

/**
 * Validates that a business belongs to the specified user.
 * Returns true if the entity exists and belongs to the user, false otherwise.
 */
export async function validateBusinessOwnership(
  userId: number,
  businessId: number,
  userType?: string,
): Promise<boolean> {
  if (!businessId || typeof businessId !== "number" || businessId <= 0) return false;
  const conditions = [eq(userBusinesses.id, businessId), eq(userBusinesses.userId, userId)];
  if (userType) {
    conditions.push(eq(userBusinesses.userType, userType));
  }
  const [business] = await db
    .select({ id: userBusinesses.id })
    .from(userBusinesses)
    .where(and(...conditions))
    .limit(1);
  return Boolean(business);
}

/**
 * Validates that a financial goal belongs to the specified user.
 * Returns true if the entity exists and belongs to the user, false otherwise.
 */
export async function validateGoalOwnership(
  userId: number,
  goalId: number,
  userType?: string,
): Promise<boolean> {
  if (!goalId || typeof goalId !== "number" || goalId <= 0) return false;
  const conditions = [eq(financialGoals.id, goalId), eq(financialGoals.userId, userId)];
  if (userType) {
    conditions.push(eq(financialGoals.userType, userType));
  }
  const [goal] = await db
    .select({ id: financialGoals.id })
    .from(financialGoals)
    .where(and(...conditions))
    .limit(1);
  return Boolean(goal);
}

/**
 * Validates that a contact belongs to the specified user.
 * Returns true if the entity exists and belongs to the user, false otherwise.
 */
export async function validateContactOwnership(
  userId: number,
  contactId: number,
  userType?: string,
): Promise<boolean> {
  if (!contactId || typeof contactId !== "number" || contactId <= 0) return false;
  const conditions = [eq(userContacts.id, contactId), eq(userContacts.userId, userId)];
  if (userType) {
    conditions.push(eq(userContacts.userType, userType));
  }
  const [contact] = await db
    .select({ id: userContacts.id })
    .from(userContacts)
    .where(and(...conditions))
    .limit(1);
  return Boolean(contact);
}

export type AssertEntityOwnershipParams = {
  userId: number;
  userType?: string;
  walletId?: number | null;
  businessId?: number | null;
  linkedGoalId?: number | null;
  contactId?: number | null;
};

/**
 * Asserts ownership of all supplied entity IDs against the user.
 * Throws TRPCError FORBIDDEN if any specified entity does not belong to the user.
 */
export async function assertEntityOwnership(params: AssertEntityOwnershipParams): Promise<void> {
  const { userId, userType, walletId, businessId, linkedGoalId, contactId } = params;

  if (walletId && walletId > 0) {
    const isOwner = await validateWalletOwnership(userId, walletId, userType);
    if (!isOwner) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Unauthorized entity access",
      });
    }
  }

  if (businessId && businessId > 0) {
    const isOwner = await validateBusinessOwnership(userId, businessId, userType);
    if (!isOwner) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Unauthorized entity access",
      });
    }
  }

  if (linkedGoalId && linkedGoalId > 0) {
    const isOwner = await validateGoalOwnership(userId, linkedGoalId, userType);
    if (!isOwner) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Unauthorized entity access",
      });
    }
  }

  if (contactId && contactId > 0) {
    const isOwner = await validateContactOwnership(userId, contactId, userType);
    if (!isOwner) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Unauthorized entity access",
      });
    }
  }
}

/**
 * High-performance batched ownership validator for multiple entity references.
 * Resolves all IDs across wallets, businesses, contacts, and goals in single batched queries.
 */
export async function assertBatchEntityOwnership(
  userId: number,
  userType: string | undefined,
  entities: {
    walletIds?: number[];
    businessIds?: number[];
    contactIds?: number[];
    goalIds?: number[];
  },
): Promise<void> {
  const explicitWalletIds = [...new Set((entities.walletIds || []).filter((id) => id > 0))];
  if (explicitWalletIds.length > 0) {
    const conditions = [inArray(userWallets.id, explicitWalletIds), eq(userWallets.userId, userId)];
    if (userType) conditions.push(eq(userWallets.userType, userType));
    const foundWallets = await db
      .select({ id: userWallets.id })
      .from(userWallets)
      .where(and(...conditions));
    const validSet = new Set(foundWallets.map((w) => w.id));
    for (const reqId of explicitWalletIds) {
      if (!validSet.has(reqId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Unauthorized entity access",
        });
      }
    }
  }

  const explicitBusinessIds = [...new Set((entities.businessIds || []).filter((id) => id > 0))];
  if (explicitBusinessIds.length > 0) {
    const conditions = [inArray(userBusinesses.id, explicitBusinessIds), eq(userBusinesses.userId, userId)];
    if (userType) conditions.push(eq(userBusinesses.userType, userType));
    const foundBusinesses = await db
      .select({ id: userBusinesses.id })
      .from(userBusinesses)
      .where(and(...conditions));
    const validSet = new Set(foundBusinesses.map((b) => b.id));
    for (const reqId of explicitBusinessIds) {
      if (!validSet.has(reqId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Unauthorized entity access",
        });
      }
    }
  }

  const explicitContactIds = [...new Set((entities.contactIds || []).filter((id) => id > 0))];
  if (explicitContactIds.length > 0) {
    const conditions = [inArray(userContacts.id, explicitContactIds), eq(userContacts.userId, userId)];
    if (userType) conditions.push(eq(userContacts.userType, userType));
    const foundContacts = await db
      .select({ id: userContacts.id })
      .from(userContacts)
      .where(and(...conditions));
    const validSet = new Set(foundContacts.map((c) => c.id));
    for (const reqId of explicitContactIds) {
      if (!validSet.has(reqId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Unauthorized entity access",
        });
      }
    }
  }

  const explicitGoalIds = [...new Set((entities.goalIds || []).filter((id) => id > 0))];
  if (explicitGoalIds.length > 0) {
    const conditions = [inArray(financialGoals.id, explicitGoalIds), eq(financialGoals.userId, userId)];
    if (userType) conditions.push(eq(financialGoals.userType, userType));
    const foundGoals = await db
      .select({ id: financialGoals.id })
      .from(financialGoals)
      .where(and(...conditions));
    const validSet = new Set(foundGoals.map((g) => g.id));
    for (const reqId of explicitGoalIds) {
      if (!validSet.has(reqId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Unauthorized entity access",
        });
      }
    }
  }
}
