/**
 * The role each word plays in a clause, before any word votes on the category.
 *
 * The lexicon knows what a word means on its own: البيت is housing, الشغل is work, المستشفى is health, مروان is a
 * person, الموبايلات is nothing. A clause uses words in roles the lexicon cannot see, and most wrong answers came
 * from a word voting in a role where it says nothing about what the money was for:
 *
 *   scene       "وأنا راجع من الشغل جبت فاكهة"    the place passed through; the fruit is the purchase
 *   companion   "اتعشيت مع صحابي"                  who was there; the dinner is the purchase
 *   source      "خدت من البيت تاكسي"                where from; the taxi is the purchase
 *   occasion    "جبت شوكولاتة لعيد ميلاد مراتي"     what it was for: a gift, not a snack
 *   venue       "صرفت 1200 في محل الموبايلات"      the kind of shop names the purchase
 *   object      "خدت ميكروباص" / "خدت من أبويا"    what was taken decides whether money came in or went out
 *
 * This module reads those roles; `evidence-weighing.ts` keeps scene and companion words from voting and weighs the
 * occasion and venue as purpose, and the rule engine asks it whether an acquiring verb took money or a thing.
 */
import { getCategoryType } from "./category-registry";
import { normalizeArabic } from "./unified-normalizer";
import { CATEGORY_DICTIONARY } from "./lexicon/dictionary";
import { SUB_CATEGORY_MAP } from "./lexicon/subcategory-words";
import type { IntentResult } from "./intent-detector";

export interface ClauseRoles {
  /** Normalized words that name a place passed through, a companion or a source: they do not vote on purpose. */
  silent: Set<string>;
  /** The clause is for an occasion ("لعيد ميلاد مراتي"): the gift subcategory it names. */
  occasion: string | null;
  /** The kind of shop the money was spent in ("محل الموبايلات"). */
  venue: { category: string; subCategory: string; word: string } | null;
}

const norm = (text: string) => normalizeArabic(String(text || "")).toLowerCase();

/** Verbs of going somewhere; the words after them name a place, not a purchase. */
const MOTION =
  /(?:^|\s)[وف]?(?:انا\s+)?(?:راجع|راجعه|رايح|رايحه|رحت|روحت|نازل|نازله|نزلت|طالع|طالعه|طلعت|جاي|جايه|خارج|خارجه|خرجت|وصلت|عديت|معدي|(?:في|ف)\s+طريقي|(?:في|ف)\s+السكه)(?=\s|$)/g;
/** Verbs of paying for something: a scene is only a scene when a purchase follows it. */
const PURCHASE =
  /(?:^|\s)[وف]?(?:جبت|اشتريت|دفعت|صرفت|طلبت|خدت|اخدت|ركبت|شربت|اكلت|اتغديت|اتعشيت|فطرت|حطيت|شحنت|عملت)(?=\s|$)/;
/** Acquiring verbs: whether money came in depends on what was taken. */
const ACQUIRE =
  /(?:^|\s)[وف]?(?:خدت|اخدت|اخذت|جالي|جاتلي|جاني|جاتني|وصلني|وصلتلي|استلمت)(?=\s|$)/;
const PREPOSITION = /^(?:من|ل|لل|الي|على|علي|عند|في|ف|جنب)$/;
const MONEY_NOUNS = new Set([
  "فلوس", "الفلوس", "فلوسي", "مبلغ", "المبلغ", "تحويل", "التحويل", "مرتب", "المرتب", "مرتبي", "عيديه", "العيديه",
  "هديه", "الهديه", "سلفه", "السلفه", "فكه", "الفكه", "باقي", "الباقي", "كاش", "مكافاه", "المكافاه", "حوافز", "بونص",
]);

/** Occasions a purchase is made for, and the gift subcategory each one files under. */
const OCCASIONS: Array<[RegExp, string]> = [
  [/عيد\s+ميلاد|عيد\s+جواز|اعياد\s+ميلاد/, "عيد ميلاد"],
  [/خطوبه|فرح|كتب\s+كتاب|جواز|زفاف/, "فرح/خطوبة"],
  [/سبوع|ولاده|نجاح|تخرج|عزا|عزاء|واجب|زياره/, "نقطة وواجب"],
];
const OCCASION_FRAME =
  /(?:^|\s)(?:ل|لل|عشان\s+|علشان\s+|بمناسبه\s+|في\s+|ف\s+)(?:ال)?(عيد\s+ميلاد|عيد\s+جواز|خطوبه|فرح|كتب\s+كتاب|سبوع|ولاده|نجاح|تخرج|عزا|عزاء|زياره)(?=\s|$)/;

/** "محل الموبايلات", "من عند محلات الهدايا": the shop's kind, read without ال and a plural ending. */
const VENUE = /(?:^|\s)(?:في|ف|من|عند|من\s+عند)?\s*(?:ال)?(?:محل|محلات)\s+(\S+)/;

function lookup(word: string): { category: string; subCategory: string } | null {
  const bare = word.replace(/^(?:ال|لل|بال|وال|فال)/, "");
  const forms = [word, bare, bare.replace(/(?:ات|ين)$/, ""), bare.replace(/(?:ات)$/, "ه"), bare.replace(/ات$/, "")];
  for (const form of forms) {
    if (form.length < 2) continue;
    const sub = SUB_CATEGORY_MAP[form];
    if (sub) return sub;
    const category = CATEGORY_DICTIONARY[form];
    if (category) return { category, subCategory: "عام" };
  }
  return null;
}

/** The place words after each motion verb ("راجع من الشغل", "في طريقي للمدرسه", "رحت المستشفي"). */
function sceneWords(text: string, silent: Set<string>) {
  const tail = text.replace(/[،,.؛]/g, " ");
  for (const match of tail.matchAll(MOTION)) {
    const after = tail.slice((match.index ?? 0) + match[0].length);
    // Only a scene if a purchase comes after the motion ("رحت المستشفى بـ 500" pays the hospital).
    if (!PURCHASE.test(after)) continue;
    const words = after.trim().split(/\s+/);
    let taken = 0;
    for (const word of words) {
      if (taken >= 2 || PURCHASE.test(` ${word} `) || /\d/.test(word)) break;
      if (PREPOSITION.test(word)) continue;
      silent.add(word);
      silent.add(word.replace(/^(?:لل|ل|ال)/, ""));
      taken++;
      // "رحت المستشفي ازور خالتي": the place is one word; the next word is what was done there.
      if (/^(?:ال|لل)/.test(word)) break;
    }
  }
}

export function readClauseRoles(text: string): ClauseRoles {
  const n = norm(text);
  const silent = new Set<string>();
  sceneWords(n, silent);

  // Who was there: "مع صحابي", "مع مروان", "مع زمايلي".
  for (const match of n.matchAll(/(?:^|\s)مع\s+(\S+)(?:\s+(\S+))?/g)) {
    silent.add(match[1]);
    if (match[2] && !lookup(match[2]) && !/\d/.test(match[2]) && !PURCHASE.test(` ${match[2]} `)) silent.add(match[2]);
  }
  // Where from, after an acquiring verb: "خدت من البيت تاكسي".
  if (ACQUIRE.test(n)) {
    for (const match of n.matchAll(/(?:^|\s)من\s+(?:عند\s+)?(\S+)/g)) silent.add(match[1]);
  }

  const frame = OCCASION_FRAME.exec(n);
  const occasion = frame ? (OCCASIONS.find(([pattern]) => pattern.test(frame[1]))?.[1] ?? "عام") : null;

  let venue: ClauseRoles["venue"] = null;
  const shop = VENUE.exec(n);
  if (shop) {
    const hit = lookup(shop[1]);
    if (hit && getCategoryType(hit.category) === "expense") venue = { ...hit, word: shop[1] };
  }
  return { silent, occasion, venue };
}

/**
 * An acquiring verb takes money in only when what it took is money. "خدت ميكروباص من الموقف", "خدت من البيت
 * تاكسي" and "جاتلي مخالفة" take a ride or a bill: the money went out. "خدت من أبويا 1000" and "خدت المرتب" took
 * money. The object is every word of the clause that is not the verb, the source after "من", or a money noun; one
 * that names something bought turns the direction to spending.
 */
export function refineDirectionByObject(result: IntentResult, context: string): IntentResult {
  if (result.intent !== "income") return result;
  const n = norm(context);
  if (!ACQUIRE.test(n)) return result;
  const roles = readClauseRoles(context);
  const words = n.split(/\s+/).filter((word) => word.length >= 2 && !/\d/.test(word));
  for (const word of words) {
    if (ACQUIRE.test(` ${word} `) || PREPOSITION.test(word) || roles.silent.has(word)) continue;
    const bare = word.replace(/^[وفب](?=\S{2,})/, "");
    if (MONEY_NOUNS.has(bare) || MONEY_NOUNS.has(word)) return result;
    const hit = lookup(bare);
    if (!hit) continue;
    const type = getCategoryType(hit.category);
    // A person, a transfer or an income word says money came; a bought thing says it went.
    if (type !== "expense" || ["العائلة", "أصدقاء", "موظفين", "متنوعات", "هدايا وصدقات"].includes(hit.category)) continue;
    return {
      ...result,
      intent: "expense",
      expenseScore: Math.max(result.expenseScore, result.incomeScore) + 1,
      confidence: Math.min(result.confidence, 85),
    };
  }
  return result;
}
