/**
 * The words that confirm an action which cannot be taken back.
 *
 * They are not a secret — the card shows them — but typing them is a deliberate act, where a tap or "تمام"
 * confirms anything medium. `confirmAction` checks them, so no channel (a card, a typed reply, a call) can run a
 * high-risk action without them; the chat reads the same list to recognise them in a typed reply. Adding an action
 * that cannot be undone means adding its phrase here and marking it high in `actionRisk`.
 */
import type { ActionDraft } from "../ai-kernel/types";
import type { RuntimeActionName } from "./types";

const CONFIRMATION_PHRASES: Partial<Record<RuntimeActionName, string>> = {
  "goal.stop": "أوقف الهدف",
  "action.undo": "تراجع عن العملية",
};
const DEFAULT_HIGH_RISK_PHRASE = "أكد العملية";

/** Every phrase a high-risk action can ask for. */
export const HIGH_RISK_CONFIRMATION_PHRASES: readonly string[] = [
  ...new Set([...Object.values(CONFIRMATION_PHRASES), DEFAULT_HIGH_RISK_PHRASE]),
];

/** How a typed confirmation is compared: diacritics, hamza, ya, ta marbuta, punctuation and spacing do not count. */
export function normalizeConfirmation(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[«»"'؟?،,.!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The phrase a high-risk action needs, or undefined when a plain confirmation is enough. */
export function confirmationPhraseFor(
  actionName: RuntimeActionName,
  risk: ActionDraft["risk"],
): string | undefined {
  if (risk !== "high") return undefined;
  return CONFIRMATION_PHRASES[actionName] ?? DEFAULT_HIGH_RISK_PHRASE;
}

export function matchesConfirmationPhrase(given: string | undefined, expected: string): boolean {
  return given !== undefined && normalizeConfirmation(given) === normalizeConfirmation(expected);
}
