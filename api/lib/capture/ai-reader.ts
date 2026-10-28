/**
 * Layer two of capture: the model that reads one bank or wallet message the reader (api/lib/capture/reader/) could
 * not read with confidence (decisions 0025 and 0026). Nothing calls it yet; the new intake will, for `unsure` readings.
 *
 * It goes through the providers the admin configured for the `sms` purpose (any OpenAI-compatible endpoint such as
 * OpenRouter, or Gemini), and only through them: a bank message is never sent to a built-in provider the admin did
 * not choose. Until the admin configures one, `GEMINI_API_KEY` with `mapModelName("flash")` answers (temporary).
 *
 * Before any call: the admin's switch (`sms_ai_enabled`), the user's plan budget (`assertAiBudget`, channel `sms`) and
 * the global daily cost cap in USD (`sms_ai_daily_cost_cap_usd`). The text is condensed and redacted
 * (api/lib/anonymizer.ts), and one call carries one message of one user. The reply is checked by
 * api/lib/sms-ai-contract.ts. When the model is not asked, or its reply is discarded, the result says why.
 */
import { env } from "../env";
import { mapModelName } from "../model-mapper";
import { createLogger } from "../log";
import { ledgerCostUsdSince, recordModelCalls } from "../ai-ledger";
import { executeLlmChain, LlmChainError, type LlmRoute, type StructuredSchema } from "../llm-router";
import { buildProviderChain } from "../llm-provider-chain";
import { resolveAdminRoutes } from "../ai-gateway";
import { asPlan, assertAiBudget, clampOutputTokens, estimateTokensFromText, trackAiTokens } from "../ai-usage-policy";
import { getSystemSettings } from "../settings-cache";
import { costAtRates, ratesFor, type ModelRates } from "../ai-pricing";
import { businessDayRange } from "../app-time";
import { redactSensitiveData, redactWithFindings } from "../anonymizer";
import { redactKeeping } from "./keep-merchants";
import {
  SMS_PROMPT_VERSION,
  SMS_REPLY_SCHEMA,
  SMS_SYSTEM_PROMPT,
  buildSmsUserPrompt,
  interpretSmsReply,
  parseSmsReplyText,
  validateSmsReply,
  type SmsModelReply,
  type SmsParseResult,
  type SmsReplyVerdict,
} from "../sms-ai-contract";

// A bank message is someone's balance and payees: log its length, never its text (golden rule 10).
const log = createLogger("capture-ai-reader");

export type AiReaderUser = {
  userId?: number | null;
  userType?: string | null;
  /** The user's plan: which admin route serves the call, and whose budget pays for it. */
  plan?: string | null;
  /** The sender the phone reported, redacted before the model sees it. */
  sender?: string | null;
  /** The provider already recognised, passed through when the model's answer does not name one. */
  providerHint?: SmsParseResult["provider"] | null;
  /** Merchant names to keep through redaction (api/lib/capture/keep-merchants.ts, decision 0035). */
  keepNames?: string[];
};

/**
 * What happened:
 *   - parsed / cache_hit: a checked reply that reads a transaction;
 *   - not_transaction: a checked reply that reads no ledger movement (declined, a hold, a code, an offer, a
 *     statement, a balance);
 *   - needs_review: a checked reply with a foreign amount and no EGP equivalent in the text;
 *   - everything else: the model was not asked, or its reply is not used (`skipped`).
 */
export type AiReaderOutcome =
  | "parsed"
  | "cache_hit"
  | "not_transaction"
  | "needs_review"
  | "empty"
  | "no_user"
  | "disabled"
  | "no_route"
  | "budget"
  | "cost_cap"
  | "failed"
  | "invalid_reply";

export interface AiReading {
  /** The reply that passed the contract, when there is one (also for `needs_review`). */
  reply: SmsModelReply | null;
  /** The reply in the ledger's terms; null when nothing is to be used. */
  result: SmsParseResult | null;
  verdict: SmsReplyVerdict | null;
  outcome: AiReaderOutcome;
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
const replyCache = new Map<string, { reply: SmsModelReply; expiresAt: number }>();
const CACHE_TTL = 15 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

/** Everything the answer depends on: the user, the prompt version and the exact prompt the model would see. */
function cacheKey(userType: string, userId: number, userPrompt: string): string {
  return `${SMS_PROMPT_VERSION}:${userType}:${userId}:${userPrompt}`;
}

function setCacheEntry(key: string, reply: SmsModelReply): void {
  if (replyCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = replyCache.keys().next().value;
    if (oldestKey !== undefined) replyCache.delete(oldestKey);
  }
  replyCache.set(key, { reply: structuredClone(reply), expiresAt: Date.now() + CACHE_TTL });
}

export function clearAiReaderCache(): void {
  replyCache.clear();
}

const skip = (outcome: AiReaderOutcome): AiReading => ({ reply: null, result: null, verdict: null, outcome, skipped: true });

// ── Condensing ──

/** Zero-width and direction marks, line breaks and repeated spaces collapsed; Arabic-Indic digits as ASCII. */
export function cleanMessageText(text: string): string {
  if (!text) return "";
  let n = text;
  n = n.replace(/[\u200B-\u200F\uFEFF\u202A-\u202E\u00A0]/g, " ");
  n = n.replace(/[\r\n\t]+/g, " ");
  n = n.replace(/\s+/g, " ");
  n = n.replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  return n.trim();
}

/**
 * The message without its boilerplate (greetings, hotlines, links, app promotions, security warnings, terms and
 * sign-offs), so the model is paid for the financial part only. Amounts, cards, merchants, dates, balances, fees and
 * references stay; when condensing loses every digit or nearly everything, the cleaned text is used as it is.
 */
export function condenseMessage(raw: string): string {
  if (!raw || typeof raw !== "string") return "";

  const cleaned = cleanMessageText(raw);
  if (cleaned.length < 15) return cleaned;

  let condensed = cleaned;

  // Greetings
  condensed = condensed.replace(
    /(?:^|[.,!\n])\s*(?:عزيزي\s+العميل|عميلنا\s+العزيز|أهلاً\s+بك|اهلا\s+بك|مرحباً\s+بك|مرحبا\s+بك|عميلنا\s+المميز|dear\s+(?:valued\s+)?customer|hello|hi)[،,\s-]*/gi,
    " ",
  );

  // Customer service hotlines
  condensed = condensed.replace(
    /(?:ل(?:ل)?استفسار(?:\s+أو\s+المساعدة)?(?:\s+اتصل\s+(?:على|بـ?))?|للمزيد\s+من\s+المعلومات|خدمة\s+العملاء|لخدمة\s+العملاء|للمساعدة|للاتصال|اتصل\s+(?:على|بـ?)|call(?:\s+us)?(?:\s+at)?|hotline|customer\s+(?:service|care)|for\s+(?:inquiries|assistance|support|more\s+info)\s+call)[\s:]*(?:19\d{3}|16\d{3}|15\d{3}|\d{4,6}|\+\d{10,14})[.,!\s]*/gi,
    " ",
  );

  // Links
  condensed = condensed.replace(/(?:https?:\/\/|www\.)[^\s]+/gi, " ");

  // Promotions
  condensed = condensed.replace(
    /(?:استمتع\s+بـ?(?:أحدث\s+)?(?:عروض|خصومات)|حمل\s+تطبيق(?:نا)?|عروض\s+حصرية|وفر\s+أكتر\s+مع|download\s+(?:our\s+)?app|enjoy\s+(?:special\s+)?(?:offers|discounts|cashback)|visit\s+our\s+website)[^.,!\n]*(?:[.,!\n]|$)/gi,
    " ",
  );

  // Security warnings, unless the message is the code itself
  const isOtpOnly = /(?:كود\s+تفعيل|رمز\s+التحقق|otp\s+code|verification\s+code\s+is)/i.test(cleaned);
  if (!isOtpOnly) {
    condensed = condensed.replace(
      /(?:تنبيه(?:\s+أمني)?|تحذير|warning|security\s+alert)[\s:]*(?:لا\s+تشارك|احذر\s+مشاركة|never\s+share|do\s+not\s+share)[^.,!\n]*(?:[.,!\n]|$)/gi,
      " ",
    );
    condensed = condensed.replace(
      /(?:البنك\s+لن\s+يطلب\s+منك|the\s+bank\s+will\s+never\s+ask)[^.,!\n]*(?:[.,!\n]|$)/gi,
      " ",
    );
  }

  // Terms and sign-offs
  condensed = condensed.replace(
    /(?:تطبق\s+الشروط\s+و(?:ال)?أحكام|terms\s+(?:and|&)\s+conditions\s+apply|t&c\s+apply|شكراً\s+لتعاملك\s+معنا|thank\s+you\s+for\s+banking\s+with\s+us|thank\s+you\s+for\s+using\s+our\s+services)[.,!\s]*/gi,
    " ",
  );

  condensed = condensed
    .replace(/\s+/g, " ")
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, "")
    .trim();

  const originalDigits = (cleaned.match(/\d+/g) || []).join("");
  const condensedDigits = (condensed.match(/\d+/g) || []).join("");
  if (condensed.length < 10 || (originalDigits.length > 0 && condensedDigits.length === 0)) return cleaned;
  return condensed;
}

// ── Routes and cap ──

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

// ── The call ──

/** Reads one message of one user with the admin's model, or says why the model was not asked or not believed. */
export async function readMessageWithModel(message: string, user: AiReaderUser = {}): Promise<AiReading> {
  const trimmed = message.trim();
  if (!trimmed) return skip("empty");

  const userId = user.userId;
  const userType: "oauth" | "local" | null = user.userType === "oauth" || user.userType === "local" ? user.userType : null;
  // A call is paid from one user's budget; without a user there is no budget to check.
  if (!userId || !userType) return skip("no_user");
  const caller = { id: userId, type: userType, plan: asPlan(user.plan ?? undefined) };
  const logBase = { userId, userType, promptVersion: SMS_PROMPT_VERSION };

  const settings = await getSystemSettings().catch(() => ({}) as Record<string, string>);
  if (settings.sms_ai_enabled === "false") {
    log.info({ ...logBase, event: "sms.ai.skipped", reason: "disabled" }, "Bank message model is switched off");
    return skip("disabled");
  }

  // Condensed, then redacted: the model never sees a card, account, phone, reference or name.
  const condensed = condenseMessage(trimmed);
  const { text: redacted, findings } = user.keepNames?.length ? redactKeeping(condensed, user.keepNames) : redactWithFindings(condensed);
  const userPrompt = buildSmsUserPrompt({
    text: redacted,
    sender: user.sender ? redactSensitiveData(user.sender.trim()) : null,
    providerHint: user.providerHint,
  });
  const interpretContext = { providerHint: user.providerHint, cardLast4: findings.cardLast4 };

  const key = cacheKey(userType, userId, userPrompt);
  const cached = replyCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    log.info({ ...logBase, event: "sms.parse.cache_hit", length: redacted.length }, "Bank message read served from cache");
    const reply = structuredClone(cached.reply);
    const { verdict, result } = interpretSmsReply(reply, interpretContext);
    return { reply, result, verdict, outcome: "cache_hit", skipped: false };
  }

  const { routes: candidates, source } = await smsRoutes(caller.plan);
  if (candidates.length === 0) {
    log.warn({ ...logBase, event: "sms.ai.skipped", reason: "no_route" }, "No provider can read bank messages");
    return skip("no_route");
  }

  const estimatedInputTokens = estimateTokensFromText(userPrompt) + STATIC_PROMPT_TOKENS;
  let maxOutputTokens: number;
  try {
    const budget = await assertAiBudget(caller, "sms", estimatedInputTokens);
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
    recordModelCalls(caller, "sms", attempts, { tokens: 0 });
    const spent = attempts.reduce((sum, attempt) => sum + (attempt.totalTokens ?? 0), 0);
    void trackAiTokens(caller, spent, "sms", attempts[0]?.model);
    log.error(
      { ...logBase, event: "sms.parse.failed", source, attempts: attempts.map((a) => `${a.slug}:${a.failure ?? "ok"}`) },
      "Bank message read failed",
    );
    return skip("failed");
  }

  // What the request cost, failovers included: on the ledger at each provider's price, and on the plan budget.
  recordModelCalls(caller, "sms", llm.attempts, { model: llm.route.model, tokens: llm.attemptTotals.totalTokens, providerSlug: llm.route.slug });
  void trackAiTokens(caller, llm.attemptTotals.totalTokens || llm.totalTokens, "sms", llm.route.model);

  const check = validateSmsReply(parseSmsReplyText(llm.text), redacted);
  const served = { ...logBase, source, provider: llm.route.slug, model: llm.route.model, latencyMs: llm.latencyMs, length: redacted.length };
  if (!check.ok) {
    log.warn({ ...served, event: "sms.ai.reply_rejected", problems: check.rejected }, "Bank message model reply discarded");
    return skip("invalid_reply");
  }

  const { verdict, result } = interpretSmsReply(check.reply, interpretContext);
  log.info({ ...served, event: "sms.ai.read", verdict, repaired: check.repaired }, "Bank message read by the model");
  if (verdict === "needs_review") return { reply: check.reply, result: null, verdict, outcome: "needs_review", skipped: true };
  if (verdict === "transaction") setCacheEntry(key, check.reply);
  return {
    reply: check.reply,
    result,
    verdict,
    outcome: verdict === "not_transaction" ? "not_transaction" : "parsed",
    skipped: false,
  };
}
