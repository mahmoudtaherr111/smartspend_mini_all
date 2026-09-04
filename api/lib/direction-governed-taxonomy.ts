/**
 * Nouns whose category is fixed but whose DIRECTION — and therefore subcategory —
 * depends on the verb around them.
 *
 * The general rule this encodes: **the verb governs direction, the noun governs
 * category, and (noun × direction) selects the subcategory.**
 *
 * Without it the generic verb keyword wins the category outright. "قبضت الجمعية"
 * matched `قبض` → مرتب and "دفعت قسط الجمعية" matched `قسط` → فواتير, so the two
 * subcategories the registry provides for exactly this case — قبض جمعية and قسط جمعية —
 * were unreachable, and a gam3eya payout was filed as salary.
 *
 * One table, read by the rule engine and by the classifier prompt, so the two can no
 * longer contradict each other: the prompt used to assert that الجمعية is income in one
 * line and a transfer three lines later.
 */
import type { TransactionIntent } from "./intent-detector";
import { buildTokenSet, findMatchingWord } from "./arabic-token-match";

export type GovernedDirection = "in" | "out";

export interface GovernedResolution {
  /** Which family matched — callers treat the debt family differently from gam3eya. */
  id: string;
  category: string;
  subCategory: string;
  type: TransactionIntent;
  direction: GovernedDirection;
  /** The noun that decided the category, for tracing. */
  matchedNoun: string;
  /** The verb that decided the direction, when one was found. */
  matchedVerb: string | null;
}

interface GovernedEntry {
  id: string;
  nouns: string[];
  /**
   * Verbs that imply the noun on their own. "استلفت من مروان" never says the word
   * سلفة, but it is unambiguously a loan. Only verbs with no other reading belong
   * here — اديت and دفعت are excluded because they are ordinary spending.
   */
  standaloneVerbs?: string[];
  category: string;
  inVerbs: string[];
  outVerbs: string[];
  resolve: Record<GovernedDirection, { subCategory: string; type: TransactionIntent }>;
  defaultDirection: GovernedDirection;
  /** One line for the prompt, generated from the same data the engine uses. */
  promptRule: string;
}

const ENTRIES: GovernedEntry[] = [
  {
    id: "gam3eya",
    nouns: ["جمعية", "جمعيه", "الجمعية", "الجمعيه", "جمعيتي", "جمعيات"],
    category: "التزامات وجمعيات",
    inVerbs: ["قبضت", "قبضنا", "قبض", "استلمت", "جالي", "جاتلي", "نزلت", "نزل", "وصلني", "خدت", "اخدت", "أخدت"],
    outVerbs: ["دفعت", "سددت", "سدد", "طلعت", "وديت", "حوشت", "عليا", "علينا", "قسط", "اقساط", "أقساط"],
    resolve: {
      in: { subCategory: "قبض جمعية", type: "income" },
      out: { subCategory: "قسط جمعية", type: "expense" },
    },
    // Paying into a gam3eya is the far more frequent monthly event than receiving one.
    defaultDirection: "out",
    promptRule:
      'الجمعية: "قبضت/استلمت/جالي الجمعية" = income → التزامات وجمعيات/قبض جمعية. ' +
      '"دفعت/سددت/عليا قسط الجمعية" = expense → التزامات وجمعيات/قسط جمعية.',
  },
  {
    id: "debt",
    nouns: ["سلفة", "سلفه", "سلف", "دين", "ديون", "قرض", "قروض"],
    standaloneVerbs: ["استلفت", "اتسلفت", "اقترضت", "سلفت", "سلفته", "سلفتها"],
    category: "تحويل",
    inVerbs: ["استلفت", "اتسلفت", "اقترضت", "خدت", "اخدت", "أخدت", "رجعلي", "رجعولي", "سددلي", "صفالي"],
    outVerbs: ["سلفت", "سلفته", "اديت", "أديت", "وديت", "سددت", "رجعت", "صفيت", "دفعت"],
    // Both directions share one taxonomy slot — the registry has a single debt
    // subcategory — but they are opposite money movements, so they cannot share a type.
    // They used to: both resolved to `transfer`, which made "سلفت سيف" (money out) and
    // "استلفت من محمود" (money in) indistinguishable to the wallet, the charts and the
    // benchmark alike. The comment claimed direction was "carried by type" while type
    // was the one field that did not carry it.
    resolve: {
      in: { subCategory: "دين/سلفة", type: "income" },
      out: { subCategory: "دين/سلفة", type: "expense" },
    },
    defaultDirection: "out",
    promptRule:
      '"سلفت فلان" = صادر (expense), "استلفت من فلان" = وارد (income), ' +
      '"فلان رجعلي" = وارد, "رجعت لفلان" = صادر — الفئة تحويل/دين/سلفة، ' +
      "أو فئة الشخص نفسه لو كان معروفاً.",
  },
];

/** Verbs that only ever appear as borrowing, so they beat a lending verb in the same text. */
const STRONG_IN_OVERRIDE = ["استلفت", "اتسلفت", "اقترضت", "رجعلي", "رجعولي", "سددلي", "صفالي"];

/**
 * Resolve a segment against the governed nouns.
 * Returns null when no governed noun is present, which is the common case.
 */
export function resolveGovernedTaxonomy(text: string): GovernedResolution | null {
  if (!text) return null;

  const tokens = buildTokenSet(text);

  for (const entry of ENTRIES) {
    const matchedNoun =
      findMatchingWord(text, entry.nouns, tokens) ??
      (entry.standaloneVerbs ? findMatchingWord(text, entry.standaloneVerbs, tokens) : undefined);
    if (!matchedNoun) continue;

    const strongIn = findMatchingWord(text, STRONG_IN_OVERRIDE, tokens) ?? null;
    const inVerb = strongIn ?? findMatchingWord(text, entry.inVerbs, tokens) ?? null;
    const outVerb = findMatchingWord(text, entry.outVerbs, tokens) ?? null;

    let direction: GovernedDirection;
    let matchedVerb: string | null;
    if (strongIn) {
      direction = "in";
      matchedVerb = strongIn;
    } else if (inVerb && !outVerb) {
      direction = "in";
      matchedVerb = inVerb;
    } else if (outVerb && !inVerb) {
      direction = "out";
      matchedVerb = outVerb;
    } else if (inVerb && outVerb) {
      // Both present: the earlier verb governs, since it is the one attached to the noun
      // in "قبضت الجمعية ودفعت قسط".
      direction = text.indexOf(inVerb) < text.indexOf(outVerb) ? "in" : "out";
      matchedVerb = direction === "in" ? inVerb : outVerb;
    } else {
      direction = entry.defaultDirection;
      matchedVerb = null;
    }

    const resolved = entry.resolve[direction];
    return {
      id: entry.id,
      category: entry.category,
      subCategory: resolved.subCategory,
      type: resolved.type,
      direction,
      matchedNoun,
      matchedVerb,
    };
  }

  return null;
}

/**
 * The direction rules as prompt text, generated from the table above rather than
 * hand-written, so the prompt cannot drift from what the engine actually does.
 */
export function buildDirectionRulesBlock(): string {
  return ENTRIES.map((e) => `- ${e.promptRule}`).join("\n");
}

/** Exposed for tests and tooling. */
export function governedNouns(): string[] {
  return ENTRIES.flatMap((e) => e.nouns);
}
