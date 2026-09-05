import { z } from "zod";

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z
    .string()
    .default("http://localhost:3000/api/auth/google/callback"),

  // JWT
  JWT_SECRET: z.string().min(1),

  // AI
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL_FREE: z.string().default("gemini-3.1-flash-lite"),
  GEMINI_MODEL_PRO: z.string().default("gemini-3.5-flash"),
  GEMINI_MODEL_REPORTS: z.string().default("gemini-3.1-pro"),
  GROQ_API_KEY: z.string().optional(),
  FIREWORKS_API_KEY: z.string().optional(),
  NVIDIA_API_KEY: z.string().optional(),

  // App
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.string().default("3000"),
  APP_URL: z.string().default("http://localhost:5173"),
  /** Business-calendar timezone; persistence remains UTC. */
  APP_TIMEZONE: z.string().default("Africa/Cairo"),
  // FRONTEND_URL: when frontend is deployed separately (e.g. https://app.smartspend.app)
  // If not set, falls back to APP_URL for backward-compat monorepo mode
  FRONTEND_URL: z.string().optional(),
  // Extra exact browser origins, comma-separated; never wildcard tunnel domains.
  ALLOWED_ORIGINS: z.string().optional(),

  // Owner
  OWNER_EMAIL: z.string().optional(),

  // Billing (Paymob) — optional until production wiring is complete
  PAYMOB_API_KEY: z.string().optional(),
  PAYMOB_INTEGRATION_ID: z.string().optional(),
  PAYMOB_IFRAME_ID: z.string().optional(),
  PAYMOB_HMAC_SECRET: z.string().optional(),
  /** When "true", allows demo transaction ids in `pro.upgrade` (never enable in production). */
  BILLING_SIMULATE: z.enum(["true", "false"]).optional(),
  TRUST_PROXY: z.string().optional(),
  // Forwarded client IPs are accepted only from loopback or one of these exact peers.
  TRUSTED_PROXY_IPS: z.string().optional(),
  TRUSTED_PROXY_HEADER: z
    .enum(["x-forwarded-for", "x-real-ip", "cf-connecting-ip"])
    .default("x-forwarded-for"),
  // Prefer a dedicated secret. JWT_SECRET is a backwards-compatible fallback.
  RATE_LIMIT_KEY_SECRET: z.string().min(16).optional(),
  LOGIN_IP_MAX_FAILURES: z.coerce.number().int().min(10).max(1_000).default(50),
  LOGIN_IP_BURST_MAX_FAILURES: z.coerce
    .number()
    .int()
    .min(5)
    .max(100)
    .default(10),
  LOGIN_ACCOUNT_MAX_FAILURES: z.coerce.number().int().min(3).max(20).default(5),
  LOGIN_PAIR_MAX_FAILURES: z.coerce.number().int().min(3).max(20).default(5),
  /** Background jobs are opt-in in development and explicit in production. */
  ENABLE_CRONS: z.enum(["true", "false"]).optional(),
  /** Baileys must not connect merely because credentials happen to be on disk. */
  ENABLE_WHATSAPP: z.enum(["true", "false"]).optional(),
  REDIS_URL: z.string().optional(),
  AI_ALLOW_MEMORY_CACHE_IN_PRODUCTION: z.enum(["true", "false"]).optional(),
  SENTRY_DSN: z.string().optional(),

  // Firebase FCM
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),

  // Storage & Observability
  LOG_SLOW_QUERIES: z.enum(["true", "false"]).default("true"),
  SLOW_QUERY_THRESHOLD_MS: z.coerce.number().default(100),
});

export const env = envSchema.parse(process.env);
