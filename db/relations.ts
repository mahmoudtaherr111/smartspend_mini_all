import { relations } from "drizzle-orm";
import { users, localUsers, expenses, expenseCategories, sessions } from "./schema";

export const usersRelations = relations(users, ({ many }) => ({
  expenses: many(expenses),
}));

export const localUsersRelations = relations(localUsers, ({ many }) => ({
  expenses: many(expenses),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  user: one(localUsers, {
    fields: [expenses.userId],
    references: [localUsers.id],
  }),
}));

export const categoriesRelations = relations(expenseCategories, ({ one }) => ({
  user: one(localUsers, {
    fields: [expenseCategories.userId],
    references: [localUsers.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(localUsers, {
    fields: [sessions.userId],
    references: [localUsers.id],
  }),
}));
