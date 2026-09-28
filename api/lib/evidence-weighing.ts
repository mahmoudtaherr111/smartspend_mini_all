/**
 * Weighs every clue in a clause instead of letting the first layer that matched decide.
 *
 * The rule engine tries its layers in a fixed order and stops at the first hit, so it
 * never saw that a sentence held two readings: "اشتريت هدوم من سبينيس" is clothes bought
 * at a supermarket, and "رايح الشغل دفعت 30 مواصلات" names its category outright while
 * "الشغل" (work) matched first. This pass collects what every word of the clause says,
 * from every lexicon source, and weighs it:
 *
 * - a word that is itself a category name ("مواصلات") is the strongest purpose clue;
 * - a purpose word (a thing bought, a service) outranks the store it was bought at;
 * - two readings of equal weight are a genuine doubt, recorded as disagreement so the
 *   item is confirmed or sent to the model with both readings, never guessed in silence.
 *
 * Kinship, payment rails and the catch-alls do not vote here: they say to whom and how
 * money moved, not what for, and the engine holds them separately.
 */
import { CATEGORIES } from "./category-registry";
import { normalizeArabic, stripArabicPrefix } from "./fuzzy-match";
import { CATEGORY_DICTIONARY } from "./lexicon/dictionary";
import { findCatalogMerchant } from "./lexicon/index";
import { AMBIGUOUS_MERCHANTS, MERCHANT_REGISTRY } from "./lexicon/merchants";
import { SUB_CATEGORY_MAP } from "./lexicon/subcategory-words";

export type ClueKind = "category_name" | "purpose" | "store";

export interface Clue {
  word: string;
  category: string;
  subCategory: string;
  kind: ClueKind;
  weight: number;
}

const WEIGHT: Record<ClueKind, number> = { category_name: 3, purpose: 1, store: 0.6 };

/** Say who or how, not what for. */
const NON_PURPOSE = new Set(["تحويل", "متنوعات", "العائلة", "أصدقاء", "موظفين", "دخل آخر"]);

/** Category names that are also everyday words ("عمل غريب" is not the work category). */
const EVERYDAY_NAMES = new Set(["عمل"]);

const CATEGORY_NAMES = new Map<string, string>(
  CATEGORIES.filter((category) => !EVERYDAY_NAMES.has(category.name_ar))
    .map((category) => [normalizeArabic(category.name_ar).toLowerCase(), category.name_ar]),
);

function variants(word: string): string[] {
  const normalized = normalizeArabic(word).toLowerCase();
  const once = stripArabicPrefix(normalized);
  return [...new Set([normalized, once, stripArabicPrefix(once)])];
}

/** Every category clue the words of the clause give, one per word, strongest reading. */
export function collectClues(text: string): Clue[] {
  const words = String(text || "")
    .split(/\s+/)
    .map((word) => word.replace(/^[^؀-ۿa-zA-Z]+|[^؀-ۿa-zA-Z]+$/g, ""))
    .filter((word) => word.length >= 2);
  const clues: Clue[] = [];
  const push = (clue: Omit<Clue, "weight">) => {
    if (NON_PURPOSE.has(clue.category)) return;
    clues.push({ ...clue, weight: WEIGHT[clue.kind] });
  };

  for (let i = 0; i < words.length; i++) {
    const forms = variants(words[i]);
    const pair = i + 1 < words.length ? normalizeArabic(`${words[i]} ${words[i + 1]}`).toLowerCase() : "";

    const name = forms.map((form) => CATEGORY_NAMES.get(form)).find(Boolean);
    if (name) {
      push({ word: words[i], category: name, subCategory: "عام", kind: "category_name" });
      continue;
    }
    const store = forms.find((form) => MERCHANT_REGISTRY[form] && !AMBIGUOUS_MERCHANTS.has(form));
    if (store) {
      push({ word: words[i], ...MERCHANT_REGISTRY[store], kind: "store" });
      continue;
    }
    const sub = (pair && SUB_CATEGORY_MAP[pair]) || forms.map((form) => SUB_CATEGORY_MAP[form]).find(Boolean);
    if (sub) {
      push({ word: words[i], category: sub.category, subCategory: sub.subCategory, kind: "purpose" });
      continue;
    }
    const dictionary = (pair && CATEGORY_DICTIONARY[pair]) || forms.map((form) => CATEGORY_DICTIONARY[form]).find(Boolean);
    if (dictionary) push({ word: words[i], category: dictionary, subCategory: "عام", kind: "purpose" });
  }

  const catalog = findCatalogMerchant(text);
  if (catalog) push({ word: catalog.merchant, category: catalog.category, subCategory: catalog.subCategory, kind: "store" });
  return clues;
}

export interface Weighing {
  /** The category the clues settle on, when it differs from the engine's first answer. */
  override?: { category: string; subCategory: string; reason: "category_named" | "purpose_over_store" };
  /** Readings of the clause, strongest first: what the model is shown when it is asked. */
  candidates: string[];
  /** Another reading weighs as much as the chosen one. */
  disputed: boolean;
}

/** Kinds of first answer the clues may overrule: a store name, or a single lexicon word. */
const OVERRULABLE = new Set([
  "merchant_registry", "merchant_catalog", "dict_unigram", "dict_bigram", "subcat_unigram", "fuzzy", "intent_only", "fallback",
]);
/** Kinds already settled by the user or by an explicit pattern: recorded, never disputed. */
const SETTLED = new Set(["user_correction", "user_dictionary", "muscle_memory", "known_person", "governed_noun"]);

function first(category: string, candidates: string[]): string[] {
  return [category, ...candidates.filter((other) => other !== category)];
}

export function weighClues(
  clues: Clue[],
  current: { category: string; subCategory: string; matchKind: string },
): Weighing {
  const score = new Map<string, number>();
  const purposeScore = new Map<string, number>();
  const bestSub = new Map<string, { sub: string; weight: number }>();
  for (const clue of clues) {
    score.set(clue.category, (score.get(clue.category) ?? 0) + clue.weight);
    if (clue.kind !== "store") purposeScore.set(clue.category, (purposeScore.get(clue.category) ?? 0) + clue.weight);
    const held = bestSub.get(clue.category);
    if (clue.subCategory !== "عام" && (!held || clue.weight > held.weight)) {
      bestSub.set(clue.category, { sub: clue.subCategory, weight: clue.weight });
    }
  }
  const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]);
  const candidates = [...new Set([current.category, ...ranked.map(([category]) => category)])]
    .filter((category) => !NON_PURPOSE.has(category) || category === current.category)
    .slice(0, 3);
  if (SETTLED.has(current.matchKind) || ranked.length === 0) return { candidates, disputed: false };

  const subFor = (category: string) => bestSub.get(category)?.sub ?? "عام";
  const named = clues.filter((clue) => clue.kind === "category_name");
  const namedCategories = new Set(named.map((clue) => clue.category));

  if (OVERRULABLE.has(current.matchKind)) {
    // The sentence names its category outright, once, and it is not the one chosen.
    if (namedCategories.size === 1 && !namedCategories.has(current.category)) {
      const category = named[0].category;
      return { override: { category, subCategory: subFor(category), reason: "category_named" }, candidates: first(category, candidates), disputed: false };
    }
    // A store answered, but the sentence also says what was bought there.
    const storeAnswered = current.matchKind === "merchant_registry" || current.matchKind === "merchant_catalog";
    if (storeAnswered && !purposeScore.has(current.category)) {
      const purposes = [...purposeScore.entries()].sort((a, b) => b[1] - a[1]);
      if (purposes.length > 0 && (purposes.length === 1 || purposes[0][1] > purposes[1][1])) {
        const category = purposes[0][0];
        return { override: { category, subCategory: subFor(category), reason: "purpose_over_store" }, candidates: first(category, candidates), disputed: false };
      }
    }
  }

  // Weight for what was chosen versus the strongest rival. The chosen answer is at least
  // one clue even when this pass found no word for it (a phrase or pattern answered).
  const own = Math.max(score.get(current.category) ?? 0, 1);
  const rival = ranked.find(([category]) => category !== current.category);
  const disputed = Boolean(rival && rival[1] > own);
  return { candidates, disputed };
}
