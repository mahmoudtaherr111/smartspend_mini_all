import { and, eq, inArray, or } from "drizzle-orm";
import { optionalCaptureTables } from "../lib/capture/schema-state";
import {
  adClicks,
  adImpressions,
  adStatsDaily,
  aiActionAuditLogs,
  aiActionMemory,
  aiCostMonthly,
  aiConversationSummaries,
  aiMemoryEmbeddings,
  aiMemoryItems,
  aiPendingActions,
  aiSummaries,
  aiTokenLedgers,
  authChallenges,
  businessCategories,
  chatConversations,
  chatMessages,
  classificationLogs,
  expenseCategories,
  expenseDailyRollups,
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
  storePurchases,
  pushSubscriptions,
  referrals,
  sessions,
  supportAssignments,
  supportTickets,
  userAnalytics,
  userBudgets,
  installmentPlans,
  scheduledCashflows,
  cashflowSettlements,
  commitmentScheduleItems,
  commitmentOverrides,
  commitmentHints,
  commitmentReminders,
  commitmentQuestions,
  coachingPlans,
  coachingSteps,
  userBusinesses,
  userContacts,
  userCorrectionRules,
  userCredentials,
  userDictionaries,
  userProfiles,
  userWallets,
  users,
  voiceUsage,
  captureSignals,
  captureEvents,
  captureQuestions,
  captureSamples,
  captureUsage,
  captureMemory,
  captureUserPairs,
  captureAiJobs,
  captureAiAccounts,
  captureAiReservations,
  whatsappMessages,
  whatsappContacts,
  captureMarkers,
  captureConsents,
  captureDevices,
  voiceCalls,
  voiceCallIncidents,
} from "../../db/schema";

export type PurgeUserType = "oauth" | "local";

const userScope = (table: { userId: unknown; userType: unknown }, userId: number, userType: PurgeUserType) =>
  and(eq(table.userId as never, userId), eq(table.userType as never, userType));

/**
 * Deletes every user-scoped record while the caller's transaction is active.
 * This deliberately owns the entire cascade so account deletion cannot drift
 * as different admin/self-delete entry points evolve.
 */
export async function purgeUserData(
  tx: any,
  userId: number,
  userType: PurgeUserType,
): Promise<void> {
  // Share the account-row lock with delayed memory writers before deleting any children.
  const account = userType === "oauth" ? users : localUsers;
  await tx
    .select({ id: account.id })
    .from(account)
    .where(eq(account.id, userId))
    .for("update");
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

  // Capture: the notifications waiting for an answer, the consents and the phones (decision 0028).
  await tx.delete(captureAiJobs).where(userScope(captureAiJobs, userId, userType));
  const captureTables = await optionalCaptureTables(tx);
  if (captureTables.has("capture_ai_reservations")) await tx.delete(captureAiReservations).where(userScope(captureAiReservations, userId, userType));
  if (captureTables.has("capture_ai_accounts")) await tx.delete(captureAiAccounts).where(userScope(captureAiAccounts, userId, userType));
  await tx.delete(whatsappMessages).where(userScope(whatsappMessages, userId, userType));
  await tx.delete(whatsappContacts).where(userScope(whatsappContacts, userId, userType));
  await tx.delete(captureMarkers).where(userScope(captureMarkers, userId, userType));
  await tx.delete(captureSignals).where(userScope(captureSignals, userId, userType));
  await tx.delete(captureEvents).where(userScope(captureEvents, userId, userType));
  if (captureTables.has("capture_questions")) await tx.delete(captureQuestions).where(userScope(captureQuestions, userId, userType));
  if (captureTables.has("capture_samples")) await tx.delete(captureSamples).where(userScope(captureSamples, userId, userType));
  await tx.delete(captureUsage).where(userScope(captureUsage, userId, userType));
  await tx.delete(captureMemory).where(userScope(captureMemory, userId, userType));
  await tx.delete(captureUserPairs).where(userScope(captureUserPairs, userId, userType));
  await tx.delete(captureConsents).where(userScope(captureConsents, userId, userType));
  await tx.delete(captureDevices).where(userScope(captureDevices, userId, userType));

  await tx.delete(expenses).where(userScope(expenses, userId, userType));
  await tx.delete(expenseDailyRollups).where(userScope(expenseDailyRollups, userId, userType));
  await tx.delete(aiCostMonthly).where(userScope(aiCostMonthly, userId, userType));
  await tx.delete(aiTokenLedgers).where(userScope(aiTokenLedgers, userId, userType));
  await tx.delete(userCorrectionRules).where(userScope(userCorrectionRules, userId, userType));
  await tx.delete(expenseCategories).where(userScope(expenseCategories, userId, userType));
  await tx.delete(userBudgets).where(userScope(userBudgets, userId, userType));
  await tx.delete(installmentPlans).where(userScope(installmentPlans, userId, userType));
  await tx.delete(cashflowSettlements).where(userScope(cashflowSettlements, userId, userType));
  await tx.delete(commitmentQuestions).where(userScope(commitmentQuestions, userId, userType));
  await tx.delete(commitmentReminders).where(userScope(commitmentReminders, userId, userType));
  await tx.delete(commitmentHints).where(userScope(commitmentHints, userId, userType));
  await tx.delete(commitmentOverrides).where(userScope(commitmentOverrides, userId, userType));
  await tx.delete(commitmentScheduleItems).where(userScope(commitmentScheduleItems, userId, userType));
  await tx.delete(scheduledCashflows).where(userScope(scheduledCashflows, userId, userType));
  await tx.delete(coachingSteps).where(userScope(coachingSteps, userId, userType));
  await tx.delete(coachingPlans).where(userScope(coachingPlans, userId, userType));
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
  await tx.delete(pushSubscriptions).where(userScope(pushSubscriptions, userId, userType));

  await tx.delete(userProfiles).where(userScope(userProfiles, userId, userType));
  await tx.delete(userAnalytics).where(userScope(userAnalytics, userId, userType));
  // A ticket's assignment goes with the ticket, and a staff member's assignments go with the staff member. Before
  // migration 0049 the table does not exist; that must not stop an account from being deleted.
  try {
    await tx.delete(supportAssignments).where(
      or(
        and(eq(supportAssignments.staffId, userId), eq(supportAssignments.staffType, userType)),
        inArray(
          supportAssignments.ticketId,
          tx.select({ id: supportTickets.id }).from(supportTickets).where(userScope(supportTickets, userId, userType)),
        ),
      ),
    );
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } })?.cause?.code ?? (error as { code?: string })?.code;
    if (code !== "ER_NO_SUCH_TABLE") throw error;
  }
  await tx.delete(supportTickets).where(userScope(supportTickets, userId, userType));
  await tx.delete(proSubscriptions).where(userScope(proSubscriptions, userId, userType));
  await tx.delete(storePurchases).where(userScope(storePurchases, userId, userType));
  await tx.delete(aiSummaries).where(userScope(aiSummaries, userId, userType));
  await tx.delete(profileLearningEvents).where(userScope(profileLearningEvents, userId, userType));
  await tx.delete(monthlyBehaviorSnapshots).where(userScope(monthlyBehaviorSnapshots, userId, userType));
  await tx.delete(userDictionaries).where(userScope(userDictionaries, userId, userType));
  await tx.delete(classificationLogs).where(userScope(classificationLogs, userId, userType));
  await tx.delete(voiceUsage).where(userScope(voiceUsage, userId, userType));
  await tx.delete(voiceCallIncidents).where(userScope(voiceCallIncidents, userId, userType));
  await tx.delete(voiceCalls).where(userScope(voiceCalls, userId, userType));
  await tx.delete(adClicks).where(userScope(adClicks, userId, userType));
  await tx.delete(adImpressions).where(userScope(adImpressions, userId, userType));
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
