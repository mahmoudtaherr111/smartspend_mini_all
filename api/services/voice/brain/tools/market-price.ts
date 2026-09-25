/**
 * market_price: today's gold or currency price in Egypt, looked up once for everyone every 30 minutes with a text
 * model and Google Search, checked against sane bounds, and handed to the call as a fact with its source and time
 * (so the spoken-number check knows where the number came from). A price is information, never investment advice.
 * The caller is waiting on the line: a fast model first (`voice_price_model`), the next one after five seconds, and
 * nine seconds in all.
 */
import { recordAiLedger } from "../../../../lib/ai-ledger";
import { businessTimeLabel } from "../../../../lib/app-time";
import { cacheGet, cacheSet } from "../../../../lib/redis-client";
import type { ToolRunOutcome } from "../../gateway/call-session";
import { textModelCostUsd } from "../../gateway/pricing";
import { askTextModel } from "../../text-model";
import { type ToolContext, type VoiceTool } from "./types";

const ASSETS = {
  gold_24k: { ask: "سعر جرام الدهب عيار 24 في مصر النهارده بالجنيه", title: "دهب عيار 24", unit: "جنيه للجرام", min: 1_000, max: 40_000 },
  gold_21k: { ask: "سعر جرام الدهب عيار 21 في مصر النهارده بالجنيه", title: "دهب عيار 21", unit: "جنيه للجرام", min: 800, max: 35_000 },
  gold_18k: { ask: "سعر جرام الدهب عيار 18 في مصر النهارده بالجنيه", title: "دهب عيار 18", unit: "جنيه للجرام", min: 700, max: 30_000 },
  usd: { ask: "سعر الدولار الأمريكي في البنوك المصرية النهارده بالجنيه", title: "الدولار", unit: "جنيه", min: 20, max: 200 },
  eur: { ask: "سعر اليورو في البنوك المصرية النهارده بالجنيه", title: "اليورو", unit: "جنيه", min: 20, max: 250 },
  sar: { ask: "سعر الريال السعودي في البنوك المصرية النهارده بالجنيه", title: "الريال السعودي", unit: "جنيه", min: 5, max: 60 },
} as const;
type Asset = keyof typeof ASSETS;

interface Quote {
  value: number;
  source: string;
  asOf: string;
}

const TTL_SECONDS = 30 * 60;

/** The quote, or null when no model found a believable one, and what asking cost. */
export async function lookup(
  asset: Asset,
  now = new Date(),
): Promise<{ quote: Quote | null; costUsd: number; usage: { model: string; inputTokens: number; outputTokens: number } }> {
  const answer = await askTextModel({
    modelSetting: "voice_price_model",
    defaultModel: "gemini-3.5-flash-lite",
    prompt: `${ASSETS[asset].ask}. رد بسطر JSON بس: {"value": رقم, "source": "اسم الموقع", "as_of": "التاريخ والوقت"}`,
    search: true,
    temperature: 0,
    timeoutMs: 5_000,
    deadlineMs: 9_000,
  });
  const costUsd = textModelCostUsd(answer.model, answer.inputTokens, answer.outputTokens);
  return {
    quote: readQuote(asset, answer.text, answer.webSource, now),
    costUsd,
    usage: { model: answer.model, inputTokens: answer.inputTokens, outputTokens: answer.outputTokens },
  };
}

function readQuote(asset: Asset, text: string, webSource: string | undefined, now: Date): Quote | null {
  const match = text.match(/\{[^{}]*\}/);
  if (!match) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  const value = Number(parsed.value);
  const bounds = ASSETS[asset];
  if (!Number.isFinite(value) || value < bounds.min || value > bounds.max) return null;
  return {
    value,
    source: String(parsed.source || webSource || "بحث جوجل").slice(0, 80),
    // Without a time from the source, the time it was looked up, on Cairo's clock (golden rule 6).
    asOf: String(parsed.as_of || businessTimeLabel(now)).slice(0, 40),
  };
}

async function run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolRunOutcome> {
  const asset = (Object.hasOwn(ASSETS, String(args.asset)) ? String(args.asset) : "gold_21k") as Asset;
  const cacheKey = `voice:price:${asset}`;
  let quote: Quote | null = null;
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      quote = JSON.parse(cached) as Quote;
    } catch {
      quote = null;
    }
  }
  // A cached price costs nothing; a lookup's cost counts toward this call.
  let costUsd = 0;
  if (!quote) {
    const found = await lookup(asset).catch(() => null);
    quote = found?.quote ?? null;
    costUsd = found?.costUsd ?? 0;
    if (found) {
      void recordAiLedger({
        userId: ctx.identity.userId,
        userType: ctx.identity.userType,
        channel: "voice_price",
        providerSlug: "gemini",
        modelId: found.usage.model,
        promptTokens: found.usage.inputTokens,
        completionTokens: found.usage.outputTokens,
      });
    }
    if (quote) await cacheSet(cacheKey, TTL_SECONDS, JSON.stringify(quote));
  }
  if (!quote) {
    return { costUsd, response: { ok: false, error: "price_unavailable", say: "قول إنك مش قادر توصل للسعر دلوقتي، ومتخمنش رقم." } };
  }
  const info = ASSETS[asset];
  ctx.ledger.nextBatch();
  const fact = ctx.ledger.add({ id: `price_${asset}`, label: `سعر ${info.title}`, value: quote.value, source: "price" });
  return {
    costUsd,
    response: {
      ok: true,
      asset: info.title,
      say_value: fact.say,
      unit: info.unit,
      source: quote.source,
      as_of: quote.asOf,
      say: "قول السعر والمصدر والوقت. ده سعر للمعلومة، متقولش يشتري ولا يبيع.",
    },
    card: { kind: "price", title: info.title, value: quote.value, unit: info.unit, source: quote.source, asOf: quote.asOf },
  };
}

export const marketPriceTool: VoiceTool = {
  declaration: {
    name: "market_price",
    description: "Today's gold or currency price in Egypt, with its source and time.",
    parameters: {
      type: "object",
      properties: { asset: { type: "string", enum: Object.keys(ASSETS) } },
      required: ["asset"],
    },
  },
  run,
};
