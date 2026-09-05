export type TableClass = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export interface TableClassMetadata {
  class: TableClass;
  name: string;
  description: string;
  lifetime: string;
  storageRule: string;
}

export const TABLE_CLASS_DEFINITIONS: Record<TableClass, { name: string; description: string; storageRule: string; lifetime: string }> = {
  A: {
    name: "Identity & Config",
    description: "Users, credentials, settings, providers, templates, categories",
    storageRule: "MySQL; small; cached aggressively in Redis with explicit invalidation",
    lifetime: "Forever",
  },
  B: {
    name: "Core Ledger",
    description: "expenses — the truth about user money",
    storageRule: "MySQL; narrow hot table; covering indexes; never auto-deleted",
    lifetime: "Forever",
  },
  C: {
    name: "Derived / Rollup",
    description: "Pre-aggregated facts computed from B; rebuildable at any time",
    storageRule: "MySQL; tiny; rebuildable from B at any time",
    lifetime: "Forever (cheap)",
  },
  D: {
    name: "Operational / Ephemeral",
    description: "Sessions, challenges, OTPs, pending actions",
    storageRule: "Redis primary, MySQL as durable fallback/audit",
    lifetime: "Minutes -> days",
  },
  E: {
    name: "Telemetry / Logs",
    description: "Classification logs, token ledgers, analytics, notification logs",
    storageRule: "MySQL; chunk-pruned on a schedule, rolled up before deletion",
    lifetime: "30–365 days",
  },
  F: {
    name: "AI Memory",
    description: "Memory items + embeddings",
    storageRule: "Text/metadata in MySQL; vectors in vector store or quantized binary",
    lifetime: "Forever (items), rebuildable (vectors)",
  },
  G: {
    name: "Conversation",
    description: "chat_messages and conversation threads",
    storageRule: "MySQL raw for a window, then summarized and pruned",
    lifetime: "90 days raw",
  },
};

/**
 * Authoritative mapping of every table in db/schema.ts to its storage class (A–G).
 * Any table missing here will fail the class-coverage test.
 */
export const TABLE_CLASSES: Record<string, TableClass> = {
  // Class A: Identity & Config (Forever)
  users: "A",
  local_users: "A",
  user_businesses: "A",
  business_categories: "A",
  user_contacts: "A",
  expense_categories: "A",
  user_wallets: "A",
  support_tickets: "A",
  discount_codes: "A",
  ads: "A",
  referrals: "A",
  pro_subscriptions: "A",
  seo_pages: "A",
  system_settings: "A",
  user_profiles: "A",
  onboarding_questions: "A",
  push_subscriptions: "A",
  user_credentials: "A",
  notification_templates: "A",
  ai_providers: "A",
  ai_models: "A",

  // Class B: Core Ledger (Forever, Never auto-deleted)
  expenses: "B",
  expense_details: "B",

  // Class C: Derived / Rollup (Rebuildable from B)
  expense_daily_rollups: "C",
  monthly_reports: "C",
  monthly_behavior_snapshots: "C",
  ai_summaries: "C",
  financial_goals: "C",
  user_budgets: "C",
  ai_cost_monthly: "C",
  ad_stats_daily: "C",

  // Class D: Operational / Ephemeral (Short TTL / Redis primary)
  sessions: "D",
  auth_challenges: "D",
  whatsapp_otp_codes: "D",
  pending_clarifications: "D",
  ai_pending_actions: "D",
  webhook_tokens: "D",
  in_app_notifications: "D",

  // Class E: Telemetry / Logs (Retention pruned)
  classification_logs: "E",
  ai_token_ledgers: "E",
  user_analytics: "E",
  notification_logs: "E",
  ad_clicks: "E",
  raw_sms_events: "E",
  voice_usage: "E",
  api_key_errors: "E",
  profile_learning_events: "E",
  ai_action_audit_logs: "E",

  // Class F: AI Memory (Items durable, embeddings rebuildable)
  user_dictionaries: "F",
  ai_memory_items: "F",
  ai_memory_embeddings: "F",
  ai_action_memory: "F",
  ai_conversation_summaries: "F",
  user_correction_rules: "F",

  // Class G: Conversation (Windowed retention + summarization)
  chat_conversations: "G",
  chat_messages: "G",
};
