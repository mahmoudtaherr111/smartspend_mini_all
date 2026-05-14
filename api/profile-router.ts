import { z } from "zod";
import { router, authedProcedure } from "./middleware";
import { db } from "./queries/connection";
import { userProfiles, onboardingQuestions, users, localUsers } from "../db/schema";
import { eq, and } from "drizzle-orm";

export const profileRouter = router({
  getMyProfile: authedProcedure.query(async ({ ctx }) => {
    const profile = await db.select().from(userProfiles)
      .where(and(eq(userProfiles.userId, ctx.user.id), eq(userProfiles.userType, ctx.user.type)))
      .limit(1);
    return profile[0] || { profileCompleted: false };
  }),

  updateProfile: authedProcedure
    .input(z.object({
      monthlyIncome: z.number().optional(),
      financialGoal: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.insert(userProfiles).values({
        userId: ctx.user.id,
        userType: ctx.user.type,
        monthlyIncome: input.monthlyIncome?.toString(),
        financialGoal: input.financialGoal,
        profileCompleted: true,
        lastAskedAt: new Date(),
      }).onDuplicateKeyUpdate({
        set: {
          monthlyIncome: input.monthlyIncome?.toString(),
          financialGoal: input.financialGoal,
          profileCompleted: true,
          lastAskedAt: new Date(),
        },
      });
      return { success: true };
    }),

  getQuestions: authedProcedure.query(async () => {
    return await db.select().from(onboardingQuestions)
      .where(eq(onboardingQuestions.isActive, true))
      .orderBy(onboardingQuestions.sortOrder);
  }),

  updateUserInfo: authedProcedure
    .input(z.object({
      name: z.string().min(2).optional(),
      phone: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.type === "oauth") {
        if (input.name) {
          await db.update(users).set({ name: input.name }).where(eq(users.id, ctx.user.id));
        }
      } else {
        const updates: any = {};
        if (input.name) updates.name = input.name;
        if (input.phone) updates.phone = input.phone;
        if (Object.keys(updates).length > 0) {
          await db.update(localUsers).set(updates).where(eq(localUsers.id, ctx.user.id));
        }
      }
      return { success: true };
    }),
});
