import {
  mysqlTable,
  int,
  varchar,
  text,
  datetime,
  boolean,
  json,
  decimal,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// ─── Users (OAuth) ───
export const users = mysqlTable(
  "users",
  {
    id: int("id").primaryKey().autoincrement(),
    unionId: varchar("union_id", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    avatar: varchar("avatar", { length: 500 }),
    role: varchar("role", { length: 50 }).notNull().default("user"), // user | moderator | admin
    plan: varchar("plan", { length: 50 }).notNull().default("free"), // free | pro | ultra
    referralCode: varchar("referral_code", { length: 50 }).unique(),
    referredBy: int("referred_by"),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
    lastSignInAt: datetime("last_sign_in_at"),
    aiTokensUsed: int("ai_tokens_used").default(0),
    currentStreak: int("current_streak").default(0),
    highestStreak: int("highest_streak").default(0),
    lastStreakAt: datetime("last_streak_at"),
  },
  (t) => [
    index("users_role_idx").on(t.role),
    index("users_plan_idx").on(t.plan),
    index("users_referral_idx").on(t.referralCode),
  ],
);

// ─── Local Users ───
export const localUsers = mysqlTable(
  "local_users",
  {
    id: int("id").primaryKey().autoincrement(),
    name: varchar("name", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull().unique(),
    password: varchar("password", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    avatar: varchar("avatar", { length: 500 }), // Added for profile pictures
    role: varchar("role", { length: 50 }).notNull().default("user"),
    plan: varchar("plan", { length: 50 }).notNull().default("free"), // free | pro | ultra
    referralCode: varchar("referral_code", { length: 50 }).unique(),
    referredBy: int("referred_by"),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
    lastSignInAt: datetime("last_sign_in_at"),
    aiTokensUsed: int("ai_tokens_used").default(0),
    currentStreak: int("current_streak").default(0),
    highestStreak: int("highest_streak").default(0),
    lastStreakAt: datetime("last_streak_at"),
  },
  (t) => [
    index("local_users_role_idx").on(t.role),
    index("local_users_plan_idx").on(t.plan),
  ],
);

// ─── Expenses ───
export const expenses = mysqlTable(
  "expenses",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(), // oauth | local
    type: varchar("type", { length: 50 }).notNull().default("expense"), // income | expense
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    category: varchar("category", { length: 100 }).notNull(),
    subCategory: varchar("sub_category", { length: 100 }), // New: Sub-category for deeper insights
    description: text("description"),
    rawText: text("raw_text"),
    source: varchar("source", { length: 50 }).notNull().default("manual"), // voice | manual
    paymentMethod: varchar("payment_method", { length: 50 }),
    placeHint: varchar("place_hint", { length: 150 }),
    parsedMetadata: json("parsed_metadata"),
    date: datetime("date").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("confirmed"), // confirmed | pending_clarification
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [
    index("expenses_user_idx").on(t.userId, t.userType),
    index("expenses_date_idx").on(t.date),
    index("expenses_user_date_idx").on(t.userId, t.userType, t.date),
    index("expenses_type_idx").on(t.type),
    index("expenses_category_idx").on(t.category),
    index("expenses_status_idx").on(t.status),
  ],
);

// ─── User Contacts (For Entity Extraction) ───
export const userContacts = mysqlTable(
  "user_contacts",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    relation: varchar("relation", { length: 100 }),
    aliases: json("aliases"),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("contacts_user_idx").on(t.userId, t.userType),
    index("contacts_name_idx").on(t.name),
  ]
);

// ─── Pending Clarifications ───
export const pendingClarifications = mysqlTable(
  "pending_clarifications",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    expenseId: int("expense_id"), // The expense row that is incomplete
    question: text("question").notNull(),
    originalText: text("original_text").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("pending"), // pending | resolved | ignored
    contextData: json("context_data"), // To store any state needed to resume the pipeline
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("clarifications_user_idx").on(t.userId, t.userType),
    index("clarifications_status_idx").on(t.status),
  ]
);

// ─── Expense Categories ───
export const expenseCategories = mysqlTable("expense_categories", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id"),
  userType: varchar("user_type", { length: 50 }),
  name: varchar("name", { length: 100 }).notNull(),
  icon: varchar("icon", { length: 50 }),
  color: varchar("color", { length: 50 }),
  isDefault: boolean("is_default").default(false),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// ─── User Wallets (3D Cards) ───
export const userWallets = mysqlTable(
  "user_wallets",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    name: varchar("name", { length: 100 }).notNull(), // e.g. "CIB Visa"
    provider: varchar("provider", { length: 50 }).notNull(), // Visa | VodafoneCash | InstaPay | BankTransfer
    lastFourDigits: varchar("last_four_digits", { length: 4 }), // For visual realism
    balance: decimal("balance", { precision: 12, scale: 2 }).default("0.00"),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("wallets_user_idx").on(t.userId, t.userType)],
);

// ─── Monthly Reports ───
export const monthlyReports = mysqlTable("monthly_reports", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  userType: varchar("user_type", { length: 50 }).notNull(),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  totalIncome: decimal("total_income", { precision: 12, scale: 2 }).default(
    "0.00",
  ),
  categoryBreakdown: json("category_breakdown"),
  topCategories: json("top_categories"),
  dailyAverage: decimal("daily_average", { precision: 12, scale: 2 }),
  highestDay: varchar("highest_day", { length: 10 }),
  insights: text("insights"),
  aiReport: text("ai_report"),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").default(
    sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ),
});

// ─── Sessions ───
export const sessions = mysqlTable(
  "sessions",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    token: varchar("token", { length: 500 }).notNull(),
    ipAddress: varchar("ip_address", { length: 100 }),
    userAgent: text("user_agent"),
    expiresAt: datetime("expires_at").notNull(),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("sessions_user_idx").on(t.userId, t.userType),
    index("sessions_token_idx").on(t.token),
  ],
);

// ─── User Analytics ───
export const userAnalytics = mysqlTable(
  "user_analytics",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    event: varchar("event", { length: 100 }).notNull(), // login | logout | page_view | expense_create | ai_use
    metadata: json("metadata"),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("analytics_user_idx").on(t.userId, t.userType),
    index("analytics_event_idx").on(t.event),
  ],
);

// ─── Support Tickets ───
export const supportTickets = mysqlTable(
  "support_tickets",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    message: text("message").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("open"), // open | in_progress | resolved | closed
    priority: varchar("priority", { length: 50 }).default("medium"), // low | medium | high | urgent
    assignedTo: int("assigned_to"),
    response: text("response"),
    respondedAt: datetime("responded_at"),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [
    index("tickets_user_idx").on(t.userId, t.userType),
    index("tickets_status_idx").on(t.status),
    index("tickets_assigned_idx").on(t.assignedTo),
  ],
);

// ─── Discount Codes ───
export const discountCodes = mysqlTable("discount_codes", {
  id: int("id").primaryKey().autoincrement(),
  code: varchar("code", { length: 100 }).notNull().unique(),
  type: varchar("type", { length: 50 }).notNull().default("referral"), // referral | promo
  discountPercent: int("discount_percent").default(0),
  maxUses: int("max_uses"),
  usedCount: int("used_count").default(0),
  createdBy: int("created_by"),
  expiresAt: datetime("expires_at"),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// ─── AI Summaries ───
export const aiSummaries = mysqlTable(
  "ai_summaries",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    period: varchar("period", { length: 50 }).notNull(), // monthly | yearly
    periodValue: varchar("period_value", { length: 50 }).notNull(), // 2024-01 | 2024
    model: varchar("model", { length: 100 }).default("gemini-1.5-flash"),
    content: text("content").notNull(),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("ai_summary_user_idx").on(t.userId, t.userType),
    uniqueIndex("ai_summary_period_idx").on(
      t.userId,
      t.userType,
      t.period,
      t.periodValue,
    ),
  ],
);

// ─── Ads ───
export const ads = mysqlTable("ads", {
  id: int("id").primaryKey().autoincrement(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  imageUrl: varchar("image_url", { length: 500 }),
  linkUrl: varchar("link_url", { length: 500 }),
  placement: varchar("placement", { length: 100 }).notNull().default("sidebar"), // sidebar | banner | popup
  targetPlan: varchar("target_plan", { length: 50 }).default("free"), // free | all
  startDate: datetime("start_date"),
  endDate: datetime("end_date"),
  clicks: int("clicks").default(0),
  impressions: int("impressions").default(0),
  isActive: boolean("is_active").default(true),
  createdBy: int("created_by"),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// ─── Ad Clicks ───
export const adClicks = mysqlTable("ad_clicks", {
  id: int("id").primaryKey().autoincrement(),
  adId: int("ad_id").notNull(),
  userId: int("user_id"),
  userType: varchar("user_type", { length: 50 }),
  ipAddress: varchar("ip_address", { length: 100 }),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// ─── Referrals ───
export const referrals = mysqlTable(
  "referrals",
  {
    id: int("id").primaryKey().autoincrement(),
    referrerId: int("referrer_id").notNull(),
    referrerType: varchar("referrer_type", { length: 50 }).notNull(),
    referredId: int("referred_id").notNull(),
    referredType: varchar("referred_type", { length: 50 }).notNull(),
    codeUsed: varchar("code_used", { length: 100 }),
    status: varchar("status", { length: 50 }).default("pending"), // pending | completed | rewarded
    rewardGiven: boolean("reward_given").default(false),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex("referral_unique_idx").on(
      t.referrerId,
      t.referrerType,
      t.referredId,
      t.referredType,
    ),
  ],
);

// ─── Pro Subscriptions ───
export const proSubscriptions = mysqlTable(
  "pro_subscriptions",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    plan: varchar("plan", { length: 50 }).notNull().default("pro_monthly"), // pro_monthly | pro_yearly
    status: varchar("status", { length: 50 }).notNull().default("active"), // active | cancelled | expired
    startDate: datetime("start_date").notNull(),
    endDate: datetime("end_date").notNull(),
    paymentMethod: varchar("payment_method", { length: 100 }),
    transactionId: varchar("transaction_id", { length: 255 }),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [index("pro_sub_user_idx").on(t.userId, t.userType)],
);

// ─── SEO Pages ───
export const seoPages = mysqlTable("seo_pages", {
  id: int("id").primaryKey().autoincrement(),
  path: varchar("path", { length: 255 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  keywords: text("keywords"),
  ogImage: varchar("og_image", { length: 500 }),
  canonicalUrl: varchar("canonical_url", { length: 500 }),
  updatedAt: datetime("updated_at").default(
    sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ),
});

// ─── System Settings ───
export const systemSettings = mysqlTable("system_settings", {
  key: varchar("key", { length: 100 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: datetime("updated_at").default(
    sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ),
});

// ─── User Profiles (Financial Context for AI) ───
export const userProfiles = mysqlTable(
  "user_profiles",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    monthlyIncome: decimal("monthly_income", { precision: 12, scale: 2 }),
    financialGoal: varchar("financial_goal", { length: 100 }), // saving | debt_payoff | investing | budgeting
    financialPersonality: varchar("financial_personality", { length: 50 }), // impulsive | conservative | balanced | stressed
    basicInfo: json("basic_info"),
    financialInfo: json("financial_info"),
    lifestyleInfo: json("lifestyle_info"),
    onboardingAnswers: json("onboarding_answers"),
    aiInferredAttributes: json("ai_inferred_attributes"),
    preferences: json("preferences"),
    avatarId: varchar("avatar_id", { length: 100 }),
    profileVersion: int("profile_version").default(2),
    lastAiRefreshAt: datetime("last_ai_refresh_at"),
    profileCompleted: boolean("profile_completed").default(false),
    lastAskedAt: datetime("last_asked_at"),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [uniqueIndex("profile_user_idx").on(t.userId, t.userType)],
);

// â”€â”€â”€ Profile Learning Events (AI Learning Audit Trail) â”€â”€â”€
export const profileLearningEvents = mysqlTable(
  "profile_learning_events",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(), // monthly_refresh | manual_refresh | report_generation
    source: varchar("source", { length: 100 }).notNull().default("backend"),
    previousAttributes: json("previous_attributes"),
    newAttributes: json("new_attributes"),
    metadata: json("metadata"),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("profile_learning_user_idx").on(t.userId, t.userType),
    index("profile_learning_event_idx").on(t.eventType),
  ],
);

// â”€â”€â”€ Monthly Behavior Snapshots â”€â”€â”€
export const monthlyBehaviorSnapshots = mysqlTable(
  "monthly_behavior_snapshots",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    month: varchar("month", { length: 7 }).notNull(),
    totalIncome: decimal("total_income", { precision: 12, scale: 2 }).default(
      "0.00",
    ),
    totalExpense: decimal("total_expense", { precision: 12, scale: 2 }).default(
      "0.00",
    ),
    netFlow: decimal("net_flow", { precision: 12, scale: 2 }).default("0.00"),
    topCategories: json("top_categories"),
    topSubCategories: json("top_sub_categories"),
    spendingByDay: json("spending_by_day"),
    spendingByWeekday: json("spending_by_weekday"),
    behaviorFlags: json("behavior_flags"),
    inferredAttributes: json("inferred_attributes"),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [
    uniqueIndex("behavior_snapshot_user_month_idx").on(
      t.userId,
      t.userType,
      t.month,
    ),
    index("behavior_snapshot_month_idx").on(t.month),
  ],
);

// ─── Onboarding Questions (Admin-controlled) ───
export const onboardingQuestions = mysqlTable("onboarding_questions", {
  id: int("id").primaryKey().autoincrement(),
  questionText: varchar("question_text", { length: 500 }).notNull(),
  questionKey: varchar("question_key", { length: 100 }).notNull().unique(), // monthly_income | financial_goal
  inputType: varchar("input_type", { length: 50 }).notNull().default("text"), // text | select | number
  options: json("options"), // for select type: ["توفير", "سداد ديون", ...]
  isActive: boolean("is_active").default(true),
  sortOrder: int("sort_order").default(0),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
});

// ─── User Personal Dictionary (AI Learning) ───
export const userDictionaries = mysqlTable(
  "user_dictionaries",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    word: varchar("word", { length: 100 }).notNull(),
    category: varchar("category", { length: 100 }).notNull(),
    subCategory: varchar("sub_category", { length: 100 }),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("user_dict_user_idx").on(t.userId, t.userType),
    uniqueIndex("user_dict_word_unique").on(t.userId, t.userType, t.word),
  ],
);

// ─── AI Classification Logs ───
export const classificationLogs = mysqlTable(
  "classification_logs",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    originalText: text("original_text").notNull(),
    normalizedText: text("normalized_text"),
    parsedBy: varchar("parsed_by", { length: 50 }).notNull(), // rule_engine | ai | hybrid | manual
    ruleEngineResult: json("rule_engine_result"),
    aiResult: json("ai_result"),
    finalResult: json("final_result"),
    confidence: int("confidence").default(0),
    decision: varchar("decision", { length: 50 }), // auto_save | review | clarify
    classificationVersion: varchar("classification_version", {
      length: 20,
    }).default("v2.1"),
    reasoningTraceLight: json("reasoning_trace_light"),
    ambiguityFlags: json("ambiguity_flags"),
    inputChannel: varchar("input_channel", { length: 20 }).default("text"),
    needsFollowup: boolean("needs_followup").default(false),
    wasCorrected: boolean("was_corrected").default(false),
    correction: json("correction"),
    modelUsed: varchar("model_used", { length: 100 }),
    tokensUsed: int("tokens_used").default(0),
    processingTimeMs: int("processing_time_ms").default(0),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("cls_log_user_idx").on(t.userId, t.userType),
    index("cls_log_parsed_idx").on(t.parsedBy),
    index("cls_log_date_idx").on(t.createdAt),
  ],
);

// ─── Voice Usage Tracking ───
export const voiceUsage = mysqlTable(
  "voice_usage",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    durationSeconds: int("duration_seconds").notNull(),
    month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
    source: varchar("source", { length: 50 }).default("gemini_stt"), // gemini_stt | browser_api
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("voice_user_month_idx").on(t.userId, t.userType, t.month)],
);

// ─── Webhook Tokens (For External Automations like Shortcuts) ───
export const webhookTokens = mysqlTable(
  "webhook_tokens",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    token: varchar("token", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 100 }).default("Default Token"),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("webhook_tokens_user_idx").on(t.userId, t.userType),
    index("webhook_tokens_token_idx").on(t.token),
  ],
);

// ─── Financial Goals (Free stub + Pro AI plans) ───
export const financialGoals = mysqlTable(
  "financial_goals",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    targetAmount: decimal("target_amount", { precision: 12, scale: 2 }),
    targetDate: datetime("target_date"),
    status: varchar("status", { length: 30 }).notNull().default("active"),
    aiPlan: json("ai_plan"),
    aiAlerts: json("ai_alerts"),
    lastAnalyzedAt: datetime("last_analyzed_at"),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [
    index("financial_goals_user_idx").on(t.userId, t.userType),
    index("financial_goals_status_idx").on(t.status),
  ],
);

// ─── Raw SMS Events (For Audit & Parsing Logs) ───
export const rawSmsEvents = mysqlTable(
  "raw_sms_events",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    message: text("message").notNull(),
    sender: varchar("sender", { length: 100 }),
    smsTimestamp: varchar("sms_timestamp", { length: 100 }),
    status: varchar("status", { length: 50 }).default("pending"), // pending | processed | ignored | error
    metadata: json("metadata"),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("raw_sms_user_idx").on(t.userId, t.userType),
    index("raw_sms_status_idx").on(t.status),
  ],
);

// ─── API Key Error Logs (Admin Monitoring) ───
export const apiKeyErrors = mysqlTable(
  "api_key_errors",
  {
    id: int("id").primaryKey().autoincrement(),
    provider: varchar("provider", { length: 50 }).notNull(), // gemini | groq | stt
    keyLabel: varchar("key_label", { length: 100 }).notNull(), // e.g. "gemini_api_key", "groq_api_key", "stt_api_key"
    errorType: varchar("error_type", { length: 100 }).notNull(), // invalid_key | quota_exceeded | insufficient_credit | network_error | rate_limited | unknown
    message: text("message").notNull(),
    httpStatus: int("http_status"), // e.g. 401, 429, 500
    userId: int("user_id"), // nullable: which user triggered it (null = system-level check)
    resolved: boolean("resolved").default(false),
    resolvedAt: datetime("resolved_at"),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("api_key_errors_provider_idx").on(t.provider),
    index("api_key_errors_type_idx").on(t.errorType),
    index("api_key_errors_resolved_idx").on(t.resolved),
    index("api_key_errors_date_idx").on(t.createdAt),
  ],
);

// ─── Web Push Subscriptions ───
export const pushSubscriptions = mysqlTable(
  "push_subscriptions",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: varchar("p256dh", { length: 255 }).notNull(),
    auth: varchar("auth", { length: 255 }).notNull(),
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("push_subs_user_idx").on(t.userId, t.userType)],
);
// ─── WebAuthn Credentials (Passkeys) ───
export const userCredentials = mysqlTable(
  "user_credentials",
  {
    id: varchar("id", { length: 255 }).primaryKey(), // Credential ID base64url encoded
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    publicKey: text("public_key").notNull(), // hex or base64url string
    counter: int("counter").notNull().default(0),
    deviceType: varchar("device_type", { length: 50 })
      .notNull()
      .default("singleDevice"), // singleDevice | multiDevice
    backedUp: boolean("backed_up").notNull().default(false),
    transports: varchar("transports", { length: 255 }), // e.g. "internal,usb,ble,nfc"
    createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
    lastUsedAt: datetime("last_used_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [index("credentials_user_idx").on(t.userId, t.userType)],
);

// ─── WebAuthn Challenges ───
export const authChallenges = mysqlTable("auth_challenges", {
  id: varchar("id", { length: 100 }).primaryKey(), // e.g. session id or unique uuid
  challenge: varchar("challenge", { length: 255 }).notNull(),
  userId: int("user_id"),
  userType: varchar("user_type", { length: 50 }),
  expiresAt: datetime("expires_at").notNull(),
});
