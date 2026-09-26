/**
 * One classifier for every channel that is not the entry form: the chat's "سجل عندك…", a
 * category the user names in a sentence, and the like. It runs the same local engine the
 * entry form runs (`runRuleEngine` on `normalizeV2` text), with the user's own dictionary, so
 * a sentence is filed the same way whichever screen it was typed into. It does not call a
 * model: callers that save show the result as a draft the user confirms.
 */
import { normalizeV2 } from "./normalizer-v2";
import { runRuleEngine } from "./rule-engine";

export interface ChannelClassification {
  category: string;
  subCategory: string;
  type: "income" | "expense" | "transfer" | "investment";
  direction?: "incoming" | "outgoing";
  confidence: number;
}

/**
 * The engine's answer for one sentence, or null when it found nothing better than the
 * catch-all. `amount` is added when the sentence has none, since the engine files amounts.
 */
export async function classifyText(
  text: string,
  options: { amount?: number; userDict?: Array<{ word: string; category: string; subCategory?: string }> } = {},
): Promise<ChannelClassification | null> {
  const trimmed = String(text || "").trim();
  if (!trimmed) return null;
  const withAmount = /[0-9٠-٩]/.test(trimmed) || !options.amount ? trimmed : `${trimmed} ${options.amount}`;
  const result = await runRuleEngine(normalizeV2(withAmount).forRules, options.userDict ?? []);
  const item = result.items[0];
  if (!item || item.category === "متنوعات") return null;
  return {
    category: item.category,
    subCategory: item.subCategory || "عام",
    type: item.type,
    direction: item.direction,
    confidence: item.confidence,
  };
}
