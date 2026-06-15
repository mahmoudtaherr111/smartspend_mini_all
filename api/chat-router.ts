/**
 * Chat Router — tRPC endpoints for the AI Chatbot
 *
 * Endpoints:
 * - sendMessage: Send a message and get AI response
 * - getConversations: List user's conversations
 * - getConversation: Get a specific conversation with messages
 * - clearConversation: Delete a conversation
 * - getQuickActions: Get available quick action prompts
 */

import { z } from "zod";
import { router, authedProcedure, aiProcedure } from "./middleware";
import { TRPCError } from "@trpc/server";
import { db } from "./queries/connection";
import {
  chatConversations,
  chatMessages,
  systemSettings,
  users,
  localUsers,
} from "../db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { processAIChatMessage } from "./services/ai-chat-service";

// ─── Helpers ───

async function loadChatConfig(): Promise<{
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: Record<string, number>;
  dailyLimits: Record<string, number>;
  maxHistory: number;
  enabled: Record<string, boolean>;
}> {
  const rows = await db.select().from(systemSettings);
  const s: Record<string, string> = {};
  rows.forEach((r) => {
    if (r.key && r.value) s[r.key] = r.value;
  });

  return {
    apiKey: s.chatbot_api_key || s.fireworks_api_key || "",
    baseUrl: s.chatbot_base_url || "https://api.fireworks.ai/inference/v1",
    model: s.chatbot_model || "accounts/fireworks/models/deepseek-v4-flash",
    maxTokens: {
      free: parseInt(s.chatbot_max_tokens_free || "1000"),
      pro: parseInt(s.chatbot_max_tokens_pro || "3000"),
      ultra: parseInt(s.chatbot_max_tokens_ultra || "5000"),
    },
    dailyLimits: {
      free: parseInt(s.chatbot_daily_limit_free || "20"),
      pro: parseInt(s.chatbot_daily_limit_pro || "200"),
      ultra: parseInt(s.chatbot_daily_limit_ultra || "999999"),
    },
    maxHistory: parseInt(s.chatbot_max_history || "10"),
    enabled: {
      free: s.chatbot_enabled_free !== "false",
      pro: s.chatbot_enabled_pro !== "false",
      ultra: s.chatbot_enabled_ultra !== "false",
    },
  };
}

async function getTodayMessageCount(
  userId: number,
  userType: string,
): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(chatMessages)
    .innerJoin(
      chatConversations,
      eq(chatMessages.conversationId, chatConversations.id),
    )
    .where(
      and(
        eq(chatConversations.userId, userId),
        eq(chatConversations.userType, userType),
        eq(chatMessages.role, "user"),
        sql`${chatMessages.createdAt} >= ${today}`,
      ),
    );

  return Number(result[0]?.count || 0);
}

// ─── Router ───

export const chatRouter = router({
  /**
   * Send a message to the AI chatbot and get a response.
   */
  sendMessage: aiProcedure
    .input(
      z.object({
        message: z.string().min(1).max(2000),
        conversationId: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { user } = ctx;
      const plan = user.plan || "free";

      // 1. Load config
      const config = await loadChatConfig();

      // Check if chatbot is enabled for this plan
      if (!config.enabled[plan]) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "الشات بوت مش متاح في خطتك الحالية. ترقي للبرو عشان تستخدمه! 🚀",
        });
      }

      if (!config.apiKey) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "الشات بوت مش مفعّل حالياً. تواصل مع الدعم.",
        });
      }

      // 2. Check daily limit
      const todayCount = await getTodayMessageCount(user.id, user.type);
      const dailyLimit = config.dailyLimits[plan] || 20;

      if (todayCount >= dailyLimit) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `وصلت الحد اليومي (${dailyLimit} رسالة). جرب بكره أو ترقي خطتك! 💎`,
        });
      }

      // 3. Get or create conversation
      let conversationId = input.conversationId;
      if (!conversationId) {
        // Create new conversation
        const [inserted] = await db.insert(chatConversations).values({
          userId: user.id,
          userType: user.type,
          title: input.message.slice(0, 100),
          messageCount: 0,
          totalTokens: 0,
          lastMessageAt: new Date(),
        });
        conversationId = (inserted as any).insertId;
      }

      // 4. Load conversation history from DB
      const existingMessages = await db
        .select({ role: chatMessages.role, content: chatMessages.content })
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, conversationId))
        .orderBy(chatMessages.createdAt);

      const conversationHistory = existingMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }));

      // 5. Save user message to DB
      await db.insert(chatMessages).values({
        conversationId,
        role: "user",
        content: input.message,
        tokensUsed: 0,
        createdAt: new Date(),
      });

      // 6. Process through AI
      const maxTokens = config.maxTokens[plan] || 1000;
      const result = await processAIChatMessage({
        userId: user.id,
        userType: user.type,
        userPlan: plan,
        message: input.message,
        conversationHistory,
        config: {
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.model,
          maxTokens,
          maxHistory: config.maxHistory,
        },
      });

      // 7. Save assistant response to DB
      await db.insert(chatMessages).values({
        conversationId,
        role: "assistant",
        content: result.response,
        tokensUsed: result.tokensUsed,
        model: result.model,
        toolCalls: result.toolsUsed.length > 0 ? result.toolsUsed : null,
        createdAt: new Date(),
      });

      // 8. Update conversation stats
      await db
        .update(chatConversations)
        .set({
          messageCount: sql`message_count + 2`,
          totalTokens: sql`total_tokens + ${result.tokensUsed}`,
          lastMessageAt: new Date(),
          title: conversationHistory.length === 0
            ? input.message.slice(0, 100)
            : undefined,
        })
        .where(eq(chatConversations.id, conversationId));

      // 9. Update user's AI tokens used
      const tokensToAdd = result.tokensUsed;
      if (user.type === "oauth") {
        await db
          .update(users)
          .set({ aiTokensUsed: sql`ai_tokens_used + ${tokensToAdd}` })
          .where(eq(users.id, user.id));
      } else {
        await db
          .update(localUsers)
          .set({ aiTokensUsed: sql`ai_tokens_used + ${tokensToAdd}` })
          .where(eq(localUsers.id, user.id));
      }

      return {
        response: result.response,
        conversationId,
        tokensUsed: result.tokensUsed,
        model: result.model,
        toolsUsed: result.toolsUsed,
      };
    }),

  /**
   * Get user's conversation list.
   */
  getConversations: authedProcedure.query(async ({ ctx }) => {
    const conversations = await db
      .select()
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.userId, ctx.user.id),
          eq(chatConversations.userType, ctx.user.type),
        ),
      )
      .orderBy(desc(chatConversations.lastMessageAt))
      .limit(30);

    return conversations.map((c) => ({
      id: c.id,
      title: c.title,
      messageCount: c.messageCount,
      lastMessageAt: c.lastMessageAt,
      createdAt: c.createdAt,
    }));
  }),

  /**
   * Get messages for a specific conversation.
   */
  getConversation: authedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const [conv] = await db
        .select()
        .from(chatConversations)
        .where(
          and(
            eq(chatConversations.id, input.conversationId),
            eq(chatConversations.userId, ctx.user.id),
            eq(chatConversations.userType, ctx.user.type),
          ),
        )
        .limit(1);

      if (!conv) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "المحادثة مش موجودة.",
        });
      }

      const messages = await db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.conversationId, input.conversationId))
        .orderBy(chatMessages.createdAt);

      return {
        conversation: {
          id: conv.id,
          title: conv.title,
          createdAt: conv.createdAt,
        },
        messages: messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt,
          })),
      };
    }),

  /**
   * Delete a conversation and its messages.
   */
  clearConversation: authedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const [conv] = await db
        .select()
        .from(chatConversations)
        .where(
          and(
            eq(chatConversations.id, input.conversationId),
            eq(chatConversations.userId, ctx.user.id),
            eq(chatConversations.userType, ctx.user.type),
          ),
        )
        .limit(1);

      if (!conv) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "المحادثة مش موجودة.",
        });
      }

      await db
        .delete(chatMessages)
        .where(eq(chatMessages.conversationId, input.conversationId));
      await db
        .delete(chatConversations)
        .where(eq(chatConversations.id, input.conversationId));

      return { success: true };
    }),

  /**
   * Get available quick action prompts.
   */
  getQuickActions: authedProcedure.query(async () => {
    // Could be loaded from system settings in the future
    return [
      { label: "📊 ملخص الشهر", prompt: "إيه ملخص مصاريفي الشهر ده؟" },
      { label: "💰 صرفت كام النهاردة", prompt: "كم صرفت النهاردة؟" },
      {
        label: "📈 مقارنة بالشهر اللي فات",
        prompt: "قارن مصاريفي الشهر ده بالشهر اللي فات",
      },
      {
        label: "🏷️ أعلى الفئات",
        prompt: "إيه أعلى 3 فئات صرف عليها الشهر ده؟",
      },
      {
        label: "💳 أرصدة المحافظ",
        prompt: "فاضل كام في محافظي؟",
      },
      {
        label: "🎯 أهداف الادخار",
        prompt: "وصلت كام في أهداف الادخار بتاعتي؟",
      },
    ];
  }),
});
