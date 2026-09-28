/**
 * SmartSpend Rule Engine (Step 4)
 * Fast classification without AI for simple/clear transactions
 */

import { CATEGORY_DICTIONARY, isKnownLexeme, isWawWhitelisted } from "./lexicon/dictionary";
import { findCatalogMerchant } from "./lexicon/index";
import { SUB_CATEGORY_MAP } from "./lexicon/subcategory-words";
import {
  AMBIGUOUS_MERCHANTS,
  DISAMBIGUATION_RULES,
  MERCHANT_REGISTRY,
  PAYMENT_RAIL_SUBCATEGORIES,
} from "./lexicon/merchants";

export { SUB_CATEGORY_MAP };
import { fuzzyFindCategory, normalizeArabic, matchArabicPhrase, stripArabicPrefix } from "./fuzzy-match";
import { detectIntent, GIFT_NOUN, readsAsRefund, readsAsSale, type TransactionIntent } from "./intent-detector";
import { extractAmounts, type ExtractedAmount } from "./entity-extractor";
import { normalizeText } from "./text-normalizer";
import { CATEGORIES } from "./category-registry";
import { findTaxonomyMatch } from "./taxonomy-adapter";
import { resolveGovernedTaxonomy } from "./direction-governed-taxonomy";
import { detectNegation } from "./negation-detector";
import type { Evidence, MatchKind } from "./classification-evidence";
import { isKareemPersonContext, isLikelyPersonName } from "./egyptian-names-dictionary";

export interface RuleEngineResult {
  items: ParsedTransaction[];
  usedAI: false;
  needsAI: boolean;
  reason?: string;
}

export interface ParsedTransaction {
  amount: number;
  category: string;
  subCategory: string;
  description: string;
  type: TransactionIntent;
  confidence: number;
  merchant?: string;
  currency: string;
  needsReview: boolean;
  parsedBy: "rule_engine" | "ai" | "manual";
  inferenceSource?: "synonym" | "rule" | "dictionary" | "ai";
  ambiguityFlags?: string[];
  date?: string;
  person_mentioned?: string;
  person_relationship?: string;
  businessId?: number;
  confidenceBreakdown?: {
    intent: number;
    taxonomy: number;
    heuristics: number;
  };
  /**
   * How this answer was reached. Provenance is recorded at the point of decision rather
   * than inferred from the score afterwards — the routing layer currently reverse-engineers
   * it by testing for the magic values 100 and 98, which is exactly what this replaces.
   */
  evidence?: Evidence;
  /**
   * Which way a transfer moved, for the ledger and the list ("حولت" or "اتحولي"). Set for
   * gam3eya payments, loans and anything else typed `transfer` whose direction is known.
   */
  direction?: "incoming" | "outgoing";
  /** Request-local event identity; category changes must not change amount ownership. */
  sourceEventId?: number;
  /** Unresolved facts that a category-only resolver cannot clear. */
  reviewReasons?: string[];
  calibration?: {
    signature: string;
    support: number;
    probability: number;
  };
}

export interface ClassificationProfileContext {
  hasChildren?: boolean | null;
  responsibleForFamily?: boolean | null;
  supportsOthers?: unknown;
  fixedMonthlyCommitments?: unknown;
}



/**
 * Strategy 5: Hierarchical Subcategory Cascade
 * ─────────────────────────────────────────────
 * After determining main category, refine the subcategory
 * using deterministic keyword patterns for higher precision.
 */
function refineSubCategory(
  category: string,
  subCategory: string,
  context: string,
): string {
  // Only refine if subcategory is generic ("عام")
  if (subCategory !== "عام") return subCategory;

  switch (category) {
    case "تعليم":
      if (/(مدرس|درس|دروس|سنتر)/.test(context)) return "دروس خصوصية";
      if (/(كورس|كورسات|دوره|دورة|يوديمي|كورسيرا)/.test(context))
        return "كورسات";
      if (/(جامعه|كليه|ترم|سنه اولى)/.test(context)) return "جامعة";
      if (/(مدرسه|يونيفورم|مصاريف المدرسه)/.test(context)) return "مدرسة";
      if (/(كتب|ملزمه|مذكره|ادوات)/.test(context)) return "كتب";
      return "عام";
    case "صحة":
      if (/(دكتور|عياده|كشف|طبيب|فيزيتا|استشاره)/.test(context)) return "دكتور";
      if (/(صيدليه|دوا|علاج|روشته|بانادول|فيتامين)/.test(context))
        return "صيدلية";
      if (/(تحاليل|اشعه|سونار|رنين)/.test(context)) return "تحاليل";
      if (/(اسنان|ضرس|حشو|خلع)/.test(context)) return "أسنان";
      if (/(مستشفى|عمليه|جراحه)/.test(context)) return "مستشفى";
      return "عام";
    case "مواصلات":
      if (/(اوبر|كريم|اندرايفر|ديدي)/.test(context)) return "أوبر/كريم";
      if (/(بنزين|تفويله|محطه|بنزينه)/.test(context)) return "بنزين";
      if (/(مترو|تذكره مترو)/.test(context)) return "مترو";
      if (/(تاكسي|تكسي)/.test(context)) return "تاكسي";
      if (/(توكتوك)/.test(context)) return "توكتوك";
      if (/(صيانه|عربيه|كاوتش|زيت|ميكانيكي)/.test(context))
        return "صيانة عربية";
      return "عام";
    case "سكن":
      if (/(ايجار|اجار)/.test(context)) return "إيجار";
      if (/(سباك|كهربائي|نقاش|نجار|صيانه)/.test(context)) return "صيانة";
      if (/(عفش|اثاث)/.test(context)) return "أثاث";
      if (/(منظفات|بريل|اريال|صابون)/.test(context)) return "منظفات";
      return "عام";
    case "فواتير":
      if (/(كهربا|نور)/.test(context)) return "كهرباء";
      if (/(ميه|مياه)/.test(context)) return "مياه";
      if (/(غاز)/.test(context)) return "غاز";
      // Guard against matching common words like "انت/كنت" which contain "نت"
      if (
        /(?:^|\s)(?:نت|النت|انترنت|الانترنت|راوتر|واي\s*فاي|wifi|وي|we)(?=\s|$|[.,،؟?!؛:])/.test(
          context,
        )
      )
        return "إنترنت";
      if (/(شحن|رصيد|كارت)/.test(context)) return "شحن رصيد";
      if (/(قسط|اقساط|فاليو|سهوله)/.test(context)) return "أقساط";
      return "عام";
    case "تحويل":
      if (/(atm|سحب|سحبت)/i.test(context)) return "سحب ATM";
      if (/(انستاباي|instapay)/i.test(context)) return "انستاباي";
      if (/(فودافون\s*كاش|vodafone\s*cash)/i.test(context))
        return "فودافون كاش";
      if (/(تحويل\s*بنكي|حواله|حوالة|bank\s*transfer)/i.test(context))
        return "تحويل بنكي";
      if (/(ادخار|وفر|توفير|حوش|تحويش)/.test(context)) return "ادخار";
      if (/(سلف|سلفه|سلفة|دين|قرض)/.test(context)) return "دين/سلفة";
      return "تحويل بنكي";
    case "استثمار":
      if (/(ذهب|دهب|سبيكه|سبيكة|جنيه\s*ذهب|جرام\s*ذهب)/.test(context))
        return "ذهب";
      if (/(اسهم|أسهم|بورصه|بورصة|ثاندر|thndr)/i.test(context)) return "أسهم";
      if (/(شهاده|شهادة|وديعه|وديعة|اذون|أذون)/.test(context)) return "شهادات";
      if (/(عقار|عقارات|ارض|أرض|شقه\s*تمليك|شقة\s*تمليك|تمليك)/.test(context))
        return "عقارات";
      if (
        /(بتكوين|بيتكوين|bitcoin|btc|usdt|كريبتو|عملات\s*رقميه|عملات\s*رقمية)/i.test(
          context,
        )
      )
        return "عملات رقمية";
      // Bug #7 fix: استثمار neutral default is "عام" not "ذهب".
      // Previously "استثمرت في عقارات" would wrongly return "ذهب".
      return "عام";
    case "ترفيه":
      if (/(سينما|فيلم)/.test(context)) return "سينما";
      if (/(جيم|رياضه|بروتين)/.test(context)) return "رياضة وجيم";
      if (/(سفر|مصيف|رحله)/.test(context)) return "سفر";
      if (/(خروجه|فسحه|تمشيه)/.test(context)) return "خروجة";
      if (/(شيشه|كافيه)/.test(context)) return "كافيه";
      if (/(بلايستيشن|اكس بوكس|العاب)/.test(context)) return "ألعاب";
      return "عام";
    case "أكل وشرب":
      if (/(قهوه|نسكافيه|لاتيه|كابتشينو|ستاربكس)/.test(context))
        return "قهوة وكافيه";
      if (/(دليفري|تيك اواي|طلبات)/.test(context)) return "دليفري";
      if (/(بقاله|سوبر|خضار|فاكهه|بيض|لبن)/.test(context)) return "بقالة";
      if (/(شيبسي|شوكولاته|حلويات|ايس كريم|بسبوسه)/.test(context))
        return "سناكس";
      if (/(لحمه|فراخ|سمك|جمبري|عجل|خروف|خرفان|جزار|ذبيح|اضحي|كندوز|ضاني)/.test(context)) return "لحوم ودواجن";
      if (/(عيش|مخبز|فرن)/.test(context)) return "مخبوزات";
      return "عام";
    case "هدايا وصدقات":
      if (/(صدقه|زكاه|تبرع|جامع|رساله)/.test(context)) return "صدقة/تبرع";
      if (/(عيديه)/.test(context)) return "عيدية";
      return "عام";
    case "تسوق":
      if (
        /(?:هدوم|لبس|ملابس|تيشيرت|بنطلون|جاكيت|قميص|فستان|بلوفر|سويت\s*شيرت|شراب|كاب|زارا|zara|اتش\s*اند\s*ام|h&m|ديفاكتو|defacto|ماكس|max|وايكيكي|waikiki|shein|شي\s*ان|شي\s*إن)/i.test(
          context,
        )
      )
        return "ملابس";
      if (
        /(?:جزمة|جرمة|كوتشي|شوز|حذاء|هاف\s*بوت|بوت|صندل|شبشب|اديداس|adidas|نايكي|nike|بوما|puma|ريبوك|reebok)/i.test(
          context,
        )
      )
        return "أحذية";
      if (
        /(?:موبايل|لاب|لابتوب|كمبيوتر|سماعة|سماعه|شاحن|ايفون|تليفون|تلفون|ابل|apple|سامسونج|samsung|شاومي|xiaomi|شاشه|شاشة|تلفزيون)/i.test(
          context,
        )
      )
        return "أجهزة إلكترونية";
      if (
        /(?:حلاق|عناية|عنايه|ميكاب|ميكب|برفان|عطر|شامبو|كريم|صابون|معجون|سيشوار)/.test(
          context,
        )
      )
        return "عناية شخصية";
      if (
        /(?:اكسسوار|اكسسوارات|إكسسوارات|إكسسوار|ساعة|ساعه|نضارة|نضاره|شنطة|شنطه|حزام|محفظة|محفظه|فضة|ذهب)/.test(
          context,
        )
      )
        return "إكسسوارات";
      return "عام";
    default:
      return subCategory;
  }
}

/**
 * Determine if text is simple enough for rule engine (no AI needed)
 */
export function isSimpleText(text: string): boolean {
  const normalizedLen = text.length;
  const wordCount = text.split(/\s+/).length;

  // Too long = complex
  if (normalizedLen > 400 || wordCount > 50) return false;

  // Multiple "و" connectors with amounts = multi-transaction
  const amounts = extractAmounts(text);
  if (amounts.length > 8) return false;

  // Check for multiple distinct main categories (e.g. Shopping + Food)
  // If a user buys two very different things with 1 amount, we need AI to estimate prices.
  const intentResult = detectIntent(text);
  const words = text.split(/\s+/).map(w => normalizeArabic(w).toLowerCase());
  const distinctCategories = new Set<string>();
  
  for (const word of words) {
    if (word.length < 3) continue;
    // Strip Arabic prefixes so "والكهرباء" → "كهرباء" hits the map correctly
    const stripped = stripArabicPrefix(word);
    const candidates = stripped !== word ? [word, stripped] : [word];
    for (const candidate of candidates) {
      const hit = SUB_CATEGORY_MAP[candidate];
      if (hit && !["عام", "متنوعات", "أخرى"].includes(hit.category)) {
        const catType = CATEGORIES.find(c => c.name_ar === hit.category)?.type || "expense";
        if (catType === intentResult.intent) distinctCategories.add(hit.category);
        break;
      }
      const dictHit = CATEGORY_DICTIONARY[candidate];
      if (dictHit && !["عام", "متنوعات", "أخرى"].includes(dictHit)) {
        const catType = CATEGORIES.find(c => c.name_ar === dictHit)?.type || "expense";
        if (catType === intentResult.intent) distinctCategories.add(dictHit);
        break;
      }
    }
  }
  
  if (distinctCategories.size > 1) {
    // We used to return false here assuming multiple categories meant 1 amount split across many items.
    // However, for multi-amount texts, we should allow local processing (heuristic decomposer) to split them.
    // return false; 
  }

  // Ambiguous phrases
  const ambiguousPatterns = [
    /حولت\s+\S+/, // "حولت لأحمد" - ambiguous
    /اديت\s+\S+/, // "اديت مروان" - ambiguous
    /إديت\s+\S+/,
    /عطيت\s+\S+/,
    /سلفت\s+\S+/,
    /خد\s+مني/,
    /اخد\s+مني/,
    /حطيت\s+فلوس/, // "حطيت فلوس" - ambiguous
    /ولا\s+\d/, // "خمسين ولا ستين" - uncertain
  ];

  for (const pattern of ambiguousPatterns) {
    if (pattern.test(text)) return false;
  }

  return true;
}

/**
 * Context-Aware Disambiguation for multi-meaning Egyptian Arabic words.
 * Resolves ambiguity for words that have completely different meanings
 * depending on context (e.g. "نور" = electricity vs a girl's name).
 *
 * Called after SUB_CATEGORY_MAP or MERCHANT_REGISTRY match to verify
 * the category fits the surrounding context. Only overrides when the
 * context provides a clear signal — otherwise keeps the default mapping.
 */
/**
 * Categories that name a person rather than a kind of spending. Their direction comes
 * from the sentence, never from the category itself — money can flow either way with
 * the same person — so they are the categories a governed verb is allowed to keep.
 */
export const PERSON_CATEGORIES = ["العائلة", "أصدقاء", "موظفين"];


function isPaymentRailHit(hit: { category: string; subCategory: string }): boolean {
  return hit.category === "تحويل" && PAYMENT_RAIL_SUBCATEGORIES.has(hit.subCategory);
}


/**
 * Detects negation, non-payment, invitations, and cancelled transactions in Egyptian Arabic.
 */
export function detectPolarityAndNegation(text: string): {
  isNegated: boolean;
  polarityMultiplier: number;
  reason?: string;
} {
  const norm = normalizeArabic(text).toLowerCase();

  // Explicit non-payment / invitations (e.g. "صاحبي عزمني ومادفعتش مليم", "على حسابه")
  if (
    /(?:عزمني|عزمتني|عزمنا|على\s*حساب|ع\s*حساب|مادفعتش|ما\s*دفعتش|مادفعناش|ما\s*دفعناش|ولا\s*مليم|ولا\s*قرش|ببلاش|مجانا)/.test(
      norm,
    )
  ) {
    return { isNegated: true, polarityMultiplier: 0.0, reason: "invitation_or_zero_payment" };
  }

  // Cancelled or aborted transactions (e.g. "كنت هطلب بس لغيت", "كنت هركب بس مالحقتش")
  if (
    /(?:كنت\s*ه|كنت\s*عايز|كنت\s*ناوي|فكرت\s*اشتري|بس\s*لغيت|بس\s*ملحقتش|بس\s*مالحقتش|لغيت\s*الاوردر|كنسلت|مركبتش|ماشتريتش|ماجبتش)/.test(
      norm,
    )
  ) {
    return { isNegated: true, polarityMultiplier: 0.0, reason: "aborted_or_cancelled_transaction" };
  }

  // Borrowing / Loans
  if (/(?:استلفت|سلفني|سلّفني|دين|قرض|سلف)/.test(norm)) {
    return { isNegated: false, polarityMultiplier: 0.6, reason: "debt_or_loan_context" };
  }

  return { isNegated: false, polarityMultiplier: 1.0 };
}

function disambiguateContext(
  matchedWord: string,
  context: string,
  currentCategory: string,
  currentSubCategory: string,
): { category: string; subCategory: string } | null {
  const normalizedWord = normalizeArabic(matchedWord).toLowerCase().trim();
  const rules = DISAMBIGUATION_RULES[matchedWord] || DISAMBIGUATION_RULES[normalizedWord];
  if (!rules) return null;

  const normalizedContext = normalizeArabic(context).toLowerCase();
  for (const rule of rules) {
    if (rule.contextPattern.test(normalizedContext)) {
      if (rule.category !== currentCategory || rule.subCategory !== currentSubCategory) {
        return { category: rule.category, subCategory: rule.subCategory };
      }
    }
  }
  return null;
}


/**
 * Split a financial text segment on explicit conjunctions (و, ف, etc.)
 * as well as attached "و" prefixes, guarding against naturally waw-starting words
 * (like وجبة, وليد) via the WAW_WHITELIST.
 */
function splitEgyptianConjunctions(text: string): string[] {
  if (!text) return [];
  
  // 1. Initial split on standard explicit separators: ، , + زائد and spaced "و"
  const initialParts = text.split(/\s+و\s+|،|,|\+| زائد /);
  const finalParts: string[] = [];
  
  for (const part of initialParts) {
    const words = part.trim().split(/\s+/);
    if (words.length === 0 || (words.length === 1 && words[0] === "")) continue;
    
    let currentSegment: string[] = [];
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      const startsWithWaw = word.startsWith("و") && word.length > 1;
      
      if (startsWithWaw && i > 0) { // Only split if there is context before it (i > 0)
        const isDoubleWaw = word.startsWith("وو") && word.length > 2;
        const coreWord = word.slice(1);
        
        let shouldSplit = false;
        if (isDoubleWaw) {
          shouldSplit = true;
        } else {
          // If the word itself is NOT naturally starting with waw, split it
          if (!isWawWhitelisted(word)) {
            shouldSplit = true;
          }
        }
        
        if (shouldSplit) {
          if (currentSegment.length > 0) {
            finalParts.push(currentSegment.join(" "));
          }
          currentSegment = [coreWord];
          continue;
        }
      }
      
      currentSegment.push(word);
    }
    
    if (currentSegment.length > 0) {
      finalParts.push(currentSegment.join(" "));
    }
  }
  
  return finalParts;
}

/**
 * Run the rule engine on normalized text
 */
export async function runRuleEngine(
  normalizedText: string,
  userDict: Array<{
    word: string;
    category: string;
    subCategory?: string;
  }> = [],
  profileContext?: ClassificationProfileContext,
): Promise<RuleEngineResult> {
  const amounts = extractAmounts(normalizedText);

  if (amounts.length === 0) {
    return {
      items: [],
      usedAI: false,
      needsAI: true,
      reason: "no_amounts_found",
    };
  }

  // Note: We no longer return early here! We want the backend to try extracting items
  // even for complex text so it can provide hints to the AI.
  const isComplex = !isSimpleText(normalizedText);

  const items: ParsedTransaction[] = [];

  // Normalize user dictionary keys once to avoid mismatches caused by Arabic variants
  // (أ/إ/آ, ى/ي, ة/ه, etc.) since normalizedText already goes through a normalizer.
  const userDictByWord = new Map<
    string,
    { category: string; subCategory?: string }
  >();
  for (const row of userDict) {
    const key = normalizeArabic(String(row.word || ""))
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (!key) continue;
    userDictByWord.set(key, {
      category: row.category,
      subCategory: row.subCategory ?? undefined,
    });
  }

  for (let i = 0; i < amounts.length; i++) {
    const { amount, index, length } = amounts[i];
    const contextStart =
      i > 0 ? amounts[i - 1].index + amounts[i - 1].length : 0;
    const contextEnd =
      i < amounts.length - 1 ? amounts[i + 1].index : normalizedText.length;
    let beforeAmount = normalizedText.slice(contextStart, index).trim();
    let afterAmount = normalizedText.slice(index + length, contextEnd).trim();

    // Prevent context bleeding by splitting shared text using separators
    if (i > 0) {
      const parts = splitEgyptianConjunctions(beforeAmount);
      beforeAmount = parts.length > 0 ? parts[parts.length - 1].trim() : "";
    }
    if (i < amounts.length - 1) {
      const parts = splitEgyptianConjunctions(afterAmount);
      afterAmount = parts.length > 0 ? parts[0].trim() : "";
    }
    const allContext = (beforeAmount + " " + afterAmount).trim();
    const allContextNorm = normalizeArabic(allContext).toLowerCase();
    const intentResult = detectIntent(allContext);
    
    // Multi-Category Ambiguity Pre-Check
    const rawWordsForCheck = allContext.split(/\s+/).filter((w) => w.length >= 2);
    const distinctCats = new Set<string>();
    for (const word of rawWordsForCheck) {
      let norm = normalizeArabic(word).toLowerCase();
      // Strip common prefixes just like the main loop does
      const prefixesRegex = /^(?:و|ف|ب|ل|ال|وال|فال|بال|لل)(?=[^\s]{3,})/i;
      norm = norm.replace(prefixesRegex, "");
      
      // Skip "كريم" in person context during pre-check
      if (norm === "كريم" || norm === "كرييم") {
        if (isKareemPersonContext(allContextNorm)) {
          continue;
        }
      }

      const hitSub = SUB_CATEGORY_MAP[norm];
      if (hitSub) {
        const catType = CATEGORIES.find(c => c.name_ar === hitSub.category)?.type || "expense";
        if (catType === intentResult.intent) distinctCats.add(hitSub.category);
      }
      const hitDict = CATEGORY_DICTIONARY[norm];
      if (hitDict) {
        const catType = CATEGORIES.find(c => c.name_ar === hitDict)?.type || "expense";
        if (catType === intentResult.intent) distinctCats.add(hitDict);
      }
    }
    distinctCats.delete("متنوعات");
    distinctCats.delete("اشتراكات");
    
    // If multiple different categories exist in the same segment, 
    // it's a complex ambiguous sentence (e.g. "جبت أكل وركبت اوبر بـ 500").
    // We used to abort and let the AI handle it, but for massive test cases this causes 429 rate limits.
    // Instead of aborting, we now proceed and pick the first found category.
    /*
    if (distinctCats.size > 1) {
      // EXCEPTION: Supermarket purchases can include household items.
      const hasSupermarketOrGroceries = 
        distinctCats.has("أكل وشرب") && 
        /(سوبرماركت|سوبر|بقالة|كارفور|هايبر)/.test(allContext);
        
      const hasHousehold = distinctCats.has("سكن") || distinctCats.has("منزل"); // "مناديل", "مسحوق" fall under "سكن/منزل"
      
      const remainingCats = new Set(distinctCats);
      remainingCats.delete("أكل وشرب");
      remainingCats.delete("سكن");
      remainingCats.delete("منزل");
      
      const isSupermarketHouseholdCombo = hasSupermarketOrGroceries && hasHousehold && remainingCats.size === 0;

      if (!isSupermarketHouseholdCombo) {
        return {
          items: [],
          usedAI: false,
          needsAI: true,
          reason: "multi_category_segment",
        };
      }
    }
    */

    let category =
      intentResult.intent === "income"
        ? "دخل آخر"
        : intentResult.intent === "transfer"
          ? "تحويل"
          : intentResult.intent === "investment"
            ? "استثمار"
            : "متنوعات";
    let subCategory = "عام";
    let confidence = 30;
    // Provenance travels WITH the number. Every write goes through setMatch so a score
    // can never appear without a record of how it was reached — the whole point of the
    // evidence model is that a 90 from a dictionary hit and a 90 from a fuzzy match are
    // different facts, and the value alone cannot tell them apart.
    let matchKind: MatchKind = "fallback";
    const setMatch = (value: number, kind: MatchKind): number => {
      matchKind = kind;
      return value;
    };
    let inferenceSource: ParsedTransaction["inferenceSource"] = "rule";
    let ambiguityFlags: string[] | undefined;
    const words = allContext.split(/\s+/).filter((w) => w.length >= 2);
    const normWords = words
      .map((w) => normalizeArabic(w).replace(/\s+/g, " ").trim().toLowerCase())
      .filter(Boolean);

    let found = false;

    if (intentResult.intent === "expense") {
      if (
        /(?:شربت|اشربت|شربنا|شرب)\s*(?:قهو|قهوه|قهوة|كوفي|كابتشينو|لاتيه|نسكافيه|كافيه)/.test(
          allContext,
        )
      ) {
        category = "أكل وشرب";
        subCategory = "قهوة وكافيه";
        confidence = setMatch(93, "verb_noun_regex");
        inferenceSource = "rule";
        ambiguityFlags = ["voice_colloquial_drink"];
        found = true;
      } else if (
        /(?:اشتريت|جبت|دفعت|صرفت|اخدت)\s*(?:شاورما|برجر|بيتزا|وجبه|وجبة|سندوتش)/.test(
          allContext,
        )
      ) {
        category = "أكل وشرب";
        subCategory = /بيتزا|برجر/.test(allContext) ? "وجبات سريعة" : "مطعم";
        confidence = setMatch(91, "verb_noun_regex");
        inferenceSource = "rule";
        found = true;
      } else if (/(?:شحنت|شحنة)\s*(?:رصيد|موبايل|نت)/.test(allContext)) {
        category = "فواتير";
        // Guard against matching "انت/كنت" which contain "نت" as a substring.
        const hasInternetWord =
          /(?:^|\s)(?:نت|النت|انترنت|الانترنت)(?=\s|$|[.,،؟?!؛:])/.test(
            allContext,
          );
        subCategory = hasInternetWord ? "إنترنت" : "شحن رصيد";
        confidence = setMatch(92, "verb_noun_regex");
        inferenceSource = "rule";
        found = true;
      } else if (
        /(?:ركبت|اخدت|مشيت)\s*(?:اوبر|كريم|تاكسي|مترو)/.test(allContext)
      ) {
        category = "مواصلات";
        subCategory = /اوبر|كريم/.test(allContext)
          ? "أوبر/كريم"
          : /مترو/.test(allContext)
            ? "مترو"
            : "تاكسي";
        confidence = setMatch(91, "verb_noun_regex");
        inferenceSource = "rule";
        found = true;
      }
    }

    // 1. User dictionary (highest priority)
    for (const word of normWords) {
      let userMatch = userDictByWord.get(word);
      if (!userMatch && word.startsWith("و") && word.length > 2) {
        userMatch = userDictByWord.get(word.substring(1));
      }
      if (!userMatch && word.startsWith("ل") && word.length > 2) {
        userMatch = userDictByWord.get(word.substring(1));
      }
      if (userMatch) {
        category = userMatch.category;
        subCategory = userMatch.subCategory || "عام";
        confidence = setMatch(100, "user_dictionary");
        inferenceSource = "dictionary";
        found = true;
        
        // Fix: If it's a known person, and type isn't income, "اديت" should be an expense, not a transfer
        if (intentResult.intent !== "income" && ["العائلة", "أصدقاء", "موظفين"].includes(category)) {
          intentResult.intent = "expense";
        }
        break;
      }
    }

    // A payment rail (a card, a wallet, a bank) and a kinship word say how and to whom the
    // money moved, not what it was for. Their answers are held while the later layers look
    // for a purpose, and used only when none is found
    // (docs/decisions/0008-money-movements-and-taxonomy.md).
    let heldRail: { category: string; subCategory: string; confidence: number } | null = null;
    let heldPerson: { category: string; subCategory: string; confidence: number; flags?: string[] } | null = null;

    // 1.5 Merchant Registry (Strategy 2: instant brand recognition, 0 tokens)
    if (!found) {
      // Check multi-word merchant names first (longer = more specific)
      const merchantKeys = Object.keys(MERCHANT_REGISTRY).sort(
        (a, b) => b.length - a.length,
      );
      for (const merchant of merchantKeys) {
        if (matchArabicPhrase(allContext, merchant)) {
          const registered = MERCHANT_REGISTRY[merchant];
          // "دفعت 200 بفودافون كاش للسباك": a wallet or a bank is how the money moved.
          // Its answer is held while the layers below look for what it paid for.
          if (isPaymentRailHit(registered)) {
            heldRail = { category: registered.category, subCategory: registered.subCategory, confidence: 100 };
            break;
          }
          category = registered.category;
          subCategory = registered.subCategory;
          confidence = setMatch(100, "merchant_registry");
          inferenceSource = "dictionary";
          ambiguityFlags = ["merchant_registry_hit"];
          // A brand spelled like a name or a common word is not proof on its own.
          if (AMBIGUOUS_MERCHANTS.has(merchant)) ambiguityFlags.push("ambiguous_merchant");
          // Context-aware disambiguation for merchant names that are also person names
          const disambiguated = disambiguateContext(merchant, allContext, category, subCategory);
          if (disambiguated) {
            category = disambiguated.category;
            subCategory = disambiguated.subCategory;
            confidence = setMatch(85, "merchant_disambiguated");
            ambiguityFlags = [...(ambiguityFlags || []), "disambiguated_from_merchant"];
          }
          found = true;
          break;
        }
      }
    }

    // A kinship word says who the money was for, not what it bought: "دفعت مصاريف مدرسة
    // ابني" is تعليم for ابني.
    if (!found) {
      const synonymMatch = findTaxonomyMatch(allContext);
      if (synonymMatch && PERSON_CATEGORIES.includes(synonymMatch.category)) {
        heldPerson = {
          category: synonymMatch.category,
          subCategory: synonymMatch.subCategory,
          confidence: synonymMatch.confidence,
          flags: synonymMatch.ambiguityFlags,
        };
      } else if (synonymMatch) {
        category = synonymMatch.category;
        subCategory = synonymMatch.subCategory;
        confidence = setMatch(synonymMatch.confidence, "synonym_graph");
        inferenceSource = "synonym";
        ambiguityFlags = synonymMatch.ambiguityFlags;
        found = true;
      }
    }

    // 2. Multi-word global dictionary (prefer more specific phrases first - Trigrams & Bigrams)
    if (!found) {
      // Check trigrams first
      for (let w = 0; w < words.length - 2; w++) {
        const phrase = words[w] + " " + words[w + 1] + " " + words[w + 2];
        const phraseNorm = normalizeArabic(phrase).toLowerCase();
        const dictHit =
          CATEGORY_DICTIONARY[phrase] || CATEGORY_DICTIONARY[phraseNorm];
        if (dictHit) {
          category = dictHit;
          const phraseSubHit =
            SUB_CATEGORY_MAP[phrase] || SUB_CATEGORY_MAP[phraseNorm];
          if (phraseSubHit) {
            subCategory = phraseSubHit.subCategory;
            confidence = setMatch(87, "dict_trigram");
          } else {
            subCategory = "عام";
            confidence = setMatch(85, "dict_trigram");
          }
          inferenceSource = "dictionary";
          found = true;
          break;
        }
      }
      
      // Then bigrams
      if (!found) {
        for (let w = 0; w < words.length - 1; w++) {
          const phrase = words[w] + " " + words[w + 1];
          const phraseNorm = normalizeArabic(phrase).toLowerCase();
          const dictHit =
            CATEGORY_DICTIONARY[phrase] || CATEGORY_DICTIONARY[phraseNorm];
          if (dictHit) {
            category = dictHit;
            const phraseSubHit =
              SUB_CATEGORY_MAP[phrase] || SUB_CATEGORY_MAP[phraseNorm];
            if (phraseSubHit) {
              subCategory = phraseSubHit.subCategory;
              confidence = setMatch(85, "dict_bigram");
            } else {
              subCategory = "عام";
              confidence = setMatch(82, "dict_bigram");
            }
            inferenceSource = "dictionary";
            found = true;
            break;
          }
        }
      }
    }

    // 3. Multi-word subcategory match (Trigrams & Bigrams)
    if (!found) {
      // Trigrams
      for (let w = 0; w < words.length - 2; w++) {
        const phrase = words[w] + " " + words[w + 1] + " " + words[w + 2];
        const phraseNorm = normalizeArabic(phrase).toLowerCase();
        const hit = SUB_CATEGORY_MAP[phrase] || SUB_CATEGORY_MAP[phraseNorm];
        if (hit) {
          const disambiguated = disambiguateContext(phrase, allContext, hit.category, hit.subCategory);
          category = disambiguated ? disambiguated.category : hit.category;
          subCategory = disambiguated ? disambiguated.subCategory : hit.subCategory;
          confidence = setMatch(92, "subcat_trigram"); // Trigram: high confidence (auto-save threshold)
          inferenceSource = "rule";
          if (disambiguated) ambiguityFlags = [...(ambiguityFlags || []), "context_disambiguated"];
          found = true;
          break;
        }
      }
      // Bigrams
      if (!found) {
        for (let w = 0; w < words.length - 1; w++) {
          const phrase = words[w] + " " + words[w + 1];
          const phraseNorm = normalizeArabic(phrase).toLowerCase();
          const hit = SUB_CATEGORY_MAP[phrase] || SUB_CATEGORY_MAP[phraseNorm];
          if (hit) {
            const disambiguated = disambiguateContext(phrase, allContext, hit.category, hit.subCategory);
            category = disambiguated ? disambiguated.category : hit.category;
            subCategory = disambiguated ? disambiguated.subCategory : hit.subCategory;
            confidence = setMatch(88, "subcat_bigram"); // Bigram: above auto-save threshold
            inferenceSource = "rule";
            if (disambiguated) ambiguityFlags = [...(ambiguityFlags || []), "context_disambiguated"];
            found = true;
            break;
          }
        }
      }
    }

    // 4. Subcategory map (single word exact + prefix-stripped fallback)
    if (!found) {
      let bestHit: { category: string; subCategory: string; confidence: number } | null = null;
      for (const word of words) {
        const normalizedWord = normalizeArabic(word).toLowerCase();
        const stripped = stripArabicPrefix(normalizedWord);
        const hit =
          SUB_CATEGORY_MAP[word] ||
          SUB_CATEGORY_MAP[normalizedWord] ||
          (stripped !== normalizedWord ? SUB_CATEGORY_MAP[stripped] : undefined);
        // "دفعت بالفيزا في المطعم": the card is how it was paid, not what it paid for.
        // A payment rail after ب is skipped so the purpose can answer.
        if (hit && isPaymentRailHit(hit) && /^ب/.test(normalizedWord) && stripped !== normalizedWord) {
          continue;
        }
        if (hit) {
          const isExact = SUB_CATEGORY_MAP[word] || SUB_CATEGORY_MAP[normalizedWord];
          const baseScore = isExact ? 85 : 82; // Calibrated: single-word exact = auto-save borderline, prefix = review
          const refinedSub = refineSubCategory(hit.category, hit.subCategory, allContext);
          // Boost if it's refined (not "عام")
          const currentScore = baseScore + (refinedSub !== "عام" && hit.subCategory === "عام" ? 2 : 0);
          
          if (!bestHit || currentScore > bestHit.confidence || 
              (currentScore === bestHit.confidence && refinedSub !== "عام" && bestHit.subCategory === "عام")) {
            bestHit = {
              category: hit.category,
              subCategory: refinedSub,
              confidence: currentScore
            };
          }
        }
      }
      if (bestHit) {
        // Context-aware disambiguation for multi-meaning words
        for (const word of words) {
          const normalizedWord = normalizeArabic(word).toLowerCase();
          const stripped = stripArabicPrefix(normalizedWord);
          const disambiguated = disambiguateContext(word, allContext, bestHit.category, bestHit.subCategory)
            || disambiguateContext(normalizedWord, allContext, bestHit.category, bestHit.subCategory)
            || (stripped !== normalizedWord ? disambiguateContext(stripped, allContext, bestHit.category, bestHit.subCategory) : null);
          if (disambiguated) {
            bestHit.category = disambiguated.category;
            bestHit.subCategory = disambiguated.subCategory;
            ambiguityFlags = [...(ambiguityFlags || []), "context_disambiguated"];
            break;
          }
        }
        category = bestHit.category;
        subCategory = bestHit.subCategory;
        confidence = setMatch(bestHit.confidence, "subcat_unigram");
        inferenceSource = "rule";
        found = true;
      }
    }

    // Step 5 substring matching removed to prevent false positive matches (e.g. "عشان" matching "عشا").

    // 5. Global dictionary (single-token)
    if (!found) {
      for (const word of words) {
        const normalizedWord = normalizeArabic(word).toLowerCase();

        // Bug #9 fix: Context-aware موبايل/تليفون handling.
        // "شحنت الموبايل" → فواتير, "اشتريت موبايل" → تسوق.
        if (normalizedWord === "موبايل" || normalizedWord === "تليفون") {
          const isRecharge = /(شحن|رصيد|باقه|كارت)/.test(allContextNorm);
          const isBuying = /(اشتريت|جبت|جديد|مستعمل)/.test(allContextNorm);
          if (isRecharge) {
            category = "فواتير"; subCategory = "شحن رصيد"; confidence = 93; // Raised from 88 to 93
            inferenceSource = "rule"; found = true; break;
          } else if (isBuying) {
            category = "تسوق"; subCategory = "أجهزة إلكترونية"; confidence = 93; // Raised from 88 to 93
            inferenceSource = "rule"; found = true; break;
          }
          // Ambiguous — skip and let AI decide
          continue;
        }

        // Context-aware disambiguation for "كريم":
        if (normalizedWord === "كريم" || normalizedWord === "كرييم") {
          if (isKareemPersonContext(allContextNorm)) {
            // This is a person, not the Careem app — skip dictionary lookup
            continue;
          }
        }

        const strippedWord = stripArabicPrefix(normalizedWord);
        let dictHit =
          CATEGORY_DICTIONARY[word] ||
          CATEGORY_DICTIONARY[normalizedWord] ||
          (strippedWord !== normalizedWord ? CATEGORY_DICTIONARY[strippedWord] : undefined);
        
        // Ground detection override: "في الأرض" or "على الأرض" is not real estate investment
        if (dictHit === "استثمار" && (strippedWord === "ارض" || normalizedWord === "ارض") && /(?:في|على)\s+الارض/.test(allContextNorm)) {
          dictHit = undefined;
        }

        if (dictHit) {
          category = dictHit;
          const subHit =
            SUB_CATEGORY_MAP[word] ||
            SUB_CATEGORY_MAP[normalizedWord] ||
            (strippedWord !== normalizedWord ? SUB_CATEGORY_MAP[strippedWord] : undefined);
          if (subHit) {
            subCategory = subHit.subCategory;
            confidence = setMatch(85, "dict_unigram"); // Single-word + subcat: auto-save borderline
          } else {
            subCategory = "عام";
            confidence = setMatch(78, "dict_unigram"); // Single-word only: needs review
          }
          // The merchant, trigram, bigram and subcategory sites all disambiguate by
          // context; this one did not, so a multi-meaning single word (كارت) kept the
          // first sense the dictionary happened to list.
          const disambiguated =
            disambiguateContext(word, allContext, category, subCategory) ||
            disambiguateContext(normalizedWord, allContext, category, subCategory) ||
            (strippedWord !== normalizedWord
              ? disambiguateContext(strippedWord, allContext, category, subCategory)
              : null);
          if (disambiguated) {
            category = disambiguated.category;
            subCategory = disambiguated.subCategory;
            ambiguityFlags = [...(ambiguityFlags || []), "context_disambiguated"];
          }
          inferenceSource = "dictionary";
          found = true;
          break;
        }
      }
    }

    // 5.5 Store catalog: a named store when no purpose word answered ("اشتريت هدوم من
    // سبينيس" stays clothes; "سبينيس 500" is groceries).
    if (!found) {
      const store = findCatalogMerchant(allContext);
      if (store) {
        category = store.category;
        subCategory = store.subCategory;
        confidence = setMatch(80, "merchant_catalog");
        inferenceSource = "dictionary";
        ambiguityFlags = [...(ambiguityFlags || []), "catalog_store"];
        found = true;
      }
    }

    // 6. Fuzzy match (Damerau-Levenshtein — handles transpositions)
    if (!found) {
      for (const word of words) {
        // A word we already know is not a misspelling of a different word. Skipping
        // known verbs and currency units here is what keeps the typo layer from
        // answering with a category — and a direction — for a token that carries none.
        if (isKnownLexeme(word)) continue;
        // Nor is a person's name: "ولخالد 200" is money to Khaled, not a typo of the
        // bill-payment network خالص, and "لسارة" is not "ستارة".
        const bare = stripArabicPrefix(stripArabicPrefix(word));
        if (isLikelyPersonName(word) || isLikelyPersonName(bare)) continue;
        if (word.length >= 3) {
          // Damerau handles transpositions (e.g. "كهارب" ↔ "كهربا" = distance 2, not 3)
          // The budget has to scale with the word: two edits on a four-letter word means
          // half its letters changed, which is a different word, not a typo. That is how
          // `دبحت` was "corrected" into سكن and `خروف` into تعليم — categories invented
          // for words the dictionary simply does not contain.
          const limit = word.length <= 3 ? 0 : word.length <= 5 ? 1 : 2;
          const fuzzyResult = fuzzyFindCategory(word, CATEGORY_DICTIONARY, limit);
          if (fuzzyResult && typeof fuzzyResult === "string") {
            category = fuzzyResult;
            subCategory = "عام";
            confidence = setMatch(55, "fuzzy");
            inferenceSource = "dictionary";
            found = true;
            break;
          }
        }
      }
    }

    if (heldPerson || heldRail) {
      const purposeFound =
        found &&
        !PERSON_CATEGORIES.includes(category) &&
        !["متنوعات", "تحويل"].includes(category) &&
        // setMatch assigns matchKind inside a closure, which the compiler cannot follow.
        (matchKind as MatchKind) !== "fuzzy";
      if (purposeFound) {
        ambiguityFlags = [
          ...(ambiguityFlags || []),
          ...(heldPerson ? ["person_beside_purpose"] : []),
          ...(heldRail ? ["paid_through_rail"] : []),
        ];
      } else if (heldPerson) {
        // Money handed to someone with no purpose: the person's category.
        category = heldPerson.category;
        subCategory = heldPerson.subCategory;
        confidence = setMatch(heldPerson.confidence, "synonym_graph");
        inferenceSource = "synonym";
        ambiguityFlags = heldPerson.flags;
        found = true;
      } else if (heldRail) {
        category = heldRail.category;
        subCategory = heldRail.subCategory;
        confidence = setMatch(heldRail.confidence, "merchant_registry");
        inferenceSource = "dictionary";
        ambiguityFlags = ["merchant_registry_hit"];
        found = true;
      }
    }


    // Income with no specific category: other income, never a salary nobody named.
    if (intentResult.intent === "income" && !found) {
      category = "دخل آخر";
      subCategory = "عام";
      confidence = setMatch(intentResult.confidence, "intent_only");
    }

    // Expense with no specific category — low confidence so AI fallback can engage
    if (intentResult.intent === "expense" && !found) {
      category = "متنوعات";
      subCategory = "عام";
      confidence = setMatch(Math.min(intentResult.confidence, 40), "intent_only"); // Low confidence → triggers AI fallback
      found = true;
    }

    // If still "متنوعات", we let it pass through but with low confidence.
    // We no longer return early and discard all previous successes.
    if (category === "متنوعات" && confidence < 60) {
      // Keep going, this item will trigger `needsAI = true` at the end
    }

    let description = allContext
      .replace(/\d+(\.\d+)?/g, "")
      .replace(/(^|\s)(جنيه|ج\.م|ج|الف|ألف)(?=\s|$)/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
    if (!description || description.length < 2) {
      // Bug #13 fix: Multi-word matches should score HIGHER than single-word.
      // Previously: bigram=84-86, unigram=85-88 (inverted — fixed to 89/87).
      confidence = setMatch(intentResult.intent === "income" ? 75 : 70, "fallback");
      description = intentResult.intent === "income" ? "دخل" : category;
    }

    // Strategy 5: Hierarchical Subcategory Cascade — refine generic subcategories
    const refinedSubCategory = refineSubCategory(
      category,
      subCategory,
      allContext,
    );

    let finalConfidence = confidence;
    // A refined subcategory used to floor the score at 82, which promoted a fuzzy
    // string match (55) to just under the auto-save line on the strength of a
    // SUBCATEGORY guess. Finding a better subcategory says nothing about whether the
    // CATEGORY is right, and the calibration layer already knows how often each match
    // kind is correct. The refinement is recorded as evidence instead of as a bonus.
    if (subCategory === "عام" && refinedSubCategory !== "عام") {
      ambiguityFlags = [...(ambiguityFlags || []), "subcategory_refined"];
    }

    // ─── Polarity & Negation Filter ───
    //
    // A negated or cancelled transaction is not a low-confidence transaction — it did
    // not happen. Zeroing the score still let it reach the review screen and, through
    // a confident sibling item, an auto-save: "كنت هروح الجيم وادفع 500 بس مروحتش"
    // used to persist a 500 EGP gym expense. It is dropped instead.
    const negation = detectNegation(allContext);
    if (negation.negated) {
      continue;
    }

    const polarity = detectPolarityAndNegation(allContext);
    if (polarity.isNegated) {
      continue;
    } else if (polarity.polarityMultiplier < 1.0) {
      finalConfidence = Math.round(finalConfidence * polarity.polarityMultiplier);
      ambiguityFlags = [...(ambiguityFlags || []), `polarity_${polarity.reason}`];
    }

    // Context-Aware Ambiguity Scorer: Only penalize when ambiguous words appear
    // WITHOUT a clear disambiguating context.
    const ambiguityRegex = /(حساب|باقة|باقه|كارت|شحن|رصيد)/;
    if (ambiguityRegex.test(allContextNorm) && finalConfidence > 0 && finalConfidence < 90) {
      // Check if context already disambiguates the ambiguous word
      const hasClearContext =
        /(?:نت|انترنت|إنترنت|راوتر|واي\s*فاي|wifi|وي)/i.test(allContextNorm) ||  // internet bill
        /(?:كهربا|كهرباء|مياه|مايه|غاز)/.test(allContextNorm) ||                  // utility bill
        /(?:موبايل|تليفون|فودافون|اورنج|اتصالات)/i.test(allContextNorm) ||       // mobile recharge
        /(?:فواتير|فاتوره|فاتورة)/.test(allContextNorm) ||                        // explicit bill context
        /(?:بنزين|تفويل[ةه]|محط[ةه])/i.test(allContextNorm) ||                     // fuel context for "شحن"
        /(?:شحن\s*رصيد|رصيد\s*شحن)/.test(allContextNorm) ||                        // "شحن رصيد" together = clear
        /(?:حساب|حاسبت|حاسبنا)\s+(?:المطعم|الكافيه|القهوة|السوبر|الدكتور|المستشفى|الصيدلية|الاوبر|التاكسي|الفاتورة|النت|الكهربا|الاكل|الأكل)/i.test(allContextNorm) || // clear merchant account payment
        ambiguityFlags?.includes("merchant_registry_hit") ||                        // merchant already matched
        ambiguityFlags?.includes("context_disambiguated");                          // disambiguation already resolved
      if (!hasClearContext) {
        // The flag is the signal; the number is not. This used to clamp to 45 inside a
        // `< 90` window, so a trigram (92) escaped the penalty entirely while a bigram
        // (88) carrying the same ambiguous word was slammed to 45 — a 43-point swing
        // decided by n-gram length rather than by how ambiguous the text was. The flag
        // now routes the item to its own calibration bucket, where its real accuracy is
        // measured rather than guessed.
        ambiguityFlags = [...(ambiguityFlags || []), "ambiguity_scorer_penalty"];
      }
    }


    // ── Direction-governed nouns ──────────────────────────────────────────────
    // The verb governs direction, the noun governs category. Without this the generic
    // verb keyword wins the category outright: "قبضت الجمعية" matched قبض → مرتب and
    // "دفعت قسط الجمعية" matched قسط → فواتير, leaving the registry's own تحويل/جمعية
    // unreachable and filing a gam3eya payout as salary.
    const governed = resolveGovernedTaxonomy(allContextNorm);
    if (governed) {
      matchKind = "governed_noun";
      ambiguityFlags = [
        ...(ambiguityFlags || []),
        `direction_governed:${governed.matchedNoun}:${governed.direction}`,
      ];
    }

    const effectiveIntent = governed ? governed.type : intentResult.intent;
    const governedCategory = governed ? governed.category : category;

    let registeredType = CATEGORIES.find(
      (registeredCategory) => registeredCategory.name_ar === governedCategory,
    )?.type;

    let finalCategory = governedCategory;
    let finalSubCategory = governed ? governed.subCategory : refinedSubCategory;
    // Money back from something bought is spending coming back to the category it was
    // bought from, not income: it is saved as a negative expense there, so every total of
    // spending nets it (docs/decisions/0010-refunds-net-their-category.md).
    let isRefund = false;

    // The noun named a spending category (or the verb بعت named a transfer), yet the
    // direction says money came in. The income category is chosen from what came in,
    // never guessed as salary (docs/decisions/0008-money-movements-and-taxonomy.md).
    if (
      !governed &&
      effectiveIntent === "income" &&
      registeredType === "transfer" &&
      readsAsSale(allContextNorm)
    ) {
      // "بعت الموبايل القديم ب 4000": the price of something sold.
      finalCategory = "دخل آخر";
      finalSubCategory = "بيع حاجة";
      finalConfidence = Math.min(finalConfidence, 80);
      matchKind = "intent_only";
      registeredType = "income";
    } else if (!governed && effectiveIntent === "income" && registeredType === "expense") {
      if (category === "هدايا وصدقات" || GIFT_NOUN.test(allContextNorm)) {
        // "خدت عيدية 500": a gift the user received.
        finalCategory = "هدايا وعيديات";
        finalSubCategory = /عيدي/.test(allContextNorm)
          ? "عيدية"
          : /نقط|نقوط/.test(allContextNorm)
            ? "نقطة"
            : "هدية فلوس";
      } else if (readsAsRefund(allContextNorm) && !PERSON_CATEGORIES.includes(category)) {
        // "رجعت الجزمة واخدت فلوسي 300": the shoes' category gets its money back.
        isRefund = true;
        finalCategory = category;
        finalSubCategory = refinedSubCategory;
        if (category === "متنوعات") {
          finalConfidence = Math.min(finalConfidence, 70);
        }
      } else if (/(رجع|استرد|استرجع|مرتجع|باقي|بقيت)/.test(allContextNorm)) {
        // "رجعت الجزمة واخدت فلوسي": money back from a purchase.
        finalCategory = "دخل آخر";
        finalSubCategory = "مرتجعات واسترداد";
      } else if (PERSON_CATEGORIES.includes(category)) {
        // Preserve person subcategory — e.g., "استلمت من أحمد" stays as أصدقاء/عام.
        finalCategory = category;
        finalSubCategory = refinedSubCategory;
      } else if (/(?:^|\s)[وف]?(?:بعت|بيعت|بايع|بيع)(?=\s|$)/.test(allContextNorm)) {
        // "بعت الموبايل القديم ب 4000": the noun is what was sold.
        finalCategory = "دخل آخر";
        finalSubCategory = "بيع حاجة";
        finalConfidence = Math.min(finalConfidence, 80);
        matchKind = "intent_only";
      } else if (/(?:^|\s)من\s+(?:ال)?شغل(?:ي|ه|ها|نا)?(?=\s|$)/.test(allContextNorm)) {
        // "جاني 1500 من الشغل": pay from the job is the salary.
        finalCategory = "مرتب";
        finalSubCategory = "مرتب أساسي";
        finalConfidence = Math.min(finalConfidence, 80);
        matchKind = "intent_only";
      } else {
        // Nothing names the source. It is other income at intent strength, so it goes to
        // review instead of being saved as a salary nobody mentioned.
        finalCategory = "دخل آخر";
        finalSubCategory = "عام";
        finalConfidence = Math.min(finalConfidence, 80);
        matchKind = "intent_only";
      }
      registeredType = isRefund ? "expense" : "income";
    }

    const isNeutralCategory = ["متنوعات", ...PERSON_CATEGORIES].includes(finalCategory);
    let finalType = isNeutralCategory ? effectiveIntent : (registeredType || effectiveIntent);
    if (effectiveIntent === "income") {
      finalType = isRefund ? "expense" : "income";
    }
    // A governed noun decided the direction from its verb; nothing downstream may
    // override it, otherwise "قبضت الجمعية" reverts to the category's default type.
    if (governed) finalType = governed.type;
    if (!governed && readsAsRefund(allContextNorm)) {
      if (finalType === "expense" && !PERSON_CATEGORIES.includes(finalCategory)) {
        // "رجعت الموبايل واستردت فلوسه": the verb read as buying, the money came back.
        isRefund = true;
      } else if (finalType === "income" && finalCategory === "دخل آخر" && finalSubCategory === "عام") {
        // "جالي استرداد 200": money back from something unnamed stays income, named.
        finalSubCategory = "مرتجعات واسترداد";
      }
    }

    items.push(
      applyProfileHints(
        {
          amount,
          category: finalCategory,
          subCategory: finalSubCategory,
          description,
          type: finalType,
          confidence: finalConfidence,
          ...(isRefund ? { direction: "incoming" as const } : {}),
          ...(governed && finalType === "transfer"
            ? { direction: governed.direction === "in" ? ("incoming" as const) : ("outgoing" as const) }
            : {}),
          currency: "EGP",
          needsReview: finalConfidence < 85,
          reviewReasons: finalConfidence < 85 ? ["raw_category_confidence"] : undefined,
          parsedBy: "rule_engine",
          inferenceSource,
          ambiguityFlags,
          confidenceBreakdown: {
            intent: intentResult.confidence,
            taxonomy: finalConfidence,
            heuristics: Math.min(
              100,
              Math.max(
                20,
                Math.round((intentResult.confidence + finalConfidence) / 2),
              ),
            ),
          },
          evidence: {
            matchKind,
            rawStrength: finalConfidence,
            // Agreement is filled in by the pipeline, which is the only layer that sees
            // more than one resolver's opinion of the same segment.
            agreement: 0,
            disagreement: 0,
            anchorConsumed: true,
            categoryIsFallback: finalCategory === "متنوعات",
            personResolved: "none",
            hasAmbiguityPenalty: (ambiguityFlags || []).includes("ambiguity_scorer_penalty"),
            ambiguityFlagCount: (ambiguityFlags || []).length,
          },
        },
        allContext,
        profileContext,
      ),
    );
  }

  // Check if any item has low confidence or if text is complex → needs AI
  const needsAI =
    items.some((it) => it.category === "متنوعات" || it.confidence < 80) ||
    isComplex;

  return { items, usedAI: false, needsAI };
}

function applyProfileHints(
  item: ParsedTransaction,
  context: string,
  profileContext?: ClassificationProfileContext,
): ParsedTransaction {
  if (!profileContext || item.type !== "expense") return item;

  const next: ParsedTransaction = { ...item };
  const flags = new Set(next.ambiguityFlags || []);

  if (
    profileContext.hasChildren === true &&
    /(مدرس|مدرسة|حضانة|حضانه|درس|دروس|كتب|يونيفورم)/.test(context)
  ) {
    if (next.category === "متنوعات" || next.confidence < 92) {
      const nursery = /حضان[ةه]/.test(context);
      next.category = nursery ? "أطفال" : "تعليم";
      next.subCategory = nursery ? "حضانة" : /درس|دروس/.test(context) ? "دروس خصوصية" : "مدرسة";
      next.confidence = Math.max(next.confidence, 92);
      next.needsReview = false;
      flags.add("profile_children_education_hint");
    }
  }

  if (
    profileContext.responsibleForFamily === true &&
    /(طلبات البيت|مصروف البيت|سوبر ماركت|بقالة|منظفات)/.test(context)
  ) {
    if (next.category === "متنوعات" || next.confidence < 88) {
      next.category = /منظفات/.test(context) ? "سكن" : "أكل وشرب";
      next.subCategory = /منظفات/.test(context) ? "منظفات" : "بقالة";
      next.confidence = Math.max(next.confidence, 88);
      next.needsReview = next.confidence < 85;
      flags.add("profile_family_household_hint");
    }
  }

  next.ambiguityFlags = Array.from(flags);
  if (next.confidenceBreakdown) {
    next.confidenceBreakdown = {
      ...next.confidenceBreakdown,
      taxonomy: Math.max(next.confidenceBreakdown.taxonomy, next.confidence),
    };
  }
  return next;
}
