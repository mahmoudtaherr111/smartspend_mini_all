import { and, eq, inArray, or } from "drizzle-orm";
import {
  adClicks,
  aiActionAuditLogs,
  aiActionMemory,
  aiConversationSummaries,
  aiMemoryEmbeddings,
  aiMemoryItems,
  aiPendingActions,
  aiSummaries,
  authChallenges,
  businessCategories,
  chatConversations,
  chatMessages,
  classificationLogs,
  expenseCategories,
  expenses,
  financialGoals,
  inAppNotifications,
  localUsers,
  monthlyBehaviorSnapshots,
  monthlyReports,
  notificationLogs,
  pendingClarifications,
  profileLearningEvents,
  proSubscriptions,
  pushSubscriptions,
  rawSmsEvents,
  referrals,
  sessions,
  supportTickets,
  userAnalytics,
  userBudgets,
  userBusinesses,
  userContacts,
  userCredentials,
  userDictionaries,
  userProfiles,
  userWallets,
  users,
  voiceUsage,
  webhookTokens,
} from "../../db/schema";

export type PurgeUserType = "oauth" | "local";

const userScope = (table: { userId: unknown; userType: unknown }, userId: number, userType: PurgeUserType) =>
  and(eq(table.userId as never, userId), eq(table.userType as never, userType));

/**
 * Deletes every user-scoped record while the caller's transaction is active.
 * This deliberately owns the entire cascade so account deletion cannot drift
 * as different admin/self-delete entry points evolve.
 */
export async function purgeUserData(tx: any, userId: number, userType: PurgeUserType): Promise<void> {
  const [conversationRows, businessRows] = await Promise.all([
    tx
      .select({ id: chatConversations.id })
      .from(chatConversations)
      .where(userScope(chatConversations, userId, userType)),
    tx
      .select({ id: userBusinesses.id })
      .from(userBusinesses)
      .where(userScope(userBusinesses, userId, userType)),
  ]);
  const conversationIds = conversationRows.map((row: { id: number }) => row.id);
  const businessIds = businessRows.map((row: { id: number }) => row.id);

  if (conversationIds.length) {
    await tx.delete(chatMessages).where(inArray(chatMessages.conversationId, conversationIds));
  }
  await tx.delete(aiConversationSummaries).where(userScope(aiConversationSummaries, userId, userType));
  await tx.delete(chatConversations).where(userScope(chatConversations, userId, userType));

  await tx.delete(aiMemoryEmbeddings).where(userScope(aiMemoryEmbeddings, userId, userType));
  await tx.delete(aiMemoryItems).where(userScope(aiMemoryItems, userId, userType));
  await tx.delete(aiActionAuditLogs).where(userScope(aiActionAuditLogs, userId, userType));
  await tx.delete(aiPendingActions).where(userScope(aiPendingActions, userId, userType));
  await tx.delete(aiActionMemory).where(userScope(aiActionMemory, userId, userType));

  await tx.delete(pendingClarifications).where(userScope(pendingClarifications, userId, userType));
  await tx.delete(expenses).where(userScope(expenses, userId, userType));
  await tx.delete(expenseCategories).where(userScope(expenseCategories, userId, userType));
  await tx.delete(userBudgets).where(userScope(userBudgets, userId, userType));
  await tx.delete(financialGoals).where(userScope(financialGoals, userId, userType));
  await tx.delete(monthlyReports).where(userScope(monthlyReports, userId, userType));
  await tx.delete(userWallets).where(userScope(userWallets, userId, userType));

  if (businessIds.length) {
    await tx.delete(businessCategories).where(inArray(businessCategories.businessId, businessIds));
  }
  await tx.delete(userContacts).where(userScope(userContacts, userId, userType));
  await tx.delete(userBusinesses).where(userScope(userBusinesses, userId, userType));

  await tx.delete(sessions).where(userScope(sessions, userId, userType));
  await tx.delete(userCredentials).where(userScope(userCredentials, userId, userType));
  await tx.delete(authChallenges).where(userScope(authChallenges, userId, userType));
  await tx.delete(webhookTokens).where(userScope(webhookTokens, userId, userType));
  await tx.delete(pushSubscriptions).where(userScope(pushSubscriptions, userId, userType));

  await tx.delete(userProfiles).where(userScope(userProfiles, userId, userType));
  await tx.delete(userAnalytics).where(userScope(userAnalytics, userId, userType));
  await tx.delete(supportTickets).where(userScope(supportTickets, userId, userType));
  await tx.delete(proSubscriptions).where(userScope(proSubscriptions, userId, userType));
  await tx.delete(aiSummaries).where(userScope(aiSummaries, userId, userType));
  await tx.delete(profileLearningEvents).where(userScope(profileLearningEvents, userId, userType));
  await tx.delete(monthlyBehaviorSnapshots).where(userScope(monthlyBehaviorSnapshots, userId, userType));
  await tx.delete(userDictionaries).where(userScope(userDictionaries, userId, userType));
  await tx.delete(classificationLogs).where(userScope(classificationLogs, userId, userType));
  await tx.delete(voiceUsage).where(userScope(voiceUsage, userId, userType));
  await tx.delete(rawSmsEvents).where(userScope(rawSmsEvents, userId, userType));
  await tx.delete(adClicks).where(userScope(adClicks, userId, userType));
  await tx.delete(inAppNotifications).where(userScope(inAppNotifications, userId, userType));
  await tx.delete(notificationLogs).where(userScope(notificationLogs, userId, userType));
  await tx.delete(referrals).where(
    or(
      and(eq(referrals.referrerId, userId), eq(referrals.referrerType, userType)),
      and(eq(referrals.referredId, userId), eq(referrals.referredType, userType)),
    ),
  );

  const identityTable = userType === "oauth" ? users : localUsers;
  await tx.delete(identityTable).where(eq(identityTable.id, userId));
}
