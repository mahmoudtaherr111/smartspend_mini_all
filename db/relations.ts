import { relations } from "drizzle-orm";
import { users, localUsers, expenses, expenseCategories, sessions } from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  expenses: many(expenses),
  categories: many(expenseCategories),
  sessions: many(sessions),
}));

export const localUsersRelations = relations(localUsers, ({ many }) => ({
  expenses: many(expenses),
  categories: many(expenseCategories),
  sessions: many(sessions),
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
