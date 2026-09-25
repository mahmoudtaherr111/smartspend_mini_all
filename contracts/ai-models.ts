/**
 * What the admin console can assign a model to, and the prices providers publish for the models the app uses by
 * default. Shared by the server (api/lib/ai-pricing.ts, the admin routes) and the console's model form.
 */

/** Purposes the server reads from the admin's routes (`resolveAdminRoutes`); a model may serve several. */
export const AI_ROUTED_PURPOSES = [
  { id: "classification", label: "تصنيف المصاريف" },
  { id: "chat", label: "الشات" },
  { id: "report", label: "التقارير وأداة التفكير في المكالمة" },
  { id: "embedding", label: "البحث بالمعنى (Embeddings)" },
] as const;

export type AiRoutedPurpose = (typeof AI_ROUTED_PURPOSES)[number]["id"];

export const AI_PLAN_TIERS = ["free", "pro", "ultra"] as const;

/**
 * Published paid-tier prices, USD per million text tokens, output including thinking. Google's page, checked
 * 2026-09-25 (https://ai.google.dev/gemini-api/docs/pricing); 3.8 Flash's rates double on 2027-01-01. Any other model
 * is priced by the admin in the console.
 */
export const PUBLISHED_RATES: Record<string, { input: number; output: number; cached?: number }> = {
  "gemini-3.8-flash": { input: 0.75, output: 3.75, cached: 0.075 },
  "gemini-3.5-flash": { input: 1.5, output: 9.0 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5, cached: 0.02 },
  "gemini-3.1-flash-lite": { input: 0.25, output: 1.5, cached: 0.0125 },
  "gemini-embedding-2": { input: 0.2, output: 0 },
};
