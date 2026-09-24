/**
 * Nouns whose category is fixed but whose DIRECTION — and therefore subcategory —
 * depends on the verb around them.
 *
 * The general rule this encodes: **the verb governs direction, the noun governs
 * category, and (noun × direction) selects the subcategory.**
 *
 * Without it the generic verb keyword wins the category outright. "قبضت الجمعية"
 * matched `قبض` → مرتب and "دفعت قسط الجمعية" matched `قسط` → فواتير, so the two
 * subcategory the registry provides for exactly this case — تحويل/جمعية, with its direction —
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
  /** Words that stop a standalone verb from implying the noun ("رجعلي الباقي" is change). */
  standaloneExclusions?: string[];
  /**
   * Words that make an outgoing payment something other than this movement: "دفعت قسط
   * القرض" and "دفعت فوائد القرض" pay a bank's installment and interest, which are
   * spending under أقساط وفوايد, not a loan handed to someone.
   */
  outExclusions?: string[];
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
    category: "تحويل",
    inVerbs: ["قبضت", "قبضنا", "قبض", "استلمت", "جالي", "جاتلي", "نزلت", "نزل", "وصلني", "خدت", "اخدت", "أخدت"],
    outVerbs: ["دفعت", "سددت", "سدد", "طلعت", "وديت", "حوشت", "عليا", "علينا", "قسط", "اقساط", "أقساط"],
    // A gam3eya is saving with friends: paying in and receiving are money moving between
    // your own pockets, not spending and not income. Both are transfers; the direction
    // says which way (docs/decisions/0008-money-movements-and-taxonomy.md).
    resolve: {
      in: { subCategory: "جمعية", type: "transfer" },
      out: { subCategory: "جمعية", type: "transfer" },
    },
    // Paying into a gam3eya is the far more frequent monthly event than receiving one.
    defaultDirection: "out",
    promptRule:
      'الجمعية: "قبضت/استلمت/جالي الجمعية" و"دفعت/سددت/عليا قسط الجمعية" = transfer → تحويل/جمعية ' +
      "(ادخار، مش صرف ولا دخل؛ الاتجاه من الفعل).",
  },
  {
    id: "debt",
    // "رجعت لمحمد الفلوس اللي عليا": what one owes is a debt even when no debt word is said.
    nouns: ["سلفة", "سلفه", "سلف", "دين", "ديون", "قرض", "قروض", "اللي عليا", "اللي علينا", "اللي عليه", "اللي عليها", "اللي ليا عنده", "اللي ليا عندها"],
    // "رجعلي" alone is a loan paid back ("مروان رجعلي فلوسي الفين") — except the change a
    // shop hands back ("رجعلي الباقي"), which `standaloneExclusions` keeps out.
    standaloneVerbs: ["استلفت", "اتسلفت", "اقترضت", "سلفت", "سلفته", "سلفتها", "رجعلي", "رجعولي", "رجعتلي"],
    standaloneExclusions: ["الباقي", "باقي", "الفكه", "فكه", "المرتجع", "مرتجع"],
    outExclusions: ["قسط", "القسط", "اقساط", "أقساط", "فوائد", "فوايد", "فايدة", "فايده", "بنك", "البنك", "للبنك"],
    category: "تحويل",
    inVerbs: ["استلفت", "اتسلفت", "اقترضت", "خدت", "اخدت", "أخدت", "رجعلي", "رجعولي", "سددلي", "صفالي"],
    outVerbs: ["سلفت", "سلفته", "اديت", "أديت", "وديت", "سددت", "رجعت", "صفيت", "دفعت"],
    // A loan comes back, so it is neither spending nor income: lending and borrowing are
    // transfers, and `direction` carries which way the money moved ("سلفت سيف" out,
    // "استلفت من محمود" in). The person goes to the contact, not to the category.
    resolve: {
      in: { subCategory: "دين/سلفة", type: "transfer" },
      out: { subCategory: "دين/سلفة", type: "transfer" },
    },
    defaultDirection: "out",
    promptRule:
      '"سلفت فلان" و"رجعت لفلان" = transfer صادر، "استلفت من فلان" و"فلان رجعلي" = transfer وارد — ' +
      "الفئة تحويل/دين/سلفة، والشخص في خانته.",
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
    const excluded = entry.standaloneExclusions
      ? findMatchingWord(text, entry.standaloneExclusions, tokens) !== undefined
      : false;
    const matchedNoun =
      findMatchingWord(text, entry.nouns, tokens) ??
      (entry.standaloneVerbs && !excluded ? findMatchingWord(text, entry.standaloneVerbs, tokens) : undefined);
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

    if (direction === "out" && entry.outExclusions && findMatchingWord(text, entry.outExclusions, tokens)) {
      continue;
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
