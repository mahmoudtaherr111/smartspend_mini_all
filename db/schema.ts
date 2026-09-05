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
  date,
  customType,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const binary32 = customType<{ data: string; driverData: Buffer }>({
  dataType() {
    return "binary(32)";
  },
  toDriver(val: string): Buffer {
    return Buffer.from(val, "hex");
  },
  fromDriver(val: unknown): string {
    if (Buffer.isBuffer(val)) {
      return val.toString("hex");
    }
    return String(val);
  },
});

// ─── Users (OAuth) ───
export const users = mysqlTable(
  "users",
  {
    id: int("id").primaryKey().autoincrement(),
    unionId: varchar("union_id", { length: 255 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }).unique(),
    avatar: varchar("avatar", { length: 500 }),
    role: varchar("role", { length: 50 }).notNull().default("user"), // user | moderator | admin
    plan: varchar("plan", { length: 50 }).notNull().default("free"), // free | pro | ultra
    referralCode: varchar("referral_code", { length: 50 }).unique(),
    referredBy: int("referred_by"),
    referredByType: varchar("referred_by_type", { length: 50 }), // oauth | local; keeps polymorphic referral unambiguous
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
    index("users_referred_by_idx").on(t.referredBy),
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
    referredByType: varchar("referred_by_type", { length: 50 }), // oauth | local; keeps polymorphic referral unambiguous
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
    index("local_users_referred_by_idx").on(t.referredBy),
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
    // Canonical entity and decision-trace links.  Text remains a display/input
    // artifact; reporting and learning must use stable ids instead.
    contactId: int("contact_id"),
    classificationLogId: int("classification_log_id"),
    businessId: int("business_id"), // null = personal, non-null = business expense
    walletId: int("wallet_id"), // FK to userWallets — replaces LIKE-based wallet matching
    clientRequestId: varchar("client_request_id", { length: 64 }), // Idempotency key for retry safety
    date: datetime("date").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("confirmed"), // confirmed | pending_clarification
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [
    index("expenses_date_idx").on(t.date),
    index("expenses_user_date_idx").on(t.userId, t.userType, t.date),
    index("expenses_type_idx").on(t.type),
    index("expenses_category_idx").on(t.category),
    index("expenses_status_idx").on(t.status),
    index("expenses_business_idx").on(t.businessId),
    index("expenses_contact_idx").on(t.contactId),
    index("expenses_classification_log_idx").on(t.classificationLogId),
    index("expenses_wallet_idx").on(t.walletId),
    uniqueIndex("expenses_user_client_request_unique").on(
      t.userId,
      t.userType,
      t.clientRequestId,
    ),
    index("expenses_covering_rollup_idx").on(
      t.userId,
      t.userType,
      t.businessId,
      t.date,
      t.type,
      t.category,
      t.subCategory,
      t.amount,
    ),
  ],
);

// ─── User Businesses (Business Mode) ───
export const userBusinesses = mysqlTable(
  "user_businesses",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    type: varchar("type", { length: 100 }).notNull(),
    typeLabel: varchar("type_label", { length: 255 }),
    description: text("description"),
    keywords: json("keywords"),
    isActive: boolean("is_active").default(true),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [
    index("business_user_idx").on(t.userId, t.userType),
    index("business_active_idx").on(t.isActive),
  ],
);

// ─── Business Categories (Custom categories per business) ───
export const businessCategories = mysqlTable(
  "business_categories",
  {
    id: int("id").primaryKey().autoincrement(),
    businessId: int("business_id").notNull(),
    name: varchar("name", { length: 100 }).notNull(),
    nameAr: varchar("name_ar", { length: 100 }).notNull(),
    icon: varchar("icon", { length: 50 }).default("🛍️"),
    color: varchar("color", { length: 50 }).default("#3b82f6"),
    type: varchar("type", { length: 20 }).notNull().default("expense"),
    keywords: json("keywords"),
    matchExamples: json("match_examples"),
    isAutoGenerated: boolean("is_auto_generated").default(true),
    isActive: boolean("is_active").default(true),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("business_cat_active_idx").on(t.businessId, t.isActive),
  ],
);

// ─── User Contacts (For Entity Extraction + People Hub) ───
export const userContacts = mysqlTable(
  "user_contacts",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    relation: varchar("relation", { length: 100 }),
    aliases: json("aliases"),
    contactType: varchar("contact_type", { length: 30 }).notNull().default("personal"),
    businessId: int("business_id"),
    isSilenced: boolean("is_silenced").default(false),
    transactionCount: int("transaction_count").default(0),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [
    index("contacts_user_idx").on(t.userId, t.userType),
    index("contacts_name_idx").on(t.name),
    index("contacts_type_idx").on(t.contactType),
    index("contacts_business_idx").on(t.businessId),
    index("contacts_silenced_idx").on(t.isSilenced),
  ],
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
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("clarifications_user_idx").on(t.userId, t.userType),
    index("clarifications_status_idx").on(t.status),
    index("clarifications_expense_idx").on(t.expenseId),
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
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
},
(t) => [
  index("categories_user_idx").on(t.userId, t.userType)
]);

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
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").default(
    sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
  ),
},
(t) => [
  index("reports_month_idx").on(t.month),
  uniqueIndex("reports_user_month_unique").on(t.userId, t.userType, t.month),
]);

// ─── Sessions ───
export const sessions = mysqlTable(
  "sessions",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    token: varchar("token", { length: 500 }),
    tokenHash: binary32("token_hash"),
    ipAddress: varchar("ip_address", { length: 100 }),
    userAgent: text("user_agent"),
    expiresAt: datetime("expires_at").notNull(),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("sessions_user_idx").on(t.userId, t.userType),
    index("sessions_token_idx").on(t.token),
    uniqueIndex("sessions_token_hash_idx").on(t.tokenHash),
    index("sessions_expires_idx").on(t.expiresAt),
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
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
},
(t) => [
  index("discount_codes_creator_idx").on(t.createdBy)
]);

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
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
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
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
},
(t) => [
  index("ads_creator_idx").on(t.createdBy),
  index("ads_active_idx").on(t.isActive)
]);

// ─── Ad Clicks ───
export const adClicks = mysqlTable("ad_clicks", {
  id: int("id").primaryKey().autoincrement(),
  adId: int("ad_id").notNull(),
  userId: int("user_id"),
  userType: varchar("user_type", { length: 50 }),
  ipAddress: varchar("ip_address", { length: 100 }),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
},
(t) => [
  index("ad_clicks_ad_idx").on(t.adId),
  index("ad_clicks_user_idx").on(t.userId, t.userType)
]);

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
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex("referral_unique_idx").on(
      t.referrerId,
      t.referrerType,
      t.referredId,
      t.referredType,
    ),
    uniqueIndex("referral_referred_unique_idx").on(t.referredId, t.referredType),
  ],
);

// ─── Pro Subscriptions ───
export const proSubscriptions = mysqlTable(
  "pro_subscriptions",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    plan: varchar("plan", { length: 50 }).notNull().default("pro_monthly"), // pro_monthly | pro_yearly | ultra_monthly
    status: varchar("status", { length: 50 }).notNull().default("active"), // active | cancelled | expired
    autoRenew: boolean("auto_renew").notNull().default(true),
    startDate: datetime("start_date").notNull(),
    endDate: datetime("end_date").notNull(),
    paymentMethod: varchar("payment_method", { length: 100 }),
    transactionId: varchar("transaction_id", { length: 255 }),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [
    index("pro_sub_user_idx").on(t.userId, t.userType),
    uniqueIndex("pro_sub_transaction_unique_idx").on(t.transactionId),
  ],
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
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
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
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [uniqueIndex("profile_user_idx").on(t.userId, t.userType)],
);

// ─── Profile Learning Events (AI Learning Audit Trail) ───
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
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("profile_learning_user_idx").on(t.userId, t.userType),
    index("profile_learning_event_idx").on(t.eventType),
  ],
);

// ─── Monthly Behavior Snapshots ───
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
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
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
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("webhook_tokens_user_idx").on(t.userId, t.userType),
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
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [
    index("financial_goals_user_idx").on(t.userId, t.userType),
    index("financial_goals_status_idx").on(t.status),
  ],
);

export const userBudgets = mysqlTable(
  "user_budgets",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    category: varchar("category", { length: 100 }),
    monthlyLimit: decimal("monthly_limit", { precision: 12, scale: 2 }).notNull(),
    periodStartDay: int("period_start_day").notNull().default(1),
    linkedGoalId: int("linked_goal_id"),
    status: varchar("status", { length: 30 }).notNull().default("active"),
    alertThresholdPercent: int("alert_threshold_percent").notNull().default(80),
    metadata: json("metadata"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [
    index("user_budgets_user_idx").on(t.userId, t.userType, t.status),
    index("user_budgets_category_idx").on(t.category),
    index("user_budgets_goal_idx").on(t.linkedGoalId),
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
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("raw_sms_user_idx").on(t.userId, t.userType),
    index("raw_sms_status_idx").on(t.status),
  ],
);

// ─── WhatsApp OTP Codes ───
export const whatsappOtpCodes = mysqlTable(
  "whatsapp_otp_codes",
  {
    id: int("id").primaryKey().autoincrement(),
    phone: varchar("phone", { length: 20 }).notNull(),
    code: varchar("code", { length: 20 }).notNull(),
    verified: boolean("verified").notNull().default(false),
    expiresAt: datetime("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("whatsapp_otp_phone_idx").on(t.phone),
  ]
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
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("api_key_errors_provider_idx").on(t.provider),
    index("api_key_errors_type_idx").on(t.errorType),
    index("api_key_errors_resolved_idx").on(t.resolved),
    index("api_key_errors_date_idx").on(t.createdAt),
    index("api_key_errors_user_idx").on(t.userId),
  ],
);

// ─── Web Push Subscriptions ───
export const pushSubscriptions = mysqlTable(
  "push_subscriptions",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    endpoint: text("endpoint"), // Nullable for FCM
    p256dh: varchar("p256dh", { length: 255 }), // Nullable for FCM
    auth: varchar("auth", { length: 255 }), // Nullable for FCM
    fcmToken: text("fcm_token"), // For Firebase Cloud Messaging tokens
    deviceType: varchar("device_type", { length: 50 }).default("web"), // web | ios | android
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
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
},
(t) => [
  index("auth_challenges_user_idx").on(t.userId, t.userType)
]);

// ─── Notification Templates (Smart Engine) ───
export const notificationTemplates = mysqlTable("notification_templates", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  eventType: varchar("event_type", { length: 100 }).notNull(), // manual_scheduled | budget_exceeded | inactivity_reminder | usage_milestone
  titleTemplate: varchar("title_template", { length: 255 }), // Legacy
  bodyTemplate: text("body_template"), // Legacy
  titleTemplateAr: varchar("title_template_ar", { length: 255 }), // Arabic title
  bodyTemplateAr: text("body_template_ar"), // Arabic body
  titleTemplateEn: varchar("title_template_en", { length: 255 }), // English title
  bodyTemplateEn: text("body_template_en"), // English body
  isActive: boolean("is_active").default(true),
  targetSegment: json("target_segment"), // e.g. { "plan": "free", "minUsage": 10 }
  sendAt: datetime("send_at"), // for scheduled ones
  createdBy: int("created_by"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
},
(t) => [
  index("notif_templates_creator_idx").on(t.createdBy),
  index("notif_templates_event_idx").on(t.eventType)
]);

// ─── In-App Notifications (The Bell) ───
export const inAppNotifications = mysqlTable(
  "in_app_notifications",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    actionUrl: varchar("action_url", { length: 500 }),
    isRead: boolean("is_read").default(false),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("in_app_notif_user_idx").on(t.userId, t.userType),
    index("in_app_notif_read_idx").on(t.isRead),
  ]
);

// ─── Notification Logs ───
export const notificationLogs = mysqlTable(
  "notification_logs",
  {
    id: int("id").primaryKey().autoincrement(),
    templateId: int("template_id"),
    userId: int("user_id"),
    userType: varchar("user_type", { length: 50 }),
    sentVia: varchar("sent_via", { length: 50 }), // push | in_app | whatsapp
    status: varchar("status", { length: 50 }).default("sent"), // sent | failed
    errorMessage: text("error_message"),
    sentAt: datetime("sent_at").default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("notif_logs_user_idx").on(t.userId, t.userType),
    index("notif_logs_template_idx").on(t.templateId),
  ]
);

// ─── AI Chat Conversations ───
export const chatConversations = mysqlTable(
  "chat_conversations",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    title: varchar("title", { length: 255 }),
    messageCount: int("message_count").default(0),
    totalTokens: int("total_tokens").default(0),
    lastMessageAt: datetime("last_message_at"),
    metadata: json("metadata"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("chat_conv_user_idx").on(t.userId, t.userType),
    index("chat_conv_last_msg_idx").on(t.lastMessageAt),
  ]
);

// ─── AI Chat Messages ───
export const chatMessages = mysqlTable(
  "chat_messages",
  {
    id: int("id").primaryKey().autoincrement(),
    conversationId: int("conversation_id").notNull(),
    role: varchar("role", { length: 20 }).notNull(), // user | assistant | system | tool
    content: text("content").notNull(),
    toolCalls: json("tool_calls"),
    toolResults: json("tool_results"),
    tokensUsed: int("tokens_used").default(0),
    model: varchar("model", { length: 100 }),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("chat_msg_created_idx").on(t.conversationId, t.createdAt),
  ]
);

// AI Memory Layer
export const aiConversationSummaries = mysqlTable(
  "ai_conversation_summaries",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    conversationId: int("conversation_id").notNull(),
    capsule: varchar("capsule", { length: 500 }).notNull(),
    runningSummary: text("running_summary"),
    messageCount: int("message_count").default(0),
    source: varchar("source", { length: 50 }).notNull().default("chat"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [
    uniqueIndex("ai_conv_summary_unique_idx").on(t.conversationId),
    index("ai_conv_summary_user_idx").on(t.userId, t.userType),
    index("ai_conv_summary_updated_idx").on(t.updatedAt),
  ],
);

export const aiMemoryItems = mysqlTable(
  "ai_memory_items",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    memoryType: varchar("memory_type", { length: 50 }).notNull().default("fact"),
    content: text("content").notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    importance: int("importance").notNull().default(50),
    sourceConversationId: int("source_conversation_id"),
    sourceMessageId: int("source_message_id"),
    status: varchar("status", { length: 30 }).notNull().default("active"),
    metadata: json("metadata"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [
    index("ai_memory_user_idx").on(t.userId, t.userType, t.status),
    uniqueIndex("ai_memory_hash_unique_idx").on(t.userId, t.userType, t.contentHash),
    index("ai_memory_type_idx").on(t.memoryType),
    index("ai_memory_updated_idx").on(t.updatedAt),
    index("ai_memory_source_conv_idx").on(t.sourceConversationId),
    index("ai_memory_source_msg_idx").on(t.sourceMessageId),
  ],
);

export const aiMemoryEmbeddings = mysqlTable(
  "ai_memory_embeddings",
  {
    id: int("id").primaryKey().autoincrement(),
    memoryItemId: int("memory_item_id").notNull(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    provider: varchar("provider", { length: 50 }).notNull().default("fireworks"),
    model: varchar("model", { length: 200 }).notNull(),
    dimensions: int("dimensions").notNull(),
    vectorHash: varchar("vector_hash", { length: 64 }),
    vector: json("vector"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("ai_memory_embedding_user_idx").on(t.userId, t.userType),
    uniqueIndex("ai_memory_embedding_unique_idx").on(
      t.memoryItemId,
      t.provider,
      t.model,
      t.dimensions,
    ),
  ],
);

export const aiActionMemory = mysqlTable(
  "ai_action_memory",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    actionName: varchar("action_name", { length: 120 }).notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    summary: varchar("summary", { length: 500 }).notNull(),
    payload: json("payload"),
    sourceConversationId: int("source_conversation_id"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [
    index("ai_action_memory_user_idx").on(t.userId, t.userType),
    index("ai_action_memory_action_idx").on(t.actionName, t.status),
    index("ai_action_memory_updated_idx").on(t.updatedAt),
    index("ai_action_memory_conv_idx").on(t.sourceConversationId),
  ],
);

export const aiPendingActions = mysqlTable(
  "ai_pending_actions",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    conversationId: int("conversation_id"),
    actionName: varchar("action_name", { length: 120 }).notNull(),
    status: varchar("status", { length: 40 }).notNull().default("pending_confirmation"),
    risk: varchar("risk", { length: 30 }).notNull().default("medium"),
    summary: varchar("summary", { length: 500 }).notNull(),
    payload: json("payload").notNull(),
    result: json("result"),
    expiresAt: datetime("expires_at").notNull(),
    confirmedAt: datetime("confirmed_at"),
    executedAt: datetime("executed_at"),
    cancelledAt: datetime("cancelled_at"),
    idempotencyKey: varchar("idempotency_key", { length: 255 }),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [
    index("ai_pending_action_user_idx").on(t.userId, t.userType, t.status),
    index("ai_pending_action_expiry_idx").on(t.expiresAt),
    index("ai_pending_action_conversation_idx").on(t.conversationId),
    index("ai_pending_action_idempotency_idx").on(t.idempotencyKey),
  ],
);

export const aiActionAuditLogs = mysqlTable(
  "ai_action_audit_logs",
  {
    id: int("id").primaryKey().autoincrement(),
    actionId: int("action_id"),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    actionName: varchar("action_name", { length: 120 }).notNull(),
    event: varchar("event", { length: 80 }).notNull(),
    status: varchar("status", { length: 40 }).notNull(),
    metadata: json("metadata"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("ai_action_audit_action_idx").on(t.actionId),
    index("ai_action_audit_user_idx").on(t.userId, t.userType),
    index("ai_action_audit_event_idx").on(t.event),
  ],
);

// ─── Dynamic AI Providers ───
export const aiProviders = mysqlTable(
  "ai_providers",
  {
    id: int("id").primaryKey().autoincrement(),
    slug: varchar("slug", { length: 50 }).notNull().unique(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    protocol: varchar("protocol", { length: 30 }).notNull().default("openai"), // openai | gemini | anthropic
    baseUrl: varchar("base_url", { length: 500 }).notNull(),
    apiKeyEncrypted: text("api_key_encrypted").notNull(),
    supportsModelDiscovery: boolean("supports_model_discovery").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    priority: int("priority").notNull().default(10), // Lower = higher priority in failover
    healthStatus: varchar("health_status", { length: 20 }).notNull().default("unknown"),
    lastHealthCheck: datetime("last_health_check"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [
    index("ai_providers_active_idx").on(t.isActive, t.priority),
    index("ai_providers_slug_idx").on(t.slug),
  ],
);

// ─── Dynamic AI Models ───
export const aiModels = mysqlTable(
  "ai_models",
  {
    id: int("id").primaryKey().autoincrement(),
    providerId: int("provider_id").notNull(),
    modelId: varchar("model_id", { length: 200 }).notNull(),
    displayName: varchar("display_name", { length: 200 }).notNull(),
    descriptionAr: text("description_ar"),
    purposes: json("purposes").notNull(), // string[]: ["chat", "classification", "ocr", "voice_stt", "report", "goal"]
    allowedTiers: json("allowed_tiers").notNull(), // string[]: ["free", "pro", "ultra"]
    isDefaultForPurpose: boolean("is_default_for_purpose").notNull().default(false),
    inputPricePer1M: decimal("input_price_per_1m", { precision: 10, scale: 6 }).notNull().default("0.140000"),
    outputPricePer1M: decimal("output_price_per_1m", { precision: 10, scale: 6 }).notNull().default("0.560000"),
    cachedPricePer1M: decimal("cached_price_per_1m", { precision: 10, scale: 6 }).notNull().default("0.014000"),
    maxContextTokens: int("max_context_tokens").notNull().default(128000),
    supportsVision: boolean("supports_vision").notNull().default(false),
    supportsReasoning: boolean("supports_reasoning").notNull().default(false),
    supportsFunctionCalling: boolean("supports_function_calling").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("ai_models_provider_idx").on(t.providerId),
    index("ai_models_active_idx").on(t.isActive),
    uniqueIndex("ai_models_provider_model_idx").on(t.providerId, t.modelId),
  ],
);

// ─── Immutable AI Token Ledgers ───
export const aiTokenLedgers = mysqlTable(
  "ai_token_ledgers",
  {
    id: int("id").primaryKey().autoincrement(),
    traceId: varchar("trace_id", { length: 64 }).notNull().unique(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 20 }).notNull(),
    billingPeriod: varchar("billing_period", { length: 7 }).notNull(), // "YYYY-MM"
    channel: varchar("channel", { length: 30 }).notNull(),
    providerId: int("provider_id"),
    providerSlug: varchar("provider_slug", { length: 50 }).notNull(),
    modelId: varchar("model_id", { length: 200 }).notNull(),
    promptTokens: int("prompt_tokens").notNull().default(0),
    completionTokens: int("completion_tokens").notNull().default(0),
    cachedTokens: int("cached_tokens").notNull().default(0),
    reasoningTokens: int("reasoning_tokens").notNull().default(0),
    totalTokens: int("total_tokens").notNull().default(0),
    systemPromptTokens: int("system_prompt_tokens").notNull().default(0),
    memoryRagTokens: int("memory_rag_tokens").notNull().default(0),
    historyTokens: int("history_tokens").notNull().default(0),
    userInputTokens: int("user_input_tokens").notNull().default(0),
    toolSchemaTokens: int("tool_schema_tokens").notNull().default(0),
    costUsd: decimal("cost_usd", { precision: 12, scale: 8 }).notNull().default("0.00000000"),
    costEgp: decimal("cost_egp", { precision: 12, scale: 6 }).notNull().default("0.000000"),
    latencyMs: int("latency_ms").notNull().default(0),
    httpStatus: int("http_status").notNull().default(200),
    finishReason: varchar("finish_reason", { length: 30 }).default("stop"),
    conversationId: int("conversation_id"),
    classificationLogId: int("classification_log_id"),
    metadata: json("metadata"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("idx_ledger_user_period").on(t.userId, t.userType, t.billingPeriod),
    index("idx_ledger_channel").on(t.channel, t.createdAt),
    index("idx_ledger_provider").on(t.providerSlug, t.modelId, t.createdAt),
    index("idx_ledger_created").on(t.createdAt),
  ],
);

// ─── User Correction Rules ───
//
// What the user explicitly told us the answer is.
//
// Muscle memory learns from AGGREGATE history and excludes corrected rows outright
// (`wasCorrected` was a skip condition), which inverted the value of the signal: the one
// case where the user handed us the right answer was the one case we refused to learn
// from. It also required two occurrences and an `auto_save` decision, so after
// calibration moved most items to review, it was being starved as well.
//
// A correction is different in kind from a pattern, so it is stored differently:
// explicit rather than inferred, keyed on the SEGMENT so one fix applies inside every
// future narrative, effective on the FIRST occurrence, and bounded by an amount band so
// "coffee 35" cannot answer for "coffee 3500".
export const userCorrectionRules = mysqlTable(
  "user_correction_rules",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(), // oauth | local
    /** Normalized token signature of the corrected segment, not the whole message. */
    pattern: varchar("pattern", { length: 255 }).notNull(),
    /** Arabic display name, matching the storage convention of `expenses.category`. */
    category: varchar("category", { length: 100 }).notNull(),
    subCategory: varchar("sub_category", { length: 100 }).notNull().default("عام"),
    type: varchar("type", { length: 20 }).notNull(), // income | expense | transfer | investment
    /**
     * The order of magnitude the correction was made at. A rule learned at 35 EGP is
     * evidence about coffee, not about a 3500 EGP payment that happens to mention it.
     */
    amountMin: decimal("amount_min", { precision: 12, scale: 2 }),
    amountMax: decimal("amount_max", { precision: 12, scale: 2 }),
    timesApplied: int("times_applied").notNull().default(0),
    /** Corrected again after this rule fired. Two strikes and the rule retires itself. */
    timesOverridden: int("times_overridden").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    sourceLogId: int("source_log_id"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [
    uniqueIndex("ucr_user_pattern_uq").on(t.userId, t.userType, t.pattern),
    index("ucr_user_active_idx").on(t.userId, t.userType, t.isActive),
  ],
);

// ─── Expense Details (Side Table for Hot Table Diet - §3.9) ───
export const expenseDetails = mysqlTable(
  "expense_details",
  {
    expenseId: int("expense_id").primaryKey(),
    rawText: text("raw_text"),
    parsedMetadata: json("parsed_metadata"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
);

// ─── Expense Daily Rollups (Day-grain Aggregates - §3.2) ───
export const expenseDailyRollups = mysqlTable(
  "expense_daily_rollups",
  {
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    businessId: int("business_id").notNull().default(0),
    day: date("day", { mode: "string" }).notNull(),
    income: decimal("income", { precision: 14, scale: 2 }).notNull().default("0.00"),
    expense: decimal("expense", { precision: 14, scale: 2 }).notNull().default("0.00"),
    transfer: decimal("transfer", { precision: 14, scale: 2 }).notNull().default("0.00"),
    investment: decimal("investment", { precision: 14, scale: 2 }).notNull().default("0.00"),
    automatedIncome: decimal("automated_income", { precision: 14, scale: 2 }).notNull().default("0.00"),
    automatedExpense: decimal("automated_expense", { precision: 14, scale: 2 }).notNull().default("0.00"),
    txnCount: int("txn_count").notNull().default(0),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex("expense_daily_rollups_user_day_idx").on(
      t.userId,
      t.userType,
      t.businessId,
      t.day,
    ),
    index("expense_daily_rollups_day_idx").on(t.day),
  ],
);

// ─── AI Cost Monthly Rollup (§3.7) ───
export const aiCostMonthly = mysqlTable(
  "ai_cost_monthly",
  {
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    billingPeriod: varchar("billing_period", { length: 7 }).notNull(), // "YYYY-MM"
    providerSlug: varchar("provider_slug", { length: 50 }).notNull(),
    modelId: varchar("model_id", { length: 200 }).notNull(),
    totalTokens: int("total_tokens").notNull().default(0),
    promptTokens: int("prompt_tokens").notNull().default(0),
    completionTokens: int("completion_tokens").notNull().default(0),
    costUsd: decimal("cost_usd", { precision: 12, scale: 8 }).notNull().default("0.00000000"),
    costEgp: decimal("cost_egp", { precision: 12, scale: 6 }).notNull().default("0.000000"),
    callCount: int("call_count").notNull().default(0),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex("ai_cost_monthly_idx").on(
      t.userId,
      t.userType,
      t.billingPeriod,
      t.providerSlug,
      t.modelId,
    ),
  ],
);

// ─── Ad Stats Daily Rollup (§3.7) ───
export const adStatsDaily = mysqlTable(
  "ad_stats_daily",
  {
    adId: int("ad_id").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    clicks: int("clicks").notNull().default(0),
    impressions: int("impressions").notNull().default(0),
    updatedAt: timestamp("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex("ad_stats_daily_idx").on(t.adId, t.day),
  ],
);

