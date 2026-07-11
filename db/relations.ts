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
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  expenses: many(expenses),
  categories: many(expenseCategories),
  sessions: many(sessions),
  wallets: many(userWallets),
  goals: many(financialGoals),
  contacts: many(userContacts),
  businesses: many(userBusinesses),
}));

export const localUsersRelations = relations(localUsers, ({ many }) => ({
  expenses: many(expenses),
  categories: many(expenseCategories),
  sessions: many(sessions),
  wallets: many(userWallets),
  goals: many(financialGoals),
  contacts: many(userContacts),
  businesses: many(userBusinesses),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
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

export const userWalletsRelations = relations(userWallets, ({ one }) => ({
  localUser: one(localUsers, {
    fields: [userWallets.userId],
    references: [localUsers.id],
  }),
  oauthUser: one(users, {
    fields: [userWallets.userId],
    references: [users.id],
  }),
}));

export const financialGoalsRelations = relations(financialGoals, ({ one }) => ({
  localUser: one(localUsers, {
    fields: [financialGoals.userId],
    references: [localUsers.id],
  }),
  oauthUser: one(users, {
    fields: [financialGoals.userId],
    references: [users.id],
  }),
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

export const classificationLogsRelations = relations(classificationLogs, ({ many }) => ({
  expenses: many(expenses),
}));

export const userBusinessesRelations = relations(userBusinesses, ({ many }) => ({
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
