/**
 * market_price: today's gold or currency price in Egypt, looked up once for everyone every 30 minutes with a text
 * model and Google Search, checked against sane bounds, and handed to the call as a fact with its source and time
 * (so the spoken-number check knows where the number came from). A price is information, never investment advice.
 */
import { env } from "../../../../lib/env";
import { mapModelName } from "../../../../lib/model-mapper";
import { cacheGet, cacheSet } from "../../../../lib/redis-client";
import { getSystemSettings } from "../../../../lib/settings-cache";
import type { ToolRunOutcome } from "../../gateway/call-session";
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

async function lookup(asset: Asset): Promise<Quote | null> {
  const settings = await getSystemSettings();
  const key = settings.ai_api_key || env.GEMINI_API_KEY || settings.ai_api_key_2;
  if (!key) return null;
  const model = mapModelName(settings.voice_price_model || "gemini-3.8-flash");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    signal: AbortSignal.timeout(12_000),
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${ASSETS[asset].ask}. رد بسطر JSON بس: {"value": رقم, "source": "اسم الموقع", "as_of": "التاريخ والوقت"}` }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0 },
    }),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: { groundingChunks?: Array<{ web?: { title?: string; uri?: string } }> };
    }>;
  };
  const candidate = body.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((part) => part.text ?? "").join("");
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
  const web = candidate?.groundingMetadata?.groundingChunks?.find((chunk) => chunk.web?.title)?.web;
  return {
    value,
    source: String(parsed.source || web?.title || "بحث جوجل").slice(0, 80),
    asOf: String(parsed.as_of || new Date().toISOString().slice(0, 16)).slice(0, 40),
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
  if (!quote) {
    quote = await lookup(asset).catch(() => null);
    if (quote) await cacheSet(cacheKey, TTL_SECONDS, JSON.stringify(quote));
  }
  if (!quote) {
    return { response: { ok: false, error: "price_unavailable", say: "قول إنك مش قادر توصل للسعر دلوقتي، ومتخمنش رقم." } };
  }
  const info = ASSETS[asset];
  ctx.ledger.nextBatch();
  const fact = ctx.ledger.add({ id: `price_${asset}`, label: `سعر ${info.title}`, value: quote.value, source: "price" });
  return {
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
