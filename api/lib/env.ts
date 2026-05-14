import { z } from "zod";

const envSchema = z.object({
  // Database
  DATABASE_URL: z.string().min(1),

  // Google OAuth
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().default("http://localhost:3000/api/auth/google/callback"),

  // JWT
  JWT_SECRET: z.string().min(1),

  // AI
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL_FREE: z.string().default("gemini-1.5-flash"),
  GEMINI_MODEL_PRO: z.string().default("gemini-1.5-pro"),
  GEMINI_MODEL_REPORTS: z.string().default("gemini-1.5-pro"),

  // App
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z.string().default("3000"),
  APP_URL: z.string().default("http://localhost:5173"),

  // Owner
  OWNER_EMAIL: z.string().optional(),
});

export const env = envSchema.parse(process.env);
