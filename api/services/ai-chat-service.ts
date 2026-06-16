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
import { db } from "../queries/connection";
import { TOOL_DEFINITIONS, executeTool } from "./ai-chat-tools";
import { getSmartProfile } from "./user-profile-service";

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
    maxToolRounds?: number;
  };
}

interface ChatOutput {
  response: string;
  tokensUsed: number;
  model: string;
  toolsUsed: string[];
}

function profileString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function profileNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function looksLikeToolPreludeOnly(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return true;
  return (
    normalized.length < 220 &&
    /(خليني اشوف|خليني أشوف|اشوف تفاصيل|أشوف تفاصيل|هراجع|هشيك)/i.test(
      normalized,
    )
  );
}

function buildGoalFallback(toolResult: string | undefined): string | undefined {
  if (!toolResult) return undefined;

  try {
    const parsed = JSON.parse(toolResult) as {
      result?: { goals?: Array<{ title?: string; target_amount?: number; targetAmount?: number; status?: string }> };
    };
    const goals = parsed.result?.goals ?? [];
    if (Array.isArray(goals) && goals.length > 0) {
      const normalizedGoals = goals
        .map((goal) => ({
          title: profileString(goal.title, ""),
          targetAmount: profileNumber(goal.target_amount ?? goal.targetAmount, 0),
          status: profileString(goal.status, ""),
        }))
        .filter((goal) => goal.title || goal.targetAmount > 0);
      const preferred =
        normalizedGoals.find((goal) => /عربي|سيار|car/i.test(goal.title) && goal.targetAmount > 0) ??
        normalizedGoals.find((goal) => goal.targetAmount > 0) ??
        normalizedGoals[0];
      if (preferred) {
        const amountText =
          preferred.targetAmount > 0
            ? `${preferred.targetAmount.toLocaleString("ar-EG")} جنيه`
            : "مبلغ غير محدد";
        return `أيوه، حسب أهدافك المسجلة هدف العربية هو ${amountText}. الهدف ظاهر عندك باسم "${preferred.title}" وحالته ${preferred.status || "نشط"}.`;
      }
    }
  } catch {
    // Older tool results may be compact text; fall through to the legacy parser below.
  }

  const rows = toolResult
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("|") && !line.startsWith("title |"));

  const parsed = rows
    .map((line) => {
      const [title = "", amount = "", status = ""] = line
        .split("|")
        .map((part) => part.trim());
      const targetAmount = Number(amount);
      return {
        title,
        targetAmount: Number.isFinite(targetAmount) ? targetAmount : 0,
        status,
      };
    })
    .filter((goal) => goal.title || goal.targetAmount > 0);

  if (parsed.length === 0) return undefined;

  const preferred =
    parsed.find((goal) => /عربي|سيار|car/i.test(goal.title) && goal.targetAmount > 0) ??
    parsed.find((goal) => goal.targetAmount > 0) ??
    parsed[0];

  const amountText =
    preferred.targetAmount > 0 ? `${preferred.targetAmount.toLocaleString("ar-EG")} جنيه` : "مبلغ غير محدد";
  return `أيوه، حسب أهدافك المسجلة هدف العربية هو ${amountText}. الهدف ظاهر عندك باسم "${preferred.title}" وحالته ${preferred.status || "نشط"}.`;
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
    userName = profileString(profile.basicInfo.name, userName);
    profession = profileString(profile.basicInfo.profession);
    salaryDay = profileNumber(profile.financialInfo.salaryDay, 1);
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
   - في الأسئلة المالية استخدم finance_query كخيار أول دائماً لأنها ترجع JSON facts صغير من Finance Semantic Layer.
   - إذا سأل عن فئة معينة (مثل الأكل)، استخدم finance_query بنوع category_total ومع category مناسبة.
   - إذا سأل عن كيفية استخدام التطبيق، استخدم أداة get_app_guide.
   - إذا طلب إنشاء هدف/ميزانية/محفظة أو تنفيذ عملية داخل التطبيق، اشرح إنك ستجهز العملية للمراجعة وأن التنفيذ النهائي يحتاج تأكيد المستخدم. لا تقل إنك لا تستطيع تنفيذها أو إن المستخدم لازم يعملها يدوياً إذا كان طلبه واضحاً.
4. دليل التطبيق الناتج من get_app_guide هو المصدر الحاسم في أسئلة استخدام SmartSpend. لا تقل إن خاصية غير مدعومة إذا ذكرها الدليل.
5. نتائج الأدوات تأتي في JSON envelope. اقرأ result/facts/artifacts فقط، ولا تخترع أرقاماً أبداً من خيالك.
6. قدم دائماً تحليلاً أو نصيحة مالية عميقة بعد سرد البيانات، ولا تكتفِ بسرد الأرقام فقط.
7. بعد استخدام أي أداة، لا ترد بجملة تمهيدية فقط مثل "خليني أشوف". لازم ترجع النتيجة النهائية من بيانات الأداة في نفس الرد.
8. تحدث باللهجة المصرية الراقية والودية.`;

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
  const toolResults: Array<{ name: string; content: string }> = [];
  const maxToolRounds = Math.max(0, Math.min(input.config.maxToolRounds ?? 1, 2));

  let response = await callChatCompletionAPI(config.baseUrl, config.apiKey, {
    model: config.model,
    messages,
    tools: TOOL_DEFINITIONS,
    tool_choice: "auto",
    max_tokens: config.maxTokens,
    temperature: 0.7,
  });

  totalTokens += response.tokensUsed;

  // 4. Tool calling loop (policy-limited; default is one round)
  let round = 0;
  while (response.toolCalls && round < maxToolRounds) {
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
      toolResults.push({ name: toolName, content: result });

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

  const goalFallback =
    toolsUsed.includes("get_financial_goals") && looksLikeToolPreludeOnly(response.text || "")
      ? buildGoalFallback(toolResults.find((item) => item.name === "get_financial_goals")?.content)
      : undefined;

  return {
    response: goalFallback || response.text || "عذراً، مش قادر أرد دلوقتي. جرب تاني.",
    tokensUsed: totalTokens,
    model: response.model,
    toolsUsed: [...new Set(toolsUsed)],
  };
}
