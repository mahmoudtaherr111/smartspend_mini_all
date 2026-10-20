/**
 * Two views of a message, character for character the same length, with the position each character came from:
 * - `text`: digits in ASCII (Arabic-Indic and Persian too), the Arabic decimal and thousands separators as "." and
 *   ",", invisible direction marks, tatweel and diacritics gone, runs of spaces as one. Names and merchants are cut
 *   from this view, so "SAOOD MARKET" and "محمد" keep their letters.
 * - `fold`: the same, with Arabic letter variants folded (أ إ آ ٱ → ا, ى → ي, ة → ه, ؤ → و, ئ → ي) and Latin in lower
 *   case. Words are matched in this view only.
 * Nothing else is rewritten: "ج.م" and "netflix.com" stay as they are, which the readers of typed sentences do not
 * guarantee.
 */
import type { Span } from "./types";

export interface NormalizedMessage {
  original: string;
  text: string;
  fold: string;
  /** For each character of `text` (and `fold`), its index in `original`. */
  origin: number[];
}

// Diacritics are combining marks; each one is dropped on its own, so a class of them is what is meant.
// eslint-disable-next-line no-misleading-character-class
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF\u061C\u0640\u064B-\u065F\u0670]/;
const SPACE = /[ \t\u00A0\u2000-\u200A\u202F\u205F\u3000]/;
const FOLD: Record<string, string> = { "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ى": "ي", "ة": "ه", "ؤ": "و", "ئ": "ي" };

function asciiDigit(char: string): string {
  const code = char.charCodeAt(0);
  if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
  if (code >= 0x06f0 && code <= 0x06f9) return String(code - 0x06f0);
  if (char === "٫") return ".";
  if (char === "٬") return ",";
  return char;
}

function foldChar(char: string): string {
  const folded = FOLD[char];
  if (folded) return folded;
  const lower = char.toLowerCase();
  return lower.length === 1 ? lower : char;
}

export function normalizeMessage(original: string): NormalizedMessage {
  let text = "";
  let fold = "";
  const origin: number[] = [];
  const push = (char: string, at: number) => {
    text += char;
    fold += foldChar(char);
    origin.push(at);
  };
  for (let index = 0; index < original.length; index++) {
    const char = original[index];
    if (INVISIBLE.test(char)) continue;
    if (char === "\r" || char === "\n") {
      // One line break between lines, never at the start; a space before it is dropped.
      if (!text.length || text.endsWith("\n")) continue;
      if (text.endsWith(" ")) {
        text = text.slice(0, -1);
        fold = fold.slice(0, -1);
        origin.pop();
      }
      push("\n", index);
      continue;
    }
    if (SPACE.test(char)) {
      if (!text.length || text.endsWith(" ") || text.endsWith("\n")) continue;
      push(" ", index);
      continue;
    }
    push(asciiDigit(char), index);
  }
  while (text.endsWith(" ") || text.endsWith("\n")) {
    text = text.slice(0, -1);
    fold = fold.slice(0, -1);
    origin.pop();
  }
  return { original, text, fold, origin };
}

/** A span of the normalized view, reported with its positions and characters in the original message. */
export function spanOf(message: NormalizedMessage, start: number, end: number): Span {
  if (end <= start || start >= message.origin.length) return { start: 0, end: 0, text: "" };
  const from = message.origin[start];
  const to = message.origin[Math.min(end, message.origin.length) - 1] + 1;
  return { start: from, end: to, text: message.original.slice(from, to) };
}
