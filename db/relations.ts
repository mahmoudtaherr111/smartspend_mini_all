import { relations } from "drizzle-orm";
import {
  users,
  localUsers,
  expenses,
  expenseCategories,
  sessions,
  userWallets,
  financialGoals,
  userContacts,
  userBusinesses,
  businessCategories,
  classificationLogs,
  pendingClarifications,
  monthlyReports,
  userAnalytics,
  supportTickets,
  discountCodes,
  aiSummaries,
  ads,
  adClicks,
  referrals,
  proSubscriptions,
  userProfiles,
  profileLearningEvents,
  monthlyBehaviorSnapshots,
  userDictionaries,
  voiceUsage,
  webhookTokens,
  userBudgets,
  rawSmsEvents,
  apiKeyErrors,
  pushSubscriptions,
  userCredentials,
  authChallenges,
  notificationTemplates,
  inAppNotifications,
  notificationLogs,
  chatConversations,
  chatMessages,
  aiConversationSummaries,
  aiMemoryItems,
  aiMemoryEmbeddings,
  aiActionMemory,
  aiPendingActions,
  aiActionAuditLogs,
  aiProviders,
  aiModels,
  aiTokenLedgers
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  expenses: many(expenses),
  categories: many(expenseCategories),
  sessions: many(sessions),
  wallets: many(userWallets),
  goals: many(financialGoals),
  contacts: many(userContacts),
  businesses: many(userBusinesses),
  chatConversations: many(chatConversations),
  inAppNotifications: many(inAppNotifications),
  aiMemoryItems: many(aiMemoryItems),
  userProfiles: many(userProfiles),
  proSubscriptions: many(proSubscriptions),
  userBudgets: many(userBudgets),
  userCredentials: many(userCredentials),
  pushSubscriptions: many(pushSubscriptions),
  webhookTokens: many(webhookTokens),
  userDictionaries: many(userDictionaries),
  voiceUsage: many(voiceUsage),
  rawSmsEvents: many(rawSmsEvents),
  userAnalytics: many(userAnalytics),
  supportTickets: many(supportTickets),
  monthlyReports: many(monthlyReports),
  aiSummaries: many(aiSummaries),
  profileLearningEvents: many(profileLearningEvents),
  monthlyBehaviorSnapshots: many(monthlyBehaviorSnapshots),
  aiConversationSummaries: many(aiConversationSummaries),
  aiActionMemory: many(aiActionMemory),
  aiPendingActions: many(aiPendingActions),
  aiActionAuditLogs: many(aiActionAuditLogs),
  pendingClarifications: many(pendingClarifications),
  notificationLogs: many(notificationLogs),
  adClicks: many(adClicks),
  aiMemoryEmbeddings: many(aiMemoryEmbeddings),
  authChallenges: many(authChallenges),
  classificationLogs: many(classificationLogs),
  discountCodes: many(discountCodes),
  apiKeyErrors: many(apiKeyErrors),
  referralsMade: many(referrals, { relationName: "referrerOauthUser" }),
  referralsReceived: many(referrals, { relationName: "referredOauthUser" }),
}));

export const localUsersRelations = relations(localUsers, ({ many }) => ({
  expenses: many(expenses),
  categories: many(expenseCategories),
  sessions: many(sessions),
  wallets: many(userWallets),
  goals: many(financialGoals),
  contacts: many(userContacts),
  businesses: many(userBusinesses),
  chatConversations: many(chatConversations),
  inAppNotifications: many(inAppNotifications),
  aiMemoryItems: many(aiMemoryItems),
  userProfiles: many(userProfiles),
  proSubscriptions: many(proSubscriptions),
  userBudgets: many(userBudgets),
  userCredentials: many(userCredentials),
  pushSubscriptions: many(pushSubscriptions),
  webhookTokens: many(webhookTokens),
  userDictionaries: many(userDictionaries),
  voiceUsage: many(voiceUsage),
  rawSmsEvents: many(rawSmsEvents),
  userAnalytics: many(userAnalytics),
  supportTickets: many(supportTickets),
  monthlyReports: many(monthlyReports),
  aiSummaries: many(aiSummaries),
  profileLearningEvents: many(profileLearningEvents),
  monthlyBehaviorSnapshots: many(monthlyBehaviorSnapshots),
  aiConversationSummaries: many(aiConversationSummaries),
  aiActionMemory: many(aiActionMemory),
  aiPendingActions: many(aiPendingActions),
  aiActionAuditLogs: many(aiActionAuditLogs),
  pendingClarifications: many(pendingClarifications),
  notificationLogs: many(notificationLogs),
  adClicks: many(adClicks),
  aiMemoryEmbeddings: many(aiMemoryEmbeddings),
  authChallenges: many(authChallenges),
  classificationLogs: many(classificationLogs),
  discountCodes: many(discountCodes),
  apiKeyErrors: many(apiKeyErrors),
  referralsMade: many(referrals, { relationName: "referrerLocalUser" }),
  referralsReceived: many(referrals, { relationName: "referredLocalUser" }),
}));

export const expensesRelations = relations(expenses, ({ one, many }) => ({
  localUser: one(localUsers, {
    fields: [expenses.userId],
    references: [localUsers.id],
  }),
  oauthUser: one(users, {
    fields: [expenses.userId],
    references: [users.id],
  }),
  business: one(userBusinesses, {
    fields: [expenses.businessId],
    references: [userBusinesses.id],
  }),
  contact: one(userContacts, {
    fields: [expenses.contactId],
    references: [userContacts.id],
  }),
  classificationLog: one(classificationLogs, {
    fields: [expenses.classificationLogId],
    references: [classificationLogs.id],
  }),
  wallet: one(userWallets, {
    fields: [expenses.walletId],
    references: [userWallets.id],
  }),
  clarifications: many(pendingClarifications),
}));

export const categoriesRelations = relations(expenseCategories, ({ one }) => ({
  localUser: one(localUsers, {
    fields: [expenseCategories.userId],
    references: [localUsers.id],
  }),
  oauthUser: one(users, {
    fields: [expenseCategories.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  localUser: one(localUsers, {
    fields: [sessions.userId],
    references: [localUsers.id],
  }),
  oauthUser: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const userWalletsRelations = relations(userWallets, ({ one, many }) => ({
  localUser: one(localUsers, {
    fields: [userWallets.userId],
    references: [localUsers.id],
  }),
  oauthUser: one(users, {
    fields: [userWallets.userId],
    references: [users.id],
  }),
  expenses: many(expenses),
}));

export const financialGoalsRelations = relations(financialGoals, ({ one, many }) => ({
  localUser: one(localUsers, {
    fields: [financialGoals.userId],
    references: [localUsers.id],
  }),
  oauthUser: one(users, {
    fields: [financialGoals.userId],
    references: [users.id],
  }),
  budgets: many(userBudgets),
}));

export const userContactsRelations = relations(userContacts, ({ one, many }) => ({
  localUser: one(localUsers, {
    fields: [userContacts.userId],
    references: [localUsers.id],
  }),
  oauthUser: one(users, {
    fields: [userContacts.userId],
    references: [users.id],
  }),
  business: one(userBusinesses, {
    fields: [userContacts.businessId],
    references: [userBusinesses.id],
  }),
  expenses: many(expenses),
}));

export const classificationLogsRelations = relations(classificationLogs, ({ one, many }) => ({
  localUser: one(localUsers, {
    fields: [classificationLogs.userId],
    references: [localUsers.id],
  }),
  oauthUser: one(users, {
    fields: [classificationLogs.userId],
    references: [users.id],
  }),
  expenses: many(expenses),
}));

export const userBusinessesRelations = relations(userBusinesses, ({ one, many }) => ({
  localUser: one(localUsers, {
    fields: [userBusinesses.userId],
    references: [localUsers.id],
  }),
  oauthUser: one(users, {
    fields: [userBusinesses.userId],
    references: [users.id],
  }),
  categories: many(businessCategories),
  contacts: many(userContacts),
  expenses: many(expenses),
}));

export const businessCategoriesRelations = relations(businessCategories, ({ one }) => ({
  business: one(userBusinesses, {
    fields: [businessCategories.businessId],
    references: [userBusinesses.id],
  }),
}));

export const pendingClarificationsRelations = relations(pendingClarifications, ({ one }) => ({
  localUser: one(localUsers, { fields: [pendingClarifications.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [pendingClarifications.userId], references: [users.id] }),
  expense: one(expenses, { fields: [pendingClarifications.expenseId], references: [expenses.id] }),
}));

export const monthlyReportsRelations = relations(monthlyReports, ({ one }) => ({
  localUser: one(localUsers, { fields: [monthlyReports.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [monthlyReports.userId], references: [users.id] }),
}));

export const userAnalyticsRelations = relations(userAnalytics, ({ one }) => ({
  localUser: one(localUsers, { fields: [userAnalytics.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [userAnalytics.userId], references: [users.id] }),
}));

export const supportTicketsRelations = relations(supportTickets, ({ one }) => ({
  localUser: one(localUsers, { fields: [supportTickets.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [supportTickets.userId], references: [users.id] }),
}));

export const aiSummariesRelations = relations(aiSummaries, ({ one }) => ({
  localUser: one(localUsers, { fields: [aiSummaries.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [aiSummaries.userId], references: [users.id] }),
}));

export const adsRelations = relations(ads, ({ many }) => ({
  clicks: many(adClicks),
}));

export const adClicksRelations = relations(adClicks, ({ one }) => ({
  localUser: one(localUsers, { fields: [adClicks.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [adClicks.userId], references: [users.id] }),
  ad: one(ads, { fields: [adClicks.adId], references: [ads.id] }),
}));

export const proSubscriptionsRelations = relations(proSubscriptions, ({ one }) => ({
  localUser: one(localUsers, { fields: [proSubscriptions.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [proSubscriptions.userId], references: [users.id] }),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  localUser: one(localUsers, { fields: [userProfiles.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [userProfiles.userId], references: [users.id] }),
}));

export const profileLearningEventsRelations = relations(profileLearningEvents, ({ one }) => ({
  localUser: one(localUsers, { fields: [profileLearningEvents.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [profileLearningEvents.userId], references: [users.id] }),
}));

export const monthlyBehaviorSnapshotsRelations = relations(monthlyBehaviorSnapshots, ({ one }) => ({
  localUser: one(localUsers, { fields: [monthlyBehaviorSnapshots.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [monthlyBehaviorSnapshots.userId], references: [users.id] }),
}));

export const userDictionariesRelations = relations(userDictionaries, ({ one }) => ({
  localUser: one(localUsers, { fields: [userDictionaries.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [userDictionaries.userId], references: [users.id] }),
}));

export const voiceUsageRelations = relations(voiceUsage, ({ one }) => ({
  localUser: one(localUsers, { fields: [voiceUsage.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [voiceUsage.userId], references: [users.id] }),
}));

export const webhookTokensRelations = relations(webhookTokens, ({ one }) => ({
  localUser: one(localUsers, { fields: [webhookTokens.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [webhookTokens.userId], references: [users.id] }),
}));

export const userBudgetsRelations = relations(userBudgets, ({ one }) => ({
  localUser: one(localUsers, { fields: [userBudgets.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [userBudgets.userId], references: [users.id] }),
  linkedGoal: one(financialGoals, { fields: [userBudgets.linkedGoalId], references: [financialGoals.id] }),
}));

export const rawSmsEventsRelations = relations(rawSmsEvents, ({ one }) => ({
  localUser: one(localUsers, { fields: [rawSmsEvents.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [rawSmsEvents.userId], references: [users.id] }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  localUser: one(localUsers, { fields: [pushSubscriptions.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [pushSubscriptions.userId], references: [users.id] }),
}));

export const userCredentialsRelations = relations(userCredentials, ({ one }) => ({
  localUser: one(localUsers, { fields: [userCredentials.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [userCredentials.userId], references: [users.id] }),
}));

export const authChallengesRelations = relations(authChallenges, ({ one }) => ({
  localUser: one(localUsers, { fields: [authChallenges.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [authChallenges.userId], references: [users.id] }),
}));

export const notificationTemplatesRelations = relations(notificationTemplates, ({ many }) => ({
  logs: many(notificationLogs),
}));

export const inAppNotificationsRelations = relations(inAppNotifications, ({ one }) => ({
  localUser: one(localUsers, { fields: [inAppNotifications.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [inAppNotifications.userId], references: [users.id] }),
}));

export const notificationLogsRelations = relations(notificationLogs, ({ one }) => ({
  localUser: one(localUsers, { fields: [notificationLogs.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [notificationLogs.userId], references: [users.id] }),
  template: one(notificationTemplates, { fields: [notificationLogs.templateId], references: [notificationTemplates.id] }),
}));

export const chatConversationsRelations = relations(chatConversations, ({ one, many }) => ({
  localUser: one(localUsers, { fields: [chatConversations.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [chatConversations.userId], references: [users.id] }),
  messages: many(chatMessages),
  summaries: many(aiConversationSummaries),
  memoryItems: many(aiMemoryItems),
  actionMemories: many(aiActionMemory),
  pendingActions: many(aiPendingActions),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one, many }) => ({
  conversation: one(chatConversations, { fields: [chatMessages.conversationId], references: [chatConversations.id] }),
  memoryItems: many(aiMemoryItems),
}));

export const aiConversationSummariesRelations = relations(aiConversationSummaries, ({ one }) => ({
  localUser: one(localUsers, { fields: [aiConversationSummaries.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [aiConversationSummaries.userId], references: [users.id] }),
  conversation: one(chatConversations, { fields: [aiConversationSummaries.conversationId], references: [chatConversations.id] }),
}));

export const aiMemoryItemsRelations = relations(aiMemoryItems, ({ one, many }) => ({
  localUser: one(localUsers, { fields: [aiMemoryItems.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [aiMemoryItems.userId], references: [users.id] }),
  sourceConversation: one(chatConversations, { fields: [aiMemoryItems.sourceConversationId], references: [chatConversations.id] }),
  sourceMessage: one(chatMessages, { fields: [aiMemoryItems.sourceMessageId], references: [chatMessages.id] }),
  embeddings: many(aiMemoryEmbeddings),
}));

export const aiMemoryEmbeddingsRelations = relations(aiMemoryEmbeddings, ({ one }) => ({
  localUser: one(localUsers, { fields: [aiMemoryEmbeddings.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [aiMemoryEmbeddings.userId], references: [users.id] }),
  memoryItem: one(aiMemoryItems, { fields: [aiMemoryEmbeddings.memoryItemId], references: [aiMemoryItems.id] }),
}));

export const aiActionMemoryRelations = relations(aiActionMemory, ({ one }) => ({
  localUser: one(localUsers, { fields: [aiActionMemory.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [aiActionMemory.userId], references: [users.id] }),
  sourceConversation: one(chatConversations, { fields: [aiActionMemory.sourceConversationId], references: [chatConversations.id] }),
}));

export const aiPendingActionsRelations = relations(aiPendingActions, ({ one, many }) => ({
  localUser: one(localUsers, { fields: [aiPendingActions.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [aiPendingActions.userId], references: [users.id] }),
  conversation: one(chatConversations, { fields: [aiPendingActions.conversationId], references: [chatConversations.id] }),
  auditLogs: many(aiActionAuditLogs),
}));

export const aiActionAuditLogsRelations = relations(aiActionAuditLogs, ({ one }) => ({
  localUser: one(localUsers, { fields: [aiActionAuditLogs.userId], references: [localUsers.id] }),
  oauthUser: one(users, { fields: [aiActionAuditLogs.userId], references: [users.id] }),
  action: one(aiPendingActions, { fields: [aiActionAuditLogs.actionId], references: [aiPendingActions.id] }),
}));

export const discountCodesRelations = relations(discountCodes, ({ one }) => ({
  localUser: one(localUsers, {
    fields: [discountCodes.createdBy],
    references: [localUsers.id],
  }),
  oauthUser: one(users, {
    fields: [discountCodes.createdBy],
    references: [users.id],
  }),
}));

export const referralsRelations = relations(referrals, ({ one }) => ({
  referrerLocalUser: one(localUsers, {
    fields: [referrals.referrerId],
    references: [localUsers.id],
    relationName: "referrerLocalUser",
  }),
  referrerOauthUser: one(users, {
    fields: [referrals.referrerId],
    references: [users.id],
    relationName: "referrerOauthUser",
  }),
  referredLocalUser: one(localUsers, {
    fields: [referrals.referredId],
    references: [localUsers.id],
    relationName: "referredLocalUser",
  }),
  referredOauthUser: one(users, {
    fields: [referrals.referredId],
    references: [users.id],
    relationName: "referredOauthUser",
  }),
}));

export const apiKeyErrorsRelations = relations(apiKeyErrors, ({ one }) => ({
  localUser: one(localUsers, {
    fields: [apiKeyErrors.userId],
    references: [localUsers.id],
  }),
  oauthUser: one(users, {
    fields: [apiKeyErrors.userId],
    references: [users.id],
  }),
}));

export const aiProvidersRelations = relations(aiProviders, ({ many }) => ({
  models: many(aiModels),
  ledgers: many(aiTokenLedgers),
}));

export const aiModelsRelations = relations(aiModels, ({ one }) => ({
  provider: one(aiProviders, {
    fields: [aiModels.providerId],
    references: [aiProviders.id],
  }),
}));

export const aiTokenLedgersRelations = relations(aiTokenLedgers, ({ one }) => ({
  provider: one(aiProviders, {
    fields: [aiTokenLedgers.providerId],
    references: [aiProviders.id],
  }),
  localUser: one(localUsers, {
    fields: [aiTokenLedgers.userId],
    references: [localUsers.id],
  }),
  oauthUser: one(users, {
    fields: [aiTokenLedgers.userId],
    references: [users.id],
  }),
  conversation: one(chatConversations, {
    fields: [aiTokenLedgers.conversationId],
    references: [chatConversations.id],
  }),
  classificationLog: one(classificationLogs, {
    fields: [aiTokenLedgers.classificationLogId],
    references: [classificationLogs.id],
  }),
}));
