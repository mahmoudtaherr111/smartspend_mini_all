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
  // The OAuth client ids of the mobile app (decision 0022), comma-separated (the store build and the dev build
  // have one each). `auth.signInWithGoogle` accepts only ID tokens issued to one of them; unset, it refuses all.
  GOOGLE_ANDROID_CLIENT_IDS: z.string().optional(),
  GOOGLE_IOS_CLIENT_IDS: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(1),

  // The secret that seals the provider keys saved in the admin console (api/lib/provider-key-crypto.ts). Unset,
  // they are sealed with JWT_SECRET and rotating it loses them. During a rotation the old value goes in
  // AI_GATEWAY_SECRET_PREVIOUS until the console shows no key left on it.
  AI_GATEWAY_SECRET: z.string().optional(),
  AI_GATEWAY_SECRET_PREVIOUS: z.string().optional(),

  // AI
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL_FREE: z.string().default("gemini-3.1-flash-lite"),
  GEMINI_MODEL_PRO: z.string().default("gemini-3.5-flash"),
  GEMINI_MODEL_REPORTS: z.string().default("gemini-3.8-flash"),
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
  // Bot & Abuse Protection (Cloudflare Turnstile)
  TURNSTILE_SECRET_KEY: z.string().optional(),
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
  /** Share of requests Sentry traces and profiles, 0 to 1. */
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

  // Web Push without Firebase. The public key is also built into the web app as VITE_VAPID_PUBLIC_KEY.
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default("mailto:contact@smartspend.com"),

  // WhatsApp Business Platform, Meta's Cloud API (decision 0038). Without the token and the phone number id nothing is
  // sent; without the app secret and the verify token the webhook refuses everything.
  WHATSAPP_CLOUD_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_CLOUD_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_CLOUD_WABA_ID: z.string().optional(),
  WHATSAPP_CLOUD_APP_SECRET: z.string().optional(),
  WHATSAPP_CLOUD_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_CLOUD_API_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v23.0"),

  // Firebase FCM
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),

  // Storage & Observability
  LOG_SLOW_QUERIES: z.enum(["true", "false"]).default("true"),
  SLOW_QUERY_THRESHOLD_MS: z.coerce.number().default(100),
});

/** Shortest secret production accepts: JWT_SECRET signs every session, so a guessable one lets anyone sign in as anyone. */
export const MIN_PRODUCTION_SECRET_LENGTH = 32;

const PRODUCTION_SECRETS = ["JWT_SECRET", "AI_GATEWAY_SECRET", "RATE_LIMIT_KEY_SECRET"] as const;

export function parseServerEnv(source: NodeJS.ProcessEnv) {
  return envSchema
    .superRefine((value, ctx) => {
      if (value.NODE_ENV !== "production") return;
      for (const key of PRODUCTION_SECRETS) {
        const secret = value[key];
        if (secret !== undefined && secret.length < MIN_PRODUCTION_SECRET_LENGTH) {
          ctx.addIssue({
            code: "custom",
            path: [key],
            message: `${key} must be at least ${MIN_PRODUCTION_SECRET_LENGTH} random characters in production`,
          });
        }
      }
    })
    .parse(source);
}

export const env = parseServerEnv(process.env);
