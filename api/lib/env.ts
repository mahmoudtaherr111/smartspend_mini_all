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

  // App
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.string().default("3000"),
  APP_URL: z.string().default("http://localhost:5173"),
  // FRONTEND_URL: when frontend is deployed separately (e.g. https://app.smartspend.app)
  // If not set, falls back to APP_URL for backward-compat monorepo mode
  FRONTEND_URL: z.string().optional(),

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
  REDIS_URL: z.string().optional(),
  AI_ALLOW_MEMORY_CACHE_IN_PRODUCTION: z.enum(["true", "false"]).optional(),
  SENTRY_DSN: z.string().optional(),
  
  // Firebase FCM
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
});

export const env = envSchema.parse(process.env);
