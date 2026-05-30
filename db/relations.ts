import { relations } from "drizzle-orm";
import {
  users,
  localUsers,
  expenses,
  expenseCategories,
  sessions,
  userWallets,
  financialGoals,
} from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  expenses: many(expenses),
  categories: many(expenseCategories),
  sessions: many(sessions),
  wallets: many(userWallets),
  goals: many(financialGoals),
}));

export const localUsersRelations = relations(localUsers, ({ many }) => ({
  expenses: many(expenses),
  categories: many(expenseCategories),
  sessions: many(sessions),
  wallets: many(userWallets),
  goals: many(financialGoals),
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
