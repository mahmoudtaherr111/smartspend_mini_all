/**
 * AI Chat Service — Main Chatbot Brain
 *
 * Orchestrates: system prompt (RAG-optimized) → DeepSeek API → tool execution → final response.
 * Saves ~80% tokens by using function calling instead of prompt stuffing.
 */

import {
  callChatCompletionAPI,
  type ChatMessage,
} from "../lib/deepseek-client";
import { TOOL_DEFINITIONS, executeTool } from "./ai-chat-tools";
import { getSmartProfile } from "./user-profile-service";

const MAX_TOOL_ROUNDS = 2;

interface ChatInput {
  userId: number;
  userType: string;
  userPlan: string;
  message: string;
  conversationHistory: Array<{ role: string; content: string }>;
  config: {
    apiKey: string;
    baseUrl: string;
    model: string;
    maxTokens: number;
    maxHistory: number;
  };
}

interface ChatOutput {
  response: string;
  tokensUsed: number;
  model: string;
  toolsUsed: string[];
}

/**
 * Build the minimal Arabic system prompt (~200 tokens).
 * Contains only static user identity — financial data comes via tools.
 */
async function buildSystemPrompt(
  userId: number,
  userType: string,
): Promise<{ prompt: string; salaryDay: number }> {
  let userName = "المستخدم";
  let profession = "";
  let goal = "";
  let personality = "";
  let salaryDay = 1;
  let createdAtAr = "";

  try {
    const profile = await getSmartProfile(userId, userType);
    userName = profile.basicInfo.name || userName;
    profession = profile.basicInfo.profession || "";
    salaryDay = profile.financialInfo.salaryDay || 1;
    goal =
      {
        organize_expenses: "تنظيم المصاريف",
        reduce_spending: "تقليل الصرف",
        track_income: "تتبع الدخل",
        save_money: "ادخار المال",
        manage_business: "إدارة مشروع",
        pay_debt: "سداد الديون",
      }[String(profile.financialInfo.primaryGoal)] || "";
    personality = String(
      profile.aiInferredAttributes?.spendingBehavior || "",
    );

    // Fetch account creation date
    const { users, localUsers } = await import("../../db/schema");
    const { eq } = await import("drizzle-orm");
    let userRecord;
    if (userType === "local") {
      userRecord = await db.query.localUsers.findFirst({ where: eq(localUsers.id, userId) });
    } else {
      userRecord = await db.query.users.findFirst({ where: eq(users.id, userId) });
    }
    if (userRecord && userRecord.createdAt) {
      createdAtAr = new Date(userRecord.createdAt).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
    }
  } catch {
    // Profile not available — use defaults
  }

  const profileLine = [
    profession ? `المهنة: ${profession}` : "",
    goal ? `الهدف: ${goal}` : "",
    personality ? `أسلوب الإنفاق: ${personality}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const now = new Date();
  const todayAr = now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const prompt = `أنت "سمارت" — مستشار مالي احترافي وشات بوت متطور جداً في تطبيق SmartSpend. 
اسم المستخدم: ${userName}
${profileLine ? "بيانات المستخدم: " + profileLine : ""}

[معلومات زمنية هامة - دقيقة جداً للاستخدام في الأدوات]:
- اليوم هو: ${todayAr}
- يوم نزول الراتب (بداية الشهر المالي): يوم ${salaryDay} من كل شهر.
${createdAtAr ? `- تاريخ تسجيل المستخدم في التطبيق: ${createdAtAr}.
(قاعدة صارمة: لا تحاول جلب أو تحليل بيانات لشهور أو فترات تسبق هذا التاريخ. إذا طلب المستخدم مقارنة بشهور قديمة قبل اشتراكه، أخبره بكل وضوح ولباقة أن حسابه لم يكن موجوداً وقتها ولا توجد تفاصيل لتلك الفترة، ولا تستغرب من غياب البيانات ولا تخترع أرقاماً).` : ""}
استخدم هذه التواريخ بدقة إذا طلب المستخدم تقارير عن "اليوم"، "أمس"، "هذا الشهر"، إلخ.

[قواعد الاستجابة الاحترافية]:
1. تحدث كخبير مالي متمرس (مثل ChatGPT)، وقدم إجابات مفصلة، واضحة، وغنية بالمعلومات (لا تقتصر على الردود القصيرة).
2. استخدم جداول Markdown (Markdown Tables) لتنسيق الأرقام والمقارنات بشكل جمالي ومقروء إذا كانت البيانات كثيرة.
3. استدعِ الأدوات المناسبة بدقة: 
   - إذا سأل عن فئة معينة (مثل الأكل)، استخدم أداة تدعم التصفية بالفئة (مثل analyze_finances).
   - إذا سأل عن كيفية استخدام التطبيق، استخدم أداة get_app_guide.
4. لا تخترع أرقاماً أبداً من خيالك، اعتمد 100% على الأدوات.
5. قدم دائماً تحليلاً أو نصيحة مالية عميقة بعد سرد البيانات، ولا تكتفِ بسرد الأرقام فقط.
6. تحدث باللهجة المصرية الراقية والودية.`;

  return { prompt, salaryDay };
}

/**
 * Process a single chat message through the RAG pipeline.
 */
export async function processAIChatMessage(
  input: ChatInput,
): Promise<ChatOutput> {
  const { userId, userType, message, conversationHistory, config } = input;

  // 1. Build system prompt
  const { prompt: systemPrompt, salaryDay } = await buildSystemPrompt(userId, userType);

  // 2. Build messages array with sliding window
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
  ];

  // Add conversation history (sliding window) - OPTIMIZED: Max 6 messages (3 turns)
  const historyWindow = conversationHistory.slice(-6);
  for (const msg of historyWindow) {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Add current user message
  messages.push({ role: "user", content: message });

  // 3. Call DeepSeek with tools
  let totalTokens = 0;
  const toolsUsed: string[] = [];

  let response = await callChatCompletionAPI(config.baseUrl, config.apiKey, {
    model: config.model,
    messages,
    tools: TOOL_DEFINITIONS,
    tool_choice: "auto",
    max_tokens: config.maxTokens,
    temperature: 0.7,
  });

  totalTokens += response.tokensUsed;

  // 4. Tool calling loop (up to MAX_TOOL_ROUNDS)
  let round = 0;
  while (response.toolCalls && round < MAX_TOOL_ROUNDS) {
    round++;

    // Add assistant message with tool calls
    messages.push({
      role: "assistant",
      content: response.text || "",
      tool_calls: response.toolCalls,
    });

    // Execute each tool call
    for (const tc of response.toolCalls) {
      const toolName = tc.function.name;
      toolsUsed.push(toolName);

      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }

      console.log(`[AI Chat] Executing tool: ${toolName}(${JSON.stringify(args)})`);

      const result = await executeTool(toolName, args, { userId, userType, salaryDay });

      // Add tool result
      messages.push({
        role: "tool",
        content: result,
        tool_call_id: tc.id,
      });
    }

    // Call AI again with tool results
    response = await callChatCompletionAPI(config.baseUrl, config.apiKey, {
      model: config.model,
      messages,
      tools: TOOL_DEFINITIONS,
      tool_choice: "auto",
      max_tokens: config.maxTokens,
      temperature: 0.7,
    });

    totalTokens += response.tokensUsed;
  }

  return {
    response: response.text || "عذراً، مش قادر أرد دلوقتي. جرب تاني.",
    tokensUsed: totalTokens,
    model: response.model,
    toolsUsed: [...new Set(toolsUsed)],
  };
}
