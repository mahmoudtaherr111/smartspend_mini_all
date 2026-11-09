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
    /**
     * When the balance was last given, and by what: "user" (typed on the wallet screen), "assistant" (a confirmed
     * chat or call action). Null for balances saved before this was kept: their age is unknown, never assumed.
     */
    balanceObservedAt: datetime("balance_observed_at"),
    balanceSource: varchar("balance_source", { length: 30 }),
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
    tokenHash: varchar("token_hash", { length: 64 }),
    ipAddress: varchar("ip_address", { length: 100 }),
    userAgent: text("user_agent"),
    expiresAt: datetime("expires_at").notNull(),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("sessions_user_idx").on(t.userId, t.userType),
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

/**
 * Who on the team handles a ticket: the staff member's id with its account type, since a Google and a phone account
 * can share an id (`support_tickets.assigned_to` holds an id alone and is not used). Kept apart from the ticket so
 * that reading or writing tickets never depends on this table existing.
 */
export const supportAssignments = mysqlTable(
  "support_assignments",
  {
    ticketId: int("ticket_id").primaryKey(),
    staffId: int("staff_id").notNull(),
    staffType: varchar("staff_type", { length: 50 }).notNull(),
    assignedAt: datetime("assigned_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [index("support_assignments_staff_idx").on(t.staffId, t.staffType)],
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
  platformTarget: varchar("platform_target", { length: 50 }).notNull().default("all"), // all | android | ios | web
  frequencyCapPerDay: int("frequency_cap_per_day").notNull().default(0), // 0 = unlimited
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

// ─── Ad Impressions (ADS-02, BUG-06) ───
export const adImpressions = mysqlTable(
  "ad_impressions",
  {
    id: int("id").primaryKey().autoincrement(),
    adId: int("ad_id").notNull(),
    userId: int("user_id"),
    userType: varchar("user_type", { length: 50 }),
    placement: varchar("placement", { length: 100 }).notNull(),
    impressionToken: varchar("impression_token", { length: 128 }).notNull(),
    ipAddress: varchar("ip_address", { length: 100 }),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex("ad_impressions_token_idx").on(t.impressionToken),
    index("ad_impressions_user_idx").on(t.userId, t.userType),
    index("ad_impressions_ad_user_idx").on(t.adId, t.userId, t.createdAt),
  ],
);

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

// ─── Store Purchases (Google Play & Apple App Store) ───
export const storePurchases = mysqlTable(
  "store_purchases",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    store: varchar("store", { length: 50 }).notNull(),
    storeProductId: varchar("store_product_id", { length: 100 }).notNull(),
    originalTransactionId: varchar("original_transaction_id", { length: 255 }).notNull(),
    purchaseToken: text("purchase_token").notNull(),
    status: varchar("status", { length: 50 }).notNull().default("active"),
    expiresAt: datetime("expires_at"),
    lastEventAt: datetime("last_event_at", { fsp: 3 }),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(
      sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
    ),
  },
  (t) => [
    uniqueIndex("store_purchases_store_key_idx").on(t.store, t.originalTransactionId),
    index("store_purchases_user_idx").on(t.userId, t.userType),
    index("store_purchases_expiry_idx").on(t.status, t.expiresAt),
  ],
);

// Every store event once, so a replay cannot change a subscription twice.
export const storeEvents = mysqlTable(
  "store_events",
  {
    id: int("id").primaryKey().autoincrement(),
    store: varchar("store", { length: 50 }).notNull(),
    eventId: varchar("event_id", { length: 191 }).notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    purchaseKey: varchar("purchase_key", { length: 255 }).notNull(),
    eventTime: datetime("event_time", { fsp: 3 }).notNull(),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex("store_events_event_idx").on(t.store, t.eventId),
    index("store_events_created_idx").on(t.createdAt),
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

/**
 * An installment plan the user follows ("قسط الموبايل فاليو 800 × 12"). The plan holds the
 * terms; payments are the user's own expenses in أقساط وفوايد whose text names the plan,
 * counted after it was added, plus the ones already paid before that.
 */
export const installmentPlans = mysqlTable(
  "installment_plans",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    /** Word matched in a payment's description or subcategory: فاليو, الموبايل, العربية. */
    keyword: varchar("keyword", { length: 60 }).notNull(),
    monthlyAmount: decimal("monthly_amount", { precision: 12, scale: 2 }).notNull(),
    totalInstallments: int("total_installments").notNull(),
    paidBefore: int("paid_before").notNull().default(0),
    status: varchar("status", { length: 30 }).notNull().default("active"),
    /** The commitment this plan became (docs/decisions/0051-commitments-ecosystem.md); the plan is kept for old apps. */
    cashflowId: int("cashflow_id"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [index("installment_plans_user_idx").on(t.userId, t.userType, t.status)],
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

/**
 * Money the user expects to pay or receive on a schedule: rent, a subscription, school fees, an installment, a debt
 * repayment, a gam3eya turn, a salary or freelance income. It is a promise about the future, never a ledger row:
 * what was actually paid stays in `expenses`, linked to a due date through `cashflow_settlements`, so nothing is
 * counted twice. An unknown amount or date stays null ("مش معروف"), never guessed.
 */
export const scheduledCashflows = mysqlTable(
  "scheduled_cashflows",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    /** Null: the personal ledger. A business's own commitments carry its id. */
    businessId: int("business_id"),
    /** rent | bill | subscription | school | installment | debt | gam3eya | salary | freelance | other */
    kind: varchar("kind", { length: 30 }).notNull(),
    /** out: the user pays; in: the user receives. */
    direction: varchar("direction", { length: 10 }).notNull(),
    title: varchar("title", { length: 120 }).notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }),
    /** once | weekly | monthly | yearly */
    recurrence: varchar("recurrence", { length: 10 }).notNull(),
    /** Cairo day key of the first (or only) due date; null when the user does not know it. */
    startDay: date("start_day", { mode: "string" }),
    endDay: date("end_day", { mode: "string" }),
    /** confirmed: the user stated it; estimated: a guess or an income that varies. */
    certainty: varchar("certainty", { length: 12 }).notNull().default("confirmed"),
    /** user | voice | chat */
    source: varchar("source", { length: 20 }).notNull().default("user"),
    /** The installment plan this schedule belongs to, so a plan is never a second, separate commitment. */
    installmentPlanId: int("installment_plan_id"),
    contactId: int("contact_id"),
    /**
     * The logic of the commitment (docs/decisions/0051-commitments-ecosystem.md): fixed (equal installments, a count),
     * schedule (dated payments of their own amounts: school, an apartment), recurring (open-ended: rent, bills, salary),
     * balance (a debt with a person) or gam3eya (contributions, then one payout). Null on rows from before: recurring.
     */
    shape: varchar("shape", { length: 12 }),
    /** Who is paid or who collects: valU, a bank, a shop, a school. A person is `contactId`. */
    provider: varchar("provider", { length: 80 }),
    /** A known subscription from `subscription_catalog` (netflix, shahid): its logo, names and match tokens. */
    catalogSlug: varchar("catalog_slug", { length: 60 }),
    /** Whom it is for: the child a school fee is for. */
    beneficiaryContactId: int("beneficiary_contact_id"),
    /** Every how many recurrence units (3 monthly = quarterly). */
    intervalCount: int("interval_count").notNull().default(1),
    /** Fixed: the number of installments in all; gam3eya: the months. Null: open-ended. */
    occurrenceCount: int("occurrence_count"),
    /** Fixed: installments paid before `startDay`, the first one still owed. */
    paidBeforeCount: int("paid_before_count").notNull().default(0),
    /** Balance: what the debt is in all; null for the other shapes. */
    totalAmount: decimal("total_amount", { precision: 12, scale: 2 }),
    /** The amount changes from time to time (bills): a due date's amount is an estimate. */
    amountVaries: boolean("amount_varies").notNull().default(false),
    /** cash | app | auto_debit | salary | card: how it is usually paid. */
    paymentMethod: varchar("payment_method", { length: 20 }),
    /** Gam3eya: the user's turn, 1-based. */
    gam3eyaTurn: int("gam3eya_turn"),
    /** A gam3eya's payout (direction in) belongs to its contributions' row; null otherwise. */
    parentId: int("parent_id"),
    /** Where a linked payment is filed when the user did not say; null: the shape's default. */
    category: varchar("category", { length: 100 }),
    subCategory: varchar("sub_category", { length: 100 }),
    /** Balance: the ledger row the debt began with ("سلفت فريدة 1000"). */
    originExpenseId: int("origin_expense_id"),
    /** Days before a due date to remind; null: the admin's default for the shape. */
    remindDaysBefore: int("remind_days_before"),
    /** Hour of the day, Cairo time; null: the admin's default. */
    remindHour: int("remind_hour"),
    remindersEnabled: boolean("reminders_enabled").notNull().default(true),
    /** active | paused | ended */
    status: varchar("status", { length: 20 }).notNull().default("active"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("scheduled_cashflows_user_idx").on(t.userId, t.userType, t.status),
    uniqueIndex("scheduled_cashflows_plan_unique").on(t.userId, t.userType, t.installmentPlanId),
  ],
);

/** The dated payments of a schedule-shaped commitment (a school's three installments, an apartment's plan). */
export const commitmentScheduleItems = mysqlTable(
  "commitment_schedule_items",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    cashflowId: int("cashflow_id").notNull(),
    dueDay: date("due_day", { mode: "string" }).notNull(),
    amount: decimal("amount", { precision: 12, scale: 2 }),
    /** "مقدم", "وديعة صيانة", "الباص". */
    label: varchar("label", { length: 80 }),
  },
  (t) => [
    index("commitment_schedule_items_user_idx").on(t.userId, t.userType, t.cashflowId),
    uniqueIndex("commitment_schedule_items_day_unique").on(t.cashflowId, t.dueDay),
  ],
);

/**
 * One due date changed by the user: skipped ("اتلغت المرة دي"), moved to another day, or another amount this time.
 * Keyed by the date the schedule computes, so the rule and its exceptions stay apart (like a calendar's exceptions).
 */
export const commitmentOverrides = mysqlTable(
  "commitment_overrides",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    cashflowId: int("cashflow_id").notNull(),
    dueDay: date("due_day", { mode: "string" }).notNull(),
    /** skip | move | amount */
    action: varchar("action", { length: 10 }).notNull(),
    newDay: date("new_day", { mode: "string" }),
    amount: decimal("amount", { precision: 12, scale: 2 }),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("commitment_overrides_user_idx").on(t.userId, t.userType, t.cashflowId),
    uniqueIndex("commitment_overrides_day_unique").on(t.cashflowId, t.dueDay),
  ],
);

/**
 * What a commitment is recognised by, learned from the user's confirmations: the words they record it with, the
 * sender of the bank message that pays it. Normalized text only; never a phone number or a message's text.
 */
export const commitmentHints = mysqlTable(
  "commitment_hints",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    cashflowId: int("cashflow_id").notNull(),
    /** phrase | sender */
    kind: varchar("kind", { length: 12 }).notNull(),
    value: varchar("value", { length: 160 }).notNull(),
    /** Confirmations minus undos; at zero or below the hint no longer counts. */
    weight: int("weight").notNull().default(1),
    lastSeenAt: datetime("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("commitment_hints_user_idx").on(t.userId, t.userType),
    uniqueIndex("commitment_hints_value_unique").on(t.cashflowId, t.kind, t.value),
  ],
);

/** A reminder that went out: one row per due date, stage and channel, so a retry or a second replica sends nothing twice. */
export const commitmentReminders = mysqlTable(
  "commitment_reminders",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    cashflowId: int("cashflow_id").notNull(),
    dueDay: date("due_day", { mode: "string" }).notNull(),
    /** before | due | after | week1 | week2 */
    stage: varchar("stage", { length: 10 }).notNull(),
    /** push | whatsapp */
    channel: varchar("channel", { length: 10 }).notNull(),
    sentAt: datetime("sent_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("commitment_reminders_user_idx").on(t.userId, t.userType, t.sentAt),
    uniqueIndex("commitment_reminders_once").on(t.cashflowId, t.dueDay, t.stage, t.channel),
  ],
);

/**
 * A question waiting for the user, asked with buttons when the app opens: whether a due date was paid
 * (`due_check`), or which commitment a recorded payment belongs to (`link`). One per date or payment (`dedupeKey`).
 */
export const commitmentQuestions = mysqlTable(
  "commitment_questions",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    /** due_check | link */
    kind: varchar("kind", { length: 12 }).notNull(),
    /** due:<cashflowId>:<day> or link:<expenseId> */
    dedupeKey: varchar("dedupe_key", { length: 80 }).notNull(),
    cashflowId: int("cashflow_id"),
    dueDay: date("due_day", { mode: "string" }),
    expenseId: int("expense_id"),
    /** link: the candidate due dates, [{ cashflowId, dueDay, amount }]. */
    candidates: json("candidates"),
    /** open | answered | skipped */
    status: varchar("status", { length: 12 }).notNull().default("open"),
    answer: varchar("answer", { length: 40 }),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    answeredAt: datetime("answered_at"),
  },
  (t) => [
    index("commitment_questions_user_idx").on(t.userId, t.userType, t.status),
    uniqueIndex("commitment_questions_once").on(t.userId, t.userType, t.dedupeKey),
  ],
);

/**
 * One payment toward one due date of a scheduled cashflow. `expenseId` is the ledger row that paid it (part of
 * it, for a partial payment); null when the user says it was paid without recording it. The allocations of one
 * expense never add up to more than the expense, and one expense pays one due date once.
 */
export const cashflowSettlements = mysqlTable(
  "cashflow_settlements",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    cashflowId: int("cashflow_id").notNull(),
    /** The Cairo day key of the due date this pays. */
    dueDay: date("due_day", { mode: "string" }).notNull(),
    expenseId: int("expense_id"),
    amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
    /** linked: to a ledger row; declared: the user said it was paid, nothing recorded. */
    source: varchar("source", { length: 20 }).notNull(),
    /** user: a tap; auto: matched with certainty when saved; question: the user picked it when asked; voice | chat. */
    matchedBy: varchar("matched_by", { length: 12 }).notNull().default("user"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("cashflow_settlements_user_idx").on(t.userId, t.userType, t.cashflowId, t.dueDay),
    index("cashflow_settlements_expense_idx").on(t.expenseId),
    uniqueIndex("cashflow_settlements_once").on(t.cashflowId, t.dueDay, t.expenseId),
  ],
);

/**
 * A plan the user agreed to with the coach (in a call, the chat or the app): its goal in the user's words, its
 * steps, and when to look at it again. `proposed` until the user accepts it; only then `active`.
 */
export const coachingPlans = mysqlTable(
  "coaching_plans",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    businessId: int("business_id"),
    title: varchar("title", { length: 160 }).notNull(),
    goal: varchar("goal", { length: 300 }),
    /** proposed | active | completed | cancelled | replaced (a newer accepted plan took its place) */
    status: varchar("status", { length: 20 }).notNull().default("proposed"),
    /** Raised by every change the user accepts, so an old confirmation never applies to a newer version. */
    revision: int("revision").notNull().default(1),
    /** Cairo day key of the next review. */
    reviewDay: date("review_day", { mode: "string" }),
    /** voice | chat | app */
    source: varchar("source", { length: 20 }).notNull(),
    callId: varchar("call_id", { length: 40 }),
    /** The figures the plan was agreed on (label, value, period), so a later review can say what changed. */
    evidence: json("evidence"),
    acceptedAt: datetime("accepted_at"),
    endedAt: datetime("ended_at"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [index("coaching_plans_user_idx").on(t.userId, t.userType, t.status)],
);

/**
 * One step of a coaching plan, with an optional in-app reminder the user asked for separately. A reminder fires once
 * per (step, reminder revision): moving or cancelling it raises the revision, so an old one never fires.
 */
export const coachingSteps = mysqlTable(
  "coaching_steps",
  {
    id: int("id").primaryKey().autoincrement(),
    planId: int("plan_id").notNull(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    position: int("position").notNull().default(0),
    title: varchar("title", { length: 200 }).notNull(),
    /** spending_limit | save | pay | record | review | other */
    kind: varchar("kind", { length: 30 }).notNull().default("other"),
    /** What the step measures, e.g. { "amountPerDay": 200, "category": "أكل وشرب" }. */
    target: json("target"),
    /** pending | done | skipped */
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    dueDay: date("due_day", { mode: "string" }),
    doneAt: datetime("done_at"),
    /** user: the user said it is done; ledger: the records show it. */
    doneEvidence: varchar("done_evidence", { length: 20 }),
    remindAt: datetime("remind_at"),
    /** none | scheduled | sent | cancelled */
    reminderStatus: varchar("reminder_status", { length: 20 }).notNull().default("none"),
    reminderRevision: int("reminder_revision").notNull().default(0),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("coaching_steps_plan_idx").on(t.planId),
    index("coaching_steps_user_idx").on(t.userId, t.userType, t.status),
    index("coaching_steps_reminder_idx").on(t.reminderStatus, t.remindAt),
  ],
);

/**
 * Every bank, wallet, payment network, fintech, telecom operator and SMS app whose notifications SmartSpend reads:
 * the phones' allowlist and the parser's evidence of who sent a message. Shared by all users and holds no user data.
 * Rows come from the seed in `api/lib/capture/seed-sources.ts` (`origin: seed`) or from an admin; an admin edit sets
 * `adminEditedAt`, and the seed never overwrites such a row again. Only facts checked against a real source belong
 * here: an app id from Google Play, a sender id from a real message; an unknown one stays empty, never guessed.
 */
export const captureSources = mysqlTable(
  "capture_sources",
  {
    id: int("id").primaryKey().autoincrement(),
    slug: varchar("slug", { length: 60 }).notNull().unique(),
    /** bank | wallet | payment_network | fintech | telecom | sms_app */
    kind: varchar("kind", { length: 20 }).notNull(),
    nameAr: varchar("name_ar", { length: 120 }).notNull(),
    nameEn: varchar("name_en", { length: 120 }).notNull(),
    /** ISO country codes where the source operates. */
    countries: json("countries").notNull(),
    /** Android package names, each confirmed on Google Play. */
    androidPackages: json("android_packages").notNull(),
    /** SMS sender ids (alphanumeric or short codes), each confirmed from a real message. */
    senderIds: json("sender_ids").notNull(),
    /** Names the source goes by inside message text, matched as whole tokens. */
    aliases: json("aliases").notNull(),
    /** What a person should know, such as an alert threshold below which the bank sends nothing. */
    notes: text("notes"),
    /** Order for template work and lists; lower comes first. */
    priority: int("priority").notNull().default(100),
    /** active | disabled */
    status: varchar("status", { length: 12 }).notNull().default("active"),
    /** seed | admin */
    origin: varchar("origin", { length: 10 }).notNull().default("admin"),
    adminEditedAt: datetime("admin_edited_at"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [index("capture_sources_status_idx").on(t.status, t.kind)],
);

/**
 * Subscriptions people pay by card, wallet or app store (Netflix, Shahid, Spotify, ChatGPT, Claude…), so a charge
 * can be recognised as one. `matchTokens` are words that name the service inside a card statement's merchant name
 * ("NETFLIX.COM", "OPENAI *CHATGPT SUBSCR"); a `store` (Google Play, Apple) bills for other developers, so its charge
 * names the store, not the service. Categories are ids from `contracts/categories.ts`. Shared, no user data; seeded
 * and edited like `capture_sources`.
 */
export const subscriptionCatalog = mysqlTable(
  "subscription_catalog",
  {
    id: int("id").primaryKey().autoincrement(),
    slug: varchar("slug", { length: 60 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull(),
    nameAr: varchar("name_ar", { length: 100 }).notNull(),
    /** service | store */
    kind: varchar("kind", { length: 12 }).notNull().default("service"),
    matchTokens: json("match_tokens").notNull(),
    categoryId: varchar("category_id", { length: 40 }).notNull(),
    subCategoryId: varchar("sub_category_id", { length: 40 }).notNull(),
    /** weekly | monthly | quarterly | yearly | varies */
    cycle: varchar("cycle", { length: 12 }).notNull().default("monthly"),
    /** "#E50914": the badge the apps draw when there is no logo. */
    brandColor: varchar("brand_color", { length: 9 }),
    /** An https image the admin set for the service's logo (commitments, the calendar). */
    logoUrl: varchar("logo_url", { length: 300 }),
    /** active | disabled */
    status: varchar("status", { length: 12 }).notNull().default("active"),
    /** seed | admin */
    origin: varchar("origin", { length: 10 }).notNull().default("admin"),
    adminEditedAt: datetime("admin_edited_at"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [index("subscription_catalog_status_idx").on(t.status)],
);

// ─── Capture: the phones that send bank and wallet notifications (decision 0028) ───
// One row per app installation. The device token is shown once and stored only as its SHA-256; a revoked device
// stops at its next request.
export const captureDevices = mysqlTable(
  "capture_devices",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    platform: varchar("platform", { length: 10 }).notNull(), // android | ios
    installationId: varchar("installation_id", { length: 64 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    label: varchar("label", { length: 80 }),
    appVersion: varchar("app_version", { length: 32 }),
    osVersion: varchar("os_version", { length: 32 }),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastSeenAt: datetime("last_seen_at"),
    lastSignalAt: datetime("last_signal_at"),
    /** The phone's last health report (decision 0034): whether it may still read notifications, what waits to be sent. */
    lastHeartbeatAt: datetime("last_heartbeat_at"),
    health: json("health"),
    /** When the user was last told this phone stopped capturing; told again only after it reports once more. */
    silentNoticeAt: datetime("silent_notice_at"),
    revokedAt: datetime("revoked_at"),
  },
  (t) => [
    index("capture_devices_user_idx").on(t.userId, t.userType),
    uniqueIndex("capture_devices_token_idx").on(t.tokenHash),
    uniqueIndex("capture_devices_installation_idx").on(t.userId, t.userType, t.installationId),
  ],
);

// What the user agreed to for capture, one row per grant: the scope, the version of the text they read, and when
// they took it back. Kept as a record of consent (Law 151/2020).
export const captureConsents = mysqlTable(
  "capture_consents",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    scope: varchar("scope", { length: 20 }).notNull(), // capture | ai_reading | message_samples | purpose_questions
    textVersion: varchar("text_version", { length: 20 }).notNull(),
    grantedAt: datetime("granted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    revokedAt: datetime("revoked_at"),
  },
  (t) => [index("capture_consents_user_scope_idx").on(t.userId, t.userType, t.scope)],
);

// A notification a phone sent that reads as a transaction. Kept 30 days: the text is redacted, and nothing that is
// not a transaction is stored at all. Every signal belongs to one event (one payment); several signals of the same
// payment (the bank's SMS and its app's notification) share it.
export const captureSignals = mysqlTable(
  "capture_signals",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    deviceId: int("device_id").notNull(),
    clientSignalId: varchar("client_signal_id", { length: 64 }).notNull(),
    channel: varchar("channel", { length: 16 }).notNull(),
    sourceSlug: varchar("source_slug", { length: 64 }),
    eventId: int("event_id"),
    /** HMAC of the text, to recognise the same message sent twice without keeping it. */
    textHmac: varchar("text_hmac", { length: 64 }).notNull(),
    textRedacted: text("text_redacted"),
    /** The reader's fields (`api/lib/capture/intake.ts#SignalReading`), read before anything was redacted. */
    reading: json("reading").notNull(),
    receivedAt: datetime("received_at").notNull(),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex("capture_signals_client_idx").on(t.userId, t.userType, t.clientSignalId),
    index("capture_signals_user_text_idx").on(t.userId, t.userType, t.textHmac, t.receivedAt),
    index("capture_signals_event_idx").on(t.eventId),
    index("capture_signals_created_idx").on(t.createdAt),
  ],
);

// One payment as capture understands it (decision 0029): the keys its signals are matched on, whether it waits for
// the user, was recorded, dismissed or deleted from the ledger, and its ledger row. No message text: a deleted one
// stays as a tombstone so a late signal of the same payment never brings it back.
export const captureEvents = mysqlTable(
  "capture_events",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("review"), // review | recorded | dismissed | deleted
    kind: varchar("kind", { length: 32 }).notNull(),
    direction: varchar("direction", { length: 10 }),
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    amountEgp: decimal("amount_egp", { precision: 14, scale: 2 }),
    occurredAt: datetime("occurred_at").notNull(),
    firstReceivedAt: datetime("first_received_at").notNull(),
    cardSuffix: varchar("card_suffix", { length: 4 }),
    accountSuffix: varchar("account_suffix", { length: 8 }),
    merchantKey: varchar("merchant_key", { length: 120 }),
    referenceHmac: varchar("reference_hmac", { length: 64 }),
    balanceAfter: decimal("balance_after", { precision: 14, scale: 2 }),
    ownAccount: boolean("own_account").notNull().default(false),
    /**
     * The first signal's reader fields, while the event waits for an answer or is held: a held event outlives its
     * signals (60 days against 30). Cleared when the event is answered.
     */
    reading: json("reading"),
    /** The Cairo month ("2026-10") whose limit this event counts in; null when it counts in none. */
    quotaPeriod: varchar("quota_period", { length: 7 }),
    /** Recorded without a question, under an allowed pair (decision 0030); its notice offers "undo". */
    autoRecorded: boolean("auto_recorded").notNull().default(false),
    /** The catalog source and the reader (or model prompt) version of its first signal, kept after the signals go. */
    sourceSlug: varchar("source_slug", { length: 64 }),
    readerVersion: varchar("reader_version", { length: 32 }),
    /** One entry per device and channel the payment arrived through ("12:sms:CIB"). */
    channels: json("channels").notNull(),
    primarySignalId: int("primary_signal_id").notNull(),
    possibleDuplicateOf: int("possible_duplicate_of"),
    linkedEventId: int("linked_event_id"),
    walletId: int("wallet_id"),
    expenseId: int("expense_id"),
    deviceId: int("device_id").notNull(),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    resolvedAt: datetime("resolved_at"),
  },
  (t) => [
    index("capture_events_user_status_idx").on(t.userId, t.userType, t.status, t.createdAt),
    index("capture_events_user_received_idx").on(t.userId, t.userType, t.firstReceivedAt),
    index("capture_events_user_reference_idx").on(t.userId, t.userType, t.referenceHmac),
    index("capture_events_created_idx").on(t.createdAt),
    index("capture_events_source_created_idx").on(t.sourceSlug, t.createdAt),
  ],
);

// How many new payments a user's capture took in one Cairo month, against the plan's limit (decision 0028), how
// many were held over it, whether the user was told the limit was reached, and how many questions were sent today.
export const captureUsage = mysqlTable(
  "capture_usage",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    period: varchar("period", { length: 7 }).notNull(),
    reserved: int("reserved").notNull().default(0),
    held: int("held").notNull().default(0),
    limitNoticed: boolean("limit_noticed").notNull().default(false),
    questionDay: varchar("question_day", { length: 10 }),
    questions: int("questions").notNull().default(0),
    /** The Cairo day and how many signals the user's phones sent on it, against the daily cap. */
    signalDay: varchar("signal_day", { length: 10 }),
    signals: int("signals").notNull().default(0),
    updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex("capture_usage_user_period_idx").on(t.userId, t.userType, t.period)],
);

// What a user filed a merchant or a person under, from their own answers and edits (decision 0030): the first place
// a captured payment's filing comes from. The key is "m:<merchant key>" or "p:<HMAC of the person's number, address
// or name>", never the name itself.
/** Optional purpose questions asked only after a movement has already been saved. */
export const captureQuestions = mysqlTable("capture_questions", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  userType: varchar("user_type", { length: 50 }).notNull(),
  eventId: int("event_id").notNull(),
  expenseId: int("expense_id").notNull(),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  expectedCategory: varchar("expected_category", { length: 100 }).notNull(),
  expectedSubCategory: varchar("expected_sub_category", { length: 100 }).notNull(),
  shownDay: varchar("shown_day", { length: 10 }),
  shownAt: datetime("shown_at"),
  resolvedAt: datetime("resolved_at"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  uniqueIndex("capture_questions_owner_event_idx").on(t.userId, t.userType, t.eventId),
  index("capture_questions_owner_status_idx").on(t.userId, t.userType, t.status, t.id),
  index("capture_questions_owner_day_idx").on(t.userId, t.userType, t.shownDay),
  index("capture_questions_created_idx").on(t.createdAt),
]);

export const captureMemory = mysqlTable(
  "capture_memory",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    memoryKey: varchar("memory_key", { length: 140 }).notNull(),
    categoryId: varchar("category_id", { length: 60 }).notNull(),
    subCategoryId: varchar("sub_category_id", { length: 60 }).notNull(),
    uses: int("uses").notNull().default(1),
    updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex("capture_memory_user_key_idx").on(t.userId, t.userType, t.memoryKey)],
);

// One user's record per bank and kind of message (decision 0030): how many captured payments in a row they recorded
// as read, whether they were offered recording on its own, and whether they took it.
export const captureUserPairs = mysqlTable(
  "capture_user_pairs",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    sourceSlug: varchar("source_slug", { length: 64 }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    streak: int("streak").notNull().default(0),
    autoEnabled: boolean("auto_enabled").notNull().default(false),
    askedAt: datetime("asked_at"),
    updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex("capture_user_pairs_user_pair_idx").on(t.userId, t.userType, t.sourceSlug, t.kind)],
);

// What a user asked capture to ignore (decision 0033): a card or account by its last digits (a family member's or a
// work card), or a phrase. Matching messages are dropped before anything is kept.
export const captureMarkers = mysqlTable(
  "capture_markers",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    /** ignore_card or ignore_phrase. */
    kind: varchar("kind", { length: 16 }).notNull(),
    value: varchar("value", { length: 120 }).notNull(),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [uniqueIndex("capture_markers_user_value_idx").on(t.userId, t.userType, t.kind, t.value)],
);

// A captured message the reader was unsure of, waiting for the admin's model (decision 0031): one row per signal,
// claimed with a lease so one replica reads it; the notice the reading produced waits here until the phone fetches it.
export const captureAiJobs = mysqlTable(
  "capture_ai_jobs",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    deviceId: int("device_id").notNull(),
    signalId: int("signal_id").notNull(),
    /** queued, running, done. */
    status: varchar("status", { length: 16 }).notNull().default("queued"),
    attempts: int("attempts").notNull().default(0),
    nextAt: datetime("next_at").notNull(),
    leaseUntil: datetime("lease_until"),
    /** How it ended: read, not_transaction, or why the model was not used (an id, never message content). */
    outcome: varchar("outcome", { length: 32 }),
    eventId: int("event_id"),
    lang: varchar("lang", { length: 2 }).notNull().default("ar"),
    notice: json("notice"),
    noticeDeliveredAt: datetime("notice_delivered_at"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex("capture_ai_jobs_signal_idx").on(t.signalId),
    index("capture_ai_jobs_due_idx").on(t.status, t.nextAt),
    index("capture_ai_jobs_user_device_idx").on(t.userId, t.userType, t.deviceId, t.noticeDeliveredAt),
    index("capture_ai_jobs_created_idx").on(t.createdAt),
  ],
);

/**
 * Redacted bank messages and what the model read from them, kept only with the `message_samples` consent, to build
 * and measure a reader that needs no model (plan v7 §8). The text holds numbered markers, never a name, phone, card or
 * code; the user's final answer is read from the event and its ledger row at export time, not copied here.
 */
export const captureSamples = mysqlTable(
  "capture_samples",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    signalId: int("signal_id").notNull(),
    eventId: int("event_id"),
    sourceSlug: varchar("source_slug", { length: 64 }),
    channel: varchar("channel", { length: 16 }).notNull(),
    textRedacted: text("text_redacted").notNull(),
    textHmac: varchar("text_hmac", { length: 64 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 16 }).notNull(),
    provider: varchar("provider", { length: 64 }),
    model: varchar("model", { length: 128 }),
    modelReply: json("model_reply"),
    posting: json("posting"),
    receivedMonth: varchar("received_month", { length: 7 }).notNull(),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex("capture_samples_signal_idx").on(t.signalId),
    index("capture_samples_user_idx").on(t.userId, t.userType),
    index("capture_samples_created_idx").on(t.createdAt),
  ],
);

/** Atomic capture-only resource accounting. Reservations survive an uncertain provider timeout. */
export const captureAiDays = mysqlTable("capture_ai_days", {
  day: varchar("day", { length: 10 }).primaryKey(),
  costUsd: decimal("cost_usd", { precision: 16, scale: 8 }).notNull().default("0"),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const captureAiAccounts = mysqlTable("capture_ai_accounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(), userType: varchar("user_type", { length: 50 }).notNull(),
  period: varchar("period", { length: 7 }).notNull(), tokens: int("tokens").notNull().default(0),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [uniqueIndex("capture_ai_accounts_owner_period").on(t.userId, t.userType, t.period), index("capture_ai_accounts_created").on(t.createdAt)]);
export const captureAiReservations = mysqlTable("capture_ai_reservations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: int("user_id").notNull(), userType: varchar("user_type", { length: 50 }).notNull(),
  day: varchar("day", { length: 10 }).notNull(), period: varchar("period", { length: 7 }).notNull(),
  tokens: int("tokens").notNull(), costUsd: decimal("cost_usd", { precision: 16, scale: 8 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("reserved"),
  leaseUntil: datetime("lease_until").notNull(),
  createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (t) => [index("capture_ai_reservations_owner").on(t.userId, t.userType, t.period), index("capture_ai_reservations_leases").on(t.status, t.leaseUntil), index("capture_ai_reservations_created").on(t.createdAt)]);

// ─── WhatsApp OTP Codes ───
export const whatsappOtpCodes = mysqlTable(
  "whatsapp_otp_codes",
  {
    id: int("id").primaryKey().autoincrement(),
    phone: varchar("phone", { length: 20 }).notNull(),
    /** HMAC of the six-digit code we sent on WhatsApp (decision 0038); the code itself is never stored. */
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    /** Wrong codes typed for this challenge; five close it. */
    attempts: int("attempts").notNull().default(0),
    verified: boolean("verified").notNull().default(false),
    expiresAt: datetime("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [
    index("whatsapp_otp_phone_idx").on(t.phone),
  ]
);

// ─── WhatsApp Business Platform (decision 0038) ───
/**
 * One message we send through Meta's Cloud API, from the moment it is queued until Meta reports it read or failed.
 * Never its text or a verification code: only the template, its non-secret parameters and what happened to it.
 */
export const whatsappMessages = mysqlTable(
  "whatsapp_messages",
  {
    id: int("id").primaryKey().autoincrement(),
    /** The person it is for, when it is for an account (a verification code may precede the account). */
    userId: int("user_id"),
    userType: varchar("user_type", { length: 50 }),
    /** International digits ("2010…"); cleared by the retention job after 30 days. */
    recipient: varchar("recipient", { length: 20 }),
    /** verification, report, reminder, admin_direct, broadcast. */
    purpose: varchar("purpose", { length: 32 }).notNull(),
    templateName: varchar("template_name", { length: 128 }),
    language: varchar("language", { length: 10 }),
    /** Template parameters; a verification code is never stored here. */
    params: json("params"),
    /** queued, sending, sent, delivered, read, failed, cancelled. */
    status: varchar("status", { length: 16 }).notNull().default("queued"),
    /** Meta's message id (wamid), which status webhooks name. */
    metaMessageId: varchar("meta_message_id", { length: 128 }),
    errorCode: int("error_code"),
    attempts: int("attempts").notNull().default(0),
    nextAttemptAt: datetime("next_attempt_at"),
    broadcastId: int("broadcast_id"),
    /** What Meta billed it as (authentication, utility, marketing, service), from the status webhook. */
    pricingCategory: varchar("pricing_category", { length: 32 }),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    sentAt: datetime("sent_at"),
    deliveredAt: datetime("delivered_at"),
    readAt: datetime("read_at"),
    failedAt: datetime("failed_at"),
  },
  (t) => [
    uniqueIndex("whatsapp_messages_meta_idx").on(t.metaMessageId),
    index("whatsapp_messages_user_idx").on(t.userId, t.userType, t.createdAt),
    index("whatsapp_messages_due_idx").on(t.status, t.nextAttemptAt),
    index("whatsapp_messages_broadcast_idx").on(t.broadcastId),
    index("whatsapp_messages_created_idx").on(t.createdAt),
  ],
);

/**
 * What one account agreed to receive on WhatsApp, and when it last wrote to us (the 24-hour window in which a free
 * reply is allowed). Consent is recorded with its time and where it was given (Law 151 of 2020).
 */
export const whatsappContacts = mysqlTable(
  "whatsapp_contacts",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    /** Meta's business-scoped user id, which webhooks carry even when the person hides their number. */
    bsuid: varchar("bsuid", { length: 160 }),
    reportsConsent: boolean("reports_consent").notNull().default(false),
    remindersConsent: boolean("reminders_consent").notNull().default(false),
    marketingConsent: boolean("marketing_consent").notNull().default(false),
    marketingConsentAt: datetime("marketing_consent_at"),
    /** Where marketing consent was given or withdrawn: settings, sign_up, reply. */
    marketingConsentSource: varchar("marketing_consent_source", { length: 32 }),
    optedOutAt: datetime("opted_out_at"),
    lastInboundAt: datetime("last_inbound_at"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    uniqueIndex("whatsapp_contacts_user_idx").on(t.userId, t.userType),
    index("whatsapp_contacts_bsuid_idx").on(t.bsuid),
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

// ─── Scheduled job runs ───
/**
 * One run of a background job (`withScheduledJobLock`): when it started, how long it took and whether it failed, by
 * the error's class only. It holds no user data. Kept 14 days (`api/jobs/data-retention-job.ts`).
 */
export const scheduledJobRuns = mysqlTable(
  "scheduled_job_runs",
  {
    id: int("id").primaryKey().autoincrement(),
    jobName: varchar("job_name", { length: 80 }).notNull(),
    startedAt: datetime("started_at").notNull(),
    durationMs: int("duration_ms").notNull(),
    status: varchar("status", { length: 16 }).notNull(), // ok | failed
    errorName: varchar("error_name", { length: 120 }),
    host: varchar("host", { length: 120 }),
  },
  (t) => [index("job_runs_name_started_idx").on(t.jobName, t.startedAt)],
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

// ─── Live voice calls ───
// One row per call: what the monthly allowance counts (billed seconds in the Cairo month) and what the call
// really cost. Never the call's words: no transcript is stored anywhere.
export const voiceCalls = mysqlTable(
  "voice_calls",
  {
    id: varchar("id", { length: 40 }).primaryKey(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    // starting | live | reconnecting | ended | failed
    status: varchar("status", { length: 20 }).notNull().default("starting"),
    engine: varchar("engine", { length: 40 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    voice: varchar("voice", { length: 40 }),
    // web | pwa | android | ios
    client: varchar("client", { length: 20 }),
    month: varchar("month", { length: 7 }).notNull(), // Cairo "YYYY-MM"
    startedAt: datetime("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    connectedAt: datetime("connected_at"),
    endedAt: datetime("ended_at"),
    lastCheckpointAt: datetime("last_checkpoint_at"),
    billedSeconds: int("billed_seconds").notNull().default(0),
    maxSeconds: int("max_seconds").notNull().default(0),
    endReason: varchar("end_reason", { length: 40 }),
    turns: int("turns").notNull().default(0),
    toolCalls: int("tool_calls").notNull().default(0),
    incidents: int("incidents").notNull().default(0),
    reconnects: int("reconnects").notNull().default(0),
    // Provider token counts by direction and modality, e.g. {"input":{"text":900,"audio":400},"output":{"audio":250}}
    tokens: json("tokens"),
    // Call quality: first-audio latency after the user stops speaking, e.g. {"firstAudioMs":{"count":6,"p50":900,"p95":1700}}
    metrics: json("metrics"),
    costUsd: decimal("cost_usd", { precision: 12, scale: 8 }).notNull().default("0.00000000"),
    // pending | done | empty | failed — the post-call summary and facts
    memoryStatus: varchar("memory_status", { length: 20 }).notNull().default("pending"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("voice_calls_user_month_idx").on(t.userId, t.userType, t.month),
    index("voice_calls_started_idx").on(t.startedAt),
    index("voice_calls_status_idx").on(t.status),
  ],
);

// What went wrong in a call, as structured fields only (golden rule 10): a spoken number that matched no fact,
// a refused confirmation, a failing tool. The words are never stored.
export const voiceCallIncidents = mysqlTable(
  "voice_call_incidents",
  {
    id: int("id").primaryKey().autoincrement(),
    userId: int("user_id").notNull(),
    userType: varchar("user_type", { length: 50 }).notNull(),
    callId: varchar("call_id", { length: 40 }).notNull(),
    kind: varchar("kind", { length: 40 }).notNull(),
    detail: json("detail"),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("voice_call_incidents_user_idx").on(t.userId, t.userType),
    index("voice_call_incidents_call_idx").on(t.callId),
    index("voice_call_incidents_created_idx").on(t.createdAt),
  ],
);

// ─── Admin Action Audit Logs (GAP-36) ───
export const adminAuditLogs = mysqlTable(
  "admin_audit_logs",
  {
    id: int("id").primaryKey().autoincrement(),
    adminId: int("admin_id").notNull(),
    adminType: varchar("admin_type", { length: 50 }).notNull(),
    action: varchar("action", { length: 100 }).notNull(),
    targetType: varchar("target_type", { length: 100 }).notNull(),
    targetId: varchar("target_id", { length: 255 }).notNull(),
    details: json("details"),
    ipAddress: varchar("ip_address", { length: 100 }),
    createdAt: datetime("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (t) => [
    index("admin_audit_admin_idx").on(t.adminId, t.adminType),
    index("admin_audit_action_idx").on(t.action),
    index("admin_audit_target_idx").on(t.targetType, t.targetId),
    index("admin_audit_created_idx").on(t.createdAt),
  ],
);
export type AdminAuditLog = typeof adminAuditLogs.$inferSelect;
export type NewAdminAuditLog = typeof adminAuditLogs.$inferInsert;


