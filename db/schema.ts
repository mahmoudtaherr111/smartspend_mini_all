import { mysqlTable, int, varchar, text, datetime, boolean, json, decimal, timestamp, index, uniqueIndex } from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

// ─── Users (OAuth) ───
export const users = mysqlTable("users", {
  id: int("id").primaryKey().autoincrement(),
  unionId: varchar("union_id", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  avatar: varchar("avatar", { length: 500 }),
  role: varchar("role", { length: 50 }).notNull().default("user"), // user | moderator | admin
  plan: varchar("plan", { length: 50 }).notNull().default("free"), // free | pro
  referralCode: varchar("referral_code", { length: 50 }).unique(),
  referredBy: int("referred_by"),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  lastSignInAt: datetime("last_sign_in_at"),
}, (t) => [
  index("users_role_idx").on(t.role),
  index("users_plan_idx").on(t.plan),
  index("users_referral_idx").on(t.referralCode),
]);

// ─── Local Users ───
export const localUsers = mysqlTable("local_users", {
  id: int("id").primaryKey().autoincrement(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  password: varchar("password", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  role: varchar("role", { length: 50 }).notNull().default("user"),
  plan: varchar("plan", { length: 50 }).notNull().default("free"),
  referralCode: varchar("referral_code", { length: 50 }).unique(),
  referredBy: int("referred_by"),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
  lastSignInAt: datetime("last_sign_in_at"),
}, (t) => [
  index("local_users_role_idx").on(t.role),
  index("local_users_plan_idx").on(t.plan),
]);

// ─── Expenses ───
export const expenses = mysqlTable("expenses", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  userType: varchar("user_type", { length: 50 }).notNull(), // oauth | local
  type: varchar("type", { length: 50 }).notNull().default("expense"), // income | expense
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  description: text("description"),
  rawText: text("raw_text"),
  source: varchar("source", { length: 50 }).notNull().default("manual"), // voice | manual
  date: datetime("date").notNull(),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
}, (t) => [
  index("expenses_user_idx").on(t.userId, t.userType),
  index("expenses_date_idx").on(t.date),
  index("expenses_type_idx").on(t.type),
]);

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

// ─── Monthly Reports ───
export const monthlyReports = mysqlTable("monthly_reports", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  userType: varchar("user_type", { length: 50 }).notNull(),
  month: varchar("month", { length: 7 }).notNull(), // YYYY-MM
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  totalIncome: decimal("total_income", { precision: 12, scale: 2 }).default("0.00"),
  categoryBreakdown: json("category_breakdown"),
  topCategories: json("top_categories"),
  dailyAverage: decimal("daily_average", { precision: 12, scale: 2 }),
  highestDay: varchar("highest_day", { length: 10 }),
  insights: text("insights"),
  aiReport: text("ai_report"),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
  updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});

// ─── Sessions ───
export const sessions = mysqlTable("sessions", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  userType: varchar("user_type", { length: 50 }).notNull(),
  token: varchar("token", { length: 500 }).notNull(),
  ipAddress: varchar("ip_address", { length: 100 }),
  userAgent: text("user_agent"),
  expiresAt: datetime("expires_at").notNull(),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index("sessions_user_idx").on(t.userId, t.userType),
  index("sessions_token_idx").on(t.token),
]);

// ─── User Analytics ───
export const userAnalytics = mysqlTable("user_analytics", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  userType: varchar("user_type", { length: 50 }).notNull(),
  event: varchar("event", { length: 100 }).notNull(), // login | logout | page_view | expense_create | ai_use
  metadata: json("metadata"),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index("analytics_user_idx").on(t.userId, t.userType),
  index("analytics_event_idx").on(t.event),
]);

// ─── Support Tickets ───
export const supportTickets = mysqlTable("support_tickets", {
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
  updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
}, (t) => [
  index("tickets_user_idx").on(t.userId, t.userType),
  index("tickets_status_idx").on(t.status),
  index("tickets_assigned_idx").on(t.assignedTo),
]);

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
export const aiSummaries = mysqlTable("ai_summaries", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  userType: varchar("user_type", { length: 50 }).notNull(),
  period: varchar("period", { length: 50 }).notNull(), // monthly | yearly
  periodValue: varchar("period_value", { length: 50 }).notNull(), // 2024-01 | 2024
  model: varchar("model", { length: 100 }).default("gemini-1.5-flash"),
  content: text("content").notNull(),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  index("ai_summary_user_idx").on(t.userId, t.userType),
  uniqueIndex("ai_summary_period_idx").on(t.userId, t.userType, t.period, t.periodValue),
]);

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
export const referrals = mysqlTable("referrals", {
  id: int("id").primaryKey().autoincrement(),
  referrerId: int("referrer_id").notNull(),
  referrerType: varchar("referrer_type", { length: 50 }).notNull(),
  referredId: int("referred_id").notNull(),
  referredType: varchar("referred_type", { length: 50 }).notNull(),
  codeUsed: varchar("code_used", { length: 100 }),
  status: varchar("status", { length: 50 }).default("pending"), // pending | completed | rewarded
  rewardGiven: boolean("reward_given").default(false),
  createdAt: datetime("created_at").default(sql`CURRENT_TIMESTAMP`),
}, (t) => [
  uniqueIndex("referral_unique_idx").on(t.referrerId, t.referrerType, t.referredId, t.referredType),
]);

// ─── Pro Subscriptions ───
export const proSubscriptions = mysqlTable("pro_subscriptions", {
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
  updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
}, (t) => [
  index("pro_sub_user_idx").on(t.userId, t.userType),
]);

// ─── SEO Pages ───
export const seoPages = mysqlTable("seo_pages", {
  id: int("id").primaryKey().autoincrement(),
  path: varchar("path", { length: 255 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  keywords: text("keywords"),
  ogImage: varchar("og_image", { length: 500 }),
  canonicalUrl: varchar("canonical_url", { length: 500 }),
  updatedAt: datetime("updated_at").default(sql`CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`),
});
