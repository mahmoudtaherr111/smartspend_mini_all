/**
 * The model that reads a bank or wallet message the rules could not read with confidence (decision 0025).
 *
 * It goes through the providers the admin configured for the `sms` purpose (any OpenAI-compatible endpoint such as
 * OpenRouter, or Gemini), and only through them: a bank message is never sent to a built-in provider the admin did
 * not choose. Until the admin configures one, `GEMINI_API_KEY` with `mapModelName("flash")` answers, as before.
 *
 * Before any call: the admin's switch (`sms_ai_enabled`), the user's plan budget (`assertAiBudget`, channel `sms`) and
 * the global daily cost cap in USD (`sms_ai_daily_cost_cap_usd`). The text is condensed and redacted
 * (api/lib/anonymizer.ts), and one call carries one message of one user. The reply is checked by
 * api/lib/sms-ai-contract.ts. When the model is skipped or its reply is discarded, the result says so and the ingest
 * route takes the path it takes without a model: the rules' reading, or the raw message kept with its reason.
 */
import { env } from "./env";
import { mapModelName } from "./model-mapper";
import { condenseSmsNotification, cleanSmsText, normalizeSmsText } from "./sms-rule-parser";
import { createLogger } from "./log";
import { ledgerCostUsdSince, recordModelCalls } from "./ai-ledger";
import { executeLlmChain, LlmChainError, type LlmRoute, type StructuredSchema } from "./llm-router";
import { buildProviderChain } from "./llm-provider-chain";
import { resolveAdminRoutes } from "./ai-gateway";
import { asPlan, assertAiBudget, clampOutputTokens, estimateTokensFromText, trackAiTokens } from "./ai-usage-policy";
import { getSystemSettings } from "./settings-cache";
import { costAtRates, ratesFor, type ModelRates } from "./ai-pricing";
import { businessDayRange } from "./app-time";
import { redactSensitiveData, redactWithFindings } from "./anonymizer";
import {
  SMS_PROMPT_VERSION,
  SMS_REPLY_SCHEMA,
  SMS_SYSTEM_PROMPT,
  buildSmsUserPrompt,
  interpretSmsReply,
  parseSmsReplyText,
  validateSmsReply,
  type SmsModelReply,
} from "./sms-ai-contract";

// A bank message is someone's balance and payees: log its length, never its text (golden rule 10).
const log = createLogger("sms-ai-parser");

// Re-export shared cleaners for external consumers
export { condenseSmsNotification, cleanSmsText, normalizeSmsText };

export interface SmsParseResult {
  transaction_detected: boolean;
  amount: number | null;
  currency: string;
  direction: "incoming" | "outgoing" | null;
  provider: "VodafoneCash" | "InstaPay" | "ApplePay" | "Bank" | "Unknown";
  category:
    | "transfer"
    | "payment"
    | "income"
    | "bills"
    | "withdrawal"
    | "unknown";
  fee: number | null;
  merchant: string | null;
  balance_after: number | null;
  confidence: number; // 0.0 → 1.0
  raw_extracted: Record<string, unknown>;
}

export type SmsUserContext = {
  userId?: number | null;
  userType?: string | null;
  /** The user's plan: which admin route serves the call, and whose budget pays for it. */
  plan?: string | null;
  /** The sender the phone reported, redacted before the model sees it. */
  sender?: string | null;
  /** The provider the rules recognised, passed through when the model's answer does not name one. */
  providerHint?: SmsParseResult["provider"] | null;
};

/**
 * What happened to the message on the model path:
 *   - parsed / cache_hit: a checked reply, in `result` (it may still say no transaction);
 *   - not_transaction: a checked reply that reads it as no ledger movement (declined, a hold, a code, an offer, a
 *     statement, a balance), which the route must not save from the rules either;
 *   - everything else: no model answer to use (`skipped`), and the route takes the no-model path.
 */
export type SmsModelOutcome =
  | "parsed"
  | "cache_hit"
  | "not_transaction"
  | "empty"
  | "no_user"
  | "disabled"
  | "no_route"
  | "budget"
  | "cost_cap"
  | "failed"
  | "invalid_reply"
  | "needs_review";

export interface SmsModelRead {
  result: SmsParseResult | null;
  outcome: SmsModelOutcome;
  /** No model answer is used: switched off, out of budget or cap, failed, discarded, or not to be saved as read. */
  skipped: boolean;
}

/** The static instructions, counted as the parse channel counts its prompt: the per-request ceiling is about the message. */
const STATIC_PROMPT_TOKENS = 420;
/** The reply is one small JSON object. */
const MAX_OUTPUT_TOKENS = 512;
/** Gemini through the server key while the admin has configured no `sms` route (temporary, decision 0025). */
const FALLBACK_MODEL_ALIAS = "flash";

// In-memory cache of checked replies, per user and prompt version, for 15 minutes.
const aiParseCache = new Map<string, { reply: SmsModelReply; expiresAt: number }>();
const CACHE_TTL = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

/** Everything the answer depends on: the user, the prompt version and the exact prompt the model would see. */
function getCacheKey(userType: string, userId: number, userPrompt: string): string {
  return `${SMS_PROMPT_VERSION}:${userType}:${userId}:${userPrompt}`;
}

function setCacheEntry(key: string, reply: SmsModelReply): void {
  if (aiParseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = aiParseCache.keys().next().value;
    if (oldestKey !== undefined) aiParseCache.delete(oldestKey);
  }
  aiParseCache.set(key, { reply: structuredClone(reply), expiresAt: Date.now() + CACHE_TTL });
}

export function clearSmsAiCache(): void {
  aiParseCache.clear();
}

export function getSmsAiCacheSize(): number {
  return aiParseCache.size;
}

const skip = (outcome: SmsModelOutcome): SmsModelRead => ({ result: null, outcome, skipped: true });

/** The admin's `sms` routes, alone; or Gemini with the server key while there are none. */
async function smsRoutes(plan: ReturnType<typeof asPlan>): Promise<{ routes: LlmRoute[]; source: "admin" | "server_key" }> {
  const admin = await resolveAdminRoutes("sms", plan).catch((err) => {
    log.warn({ err, event: "sms.ai.admin_routes_unavailable" }, "Admin routes for bank messages could not be read");
    return { preferred: null, routes: [] };
  });
  if (admin.routes.length > 0) {
    const lead = admin.preferred ?? admin.routes[0];
    // No built-in keys: the chain is exactly what the admin allowed for this purpose, in their priority order.
    const routes = buildProviderChain({
      preferred: lead.slug,
      preferredModel: lead.model,
      plan,
      keys: {},
      dbRoutes: admin.routes.map((route) => ({
        slug: route.slug,
        protocol: route.protocol === "gemini" ? ("gemini" as const) : ("openai" as const),
        baseUrl: route.baseUrl,
        apiKey: route.apiKey,
        model: route.model,
        priority: route.priority,
        providerId: route.providerId,
        suppressReasoning: route.suppressReasoning,
      })),
    });
    return { routes, source: "admin" };
  }
  if (!env.GEMINI_API_KEY) return { routes: [], source: "server_key" };
  return {
    routes: [{ slug: "gemini", protocol: "gemini", baseUrl: "", apiKey: env.GEMINI_API_KEY, model: mapModelName(FALLBACK_MODEL_ALIAS), priority: 0 }],
    source: "server_key",
  };
}

/**
 * The daily cap holds only for calls it can price, so with a cap only priced routes are tried. Returns the routes
 * left, or null when the cap is reached (or nothing left can be priced).
 */
async function withinDailyCap(
  routes: LlmRoute[],
  capUsd: number,
  usage: { promptTokens: number; completionTokens: number },
): Promise<LlmRoute[] | null> {
  if (!(capUsd > 0)) return routes;
  const priced: Array<{ route: LlmRoute; rates: ModelRates }> = [];
  for (const route of routes) {
    const rates = await ratesFor(route.slug, route.model);
    if (rates) priced.push({ route, rates });
  }
  if (priced.length === 0) return null;
  const spent = await ledgerCostUsdSince("sms", businessDayRange().start);
  // The most this call could cost, whichever route answers.
  const worst = Math.max(...priced.map(({ rates }) => costAtRates(rates, usage)));
  return spent + worst > capUsd ? null : priced.map(({ route }) => route);
}

export async function parseSmsFinancialData(message: string, userContext: SmsUserContext = {}): Promise<SmsModelRead> {
  const trimmedMessage = message.trim();
  if (!trimmedMessage) return skip("empty");

  const userId = userContext.userId;
  const userType: "oauth" | "local" | null =
    userContext.userType === "oauth" || userContext.userType === "local" ? userContext.userType : null;
  // A call is paid from one user's budget; without a user there is no budget to check.
  if (!userId || !userType) return skip("no_user");
  const user = { id: userId, type: userType, plan: asPlan(userContext.plan ?? undefined) };
  const logBase = { userId, userType, promptVersion: SMS_PROMPT_VERSION };

  const settings = await getSystemSettings().catch(() => ({}) as Record<string, string>);
  if (settings.sms_ai_enabled === "false") {
    log.info({ ...logBase, event: "sms.ai.skipped", reason: "disabled" }, "Bank message model is switched off");
    return skip("disabled");
  }

  // Condensed, then redacted: the model never sees a card, account, phone, reference or name.
  const condensed = condenseSmsNotification(trimmedMessage);
  const { text: redacted, findings } = redactWithFindings(condensed);
  const userPrompt = buildSmsUserPrompt({
    text: redacted,
    sender: userContext.sender ? redactSensitiveData(userContext.sender.trim()) : null,
    providerHint: userContext.providerHint,
  });
  const interpretContext = { providerHint: userContext.providerHint, cardLast4: findings.cardLast4 };

  const cacheKey = getCacheKey(userType, userId, userPrompt);
  const cached = aiParseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    log.info({ ...logBase, event: "sms.parse.cache_hit", length: redacted.length }, "Bank message parse served from cache");
    const { result } = interpretSmsReply(structuredClone(cached.reply), interpretContext);
    return { result, outcome: "cache_hit", skipped: false };
  }

  const { routes: candidates, source } = await smsRoutes(user.plan);
  if (candidates.length === 0) {
    log.warn({ ...logBase, event: "sms.ai.skipped", reason: "no_route" }, "No provider can read bank messages");
    return skip("no_route");
  }

  const estimatedInputTokens = estimateTokensFromText(userPrompt) + STATIC_PROMPT_TOKENS;
  let maxOutputTokens: number;
  try {
    const budget = await assertAiBudget(user, "sms", estimatedInputTokens);
    maxOutputTokens = Math.min(MAX_OUTPUT_TOKENS, clampOutputTokens(budget.perRequestMax, budget.remaining, estimatedInputTokens));
  } catch {
    log.info({ ...logBase, event: "sms.ai.skipped", reason: "budget" }, "Bank message model skipped: the plan budget refused it");
    return skip("budget");
  }

  const capUsd = Number(settings.sms_ai_daily_cost_cap_usd) || 0;
  const routes = await withinDailyCap(candidates, capUsd, { promptTokens: estimatedInputTokens, completionTokens: maxOutputTokens }).catch(
    (err) => {
      // A cap that cannot be checked is treated as reached: it exists to stop spending.
      log.warn({ err, event: "sms.ai.cap_unreadable" }, "Bank message cost cap could not be checked");
      return null;
    },
  );
  if (!routes) {
    log.info({ ...logBase, event: "sms.ai.skipped", reason: "cost_cap" }, "Bank message model skipped: the daily cost cap is reached");
    return skip("cost_cap");
  }

  let llm;
  try {
    llm = await executeLlmChain(routes, {
      systemPrompt: SMS_SYSTEM_PROMPT,
      userPrompt,
      maxOutputTokens,
      // Thinking tokens come out of the output cap on Gemini 3; reading one message needs none.
      lowThinking: true,
      temperature: 0,
      schema: SMS_REPLY_SCHEMA as unknown as StructuredSchema,
      timeoutMs: 8_000,
      deadlineMs: 15_000,
    });
  } catch (error) {
    const attempts = error instanceof LlmChainError ? error.attempts : [];
    recordModelCalls(user, "sms", attempts, { tokens: 0 });
    const spent = attempts.reduce((sum, attempt) => sum + (attempt.totalTokens ?? 0), 0);
    void trackAiTokens(user, spent, "sms", attempts[0]?.model);
    log.error(
      { ...logBase, event: "sms.parse.failed", source, attempts: attempts.map((a) => `${a.slug}:${a.failure ?? "ok"}`) },
      "Bank message parse failed",
    );
    return skip("failed");
  }

  // What the request cost, failovers included: on the ledger at each provider's price, and on the plan budget.
  recordModelCalls(user, "sms", llm.attempts, { model: llm.route.model, tokens: llm.attemptTotals.totalTokens, providerSlug: llm.route.slug });
  void trackAiTokens(user, llm.attemptTotals.totalTokens || llm.totalTokens, "sms", llm.route.model);

  const check = validateSmsReply(parseSmsReplyText(llm.text), redacted);
  const served = { ...logBase, source, provider: llm.route.slug, model: llm.route.model, latencyMs: llm.latencyMs, length: redacted.length };
  if (!check.ok) {
    log.warn({ ...served, event: "sms.ai.reply_rejected", problems: check.rejected }, "Bank message model reply discarded");
    return skip("invalid_reply");
  }

  const { verdict, result } = interpretSmsReply(check.reply, interpretContext);
  log.info({ ...served, event: "sms.ai.read", verdict, repaired: check.repaired }, "Bank message read by the model");
  if (verdict === "needs_review") return skip("needs_review");
  if (verdict === "transaction") setCacheEntry(cacheKey, check.reply);
  return { result, outcome: verdict === "not_transaction" ? "not_transaction" : "parsed", skipped: false };
}

/**
 * Maps SMS category + direction to a stored category, subcategory and type.
 * Works with both AI parser output and Rule-Based parser output.
 *
 * Every pair is one the category registry holds (it used to write "انستاباي وارد",
 * "سحب نقدي / ATM", "Apple Pay" and the merchant's name as subcategories), and cash
 * taken from an ATM is a transfer to your own pocket, not spending — counting it as
 * spending counted the same money twice once the cash was spent and recorded.
 */
export function mapSmsToExpenseCategory(result: {
  direction?: "incoming" | "outgoing" | null;
  category?: string;
  provider?: string;
  merchant?: string | null;
}): {
  category: string;
  subCategory: string;
  type: "income" | "expense" | "transfer";
} {
  const dir = result.direction;
  const cat = result.category || "unknown";
  const provider = result.provider || "Unknown";
  const type: "income" | "expense" = dir === "incoming" ? "income" : "expense";
  const rail = /InstaPay/i.test(provider)
    ? "انستاباي"
    : /Vodafone/i.test(provider)
      ? "فودافون كاش"
      : "تحويل بنكي";

  // ── INCOMING (money in) ──
  // Salary only when the message says salary; any other credit is income from a source
  // the message does not name. The rail (InstaPay, wallet) stays in the description.
  if (dir === "incoming") {
    if (cat === "income")
      return { category: "مرتب", subCategory: "مرتب أساسي", type: "income" };
    return { category: "دخل آخر", subCategory: "عام", type: "income" };
  }

  // ── OUTGOING (money out) ──
  switch (cat) {
    case "transfer":
      return { category: "تحويل", subCategory: rail, type };
    case "payment":
      // The merchant stays in the description; a card payment is not always shopping,
      // but "تسوق/عام" is the honest default until the merchant is classified.
      if (result.merchant) return { category: "تسوق", subCategory: "عام", type };
      return { category: "متنوعات", subCategory: "عام", type };
    case "bills":
      return { category: "فواتير", subCategory: "عام", type };
    case "withdrawal":
      return { category: "تحويل", subCategory: "سحب ATM", type: "transfer" };
    default:
      return { category: "متنوعات", subCategory: "عام", type };
  }
}
