/**
 * SmartSpend Rule Engine (Step 4)
 * Fast classification without AI for simple/clear transactions
 */

import { CATEGORY_DICTIONARY } from "./egyptian-dictionary";
import { fuzzyFindCategory } from "./fuzzy-match";
import { detectIntent, type TransactionIntent } from "./intent-detector";
import { extractAmounts, type ExtractedAmount } from "./entity-extractor";
import { normalizeText } from "./text-normalizer";
import { CATEGORIES } from "./category-registry";
import { findTaxonomyMatch } from "./taxonomy-adapter";

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
  date?: string; // Add optional date string for parsed dates like "yesterday"
  confidenceBreakdown?: {
    intent: number;
    taxonomy: number;
    heuristics: number;
  };
}

export interface ClassificationProfileContext {
  hasChildren?: boolean | null;
  responsibleForFamily?: boolean | null;
  supportsOthers?: unknown;
  fixedMonthlyCommitments?: unknown;
}

/** Sub-category mapping from dictionary keywords */
const SUB_CATEGORY_MAP: Record<string, { category: string; subCategory: string }> = {
  // Food subcategories
  "كنتاكي": { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  "ماكدونالدز": { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  "هارديز": { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  "برجر كينج": { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  "بيتزا هت": { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  "شاورما": { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  "كشري": { category: "أكل وشرب", subCategory: "مطعم" },
  "مطعم": { category: "أكل وشرب", subCategory: "مطعم" },
  "دليفري": { category: "أكل وشرب", subCategory: "دليفري" },
  "تيك اواي": { category: "أكل وشرب", subCategory: "دليفري" },
  "قهوه": { category: "أكل وشرب", subCategory: "قهوة وكافيه" },
  "نسكافيه": { category: "أكل وشرب", subCategory: "قهوة وكافيه" },
  "كافيه": { category: "ترفيه", subCategory: "كافيه وشيشة" },
  "بقاله": { category: "أكل وشرب", subCategory: "بقالة" },
  "بقال": { category: "أكل وشرب", subCategory: "بقالة" },
  "سمك": { category: "أكل وشرب", subCategory: "سي فود" },
  "جمبري": { category: "أكل وشرب", subCategory: "سي فود" },
  "فراخ": { category: "أكل وشرب", subCategory: "لحوم ودواجن" },
  "لحمه": { category: "أكل وشرب", subCategory: "لحوم ودواجن" },
  "فرن": { category: "أكل وشرب", subCategory: "مخبوزات" },
  "مخبز": { category: "أكل وشرب", subCategory: "مخبوزات" },
  "عيش": { category: "أكل وشرب", subCategory: "مخبوزات" },
  // Transport subcategories
  "اوبر": { category: "مواصلات", subCategory: "أوبر/كريم" },
  "كريم": { category: "مواصلات", subCategory: "أوبر/كريم" },
  "مترو": { category: "مواصلات", subCategory: "مترو" },
  "اتوبيس": { category: "مواصلات", subCategory: "أتوبيس" },
  "باص": { category: "مواصلات", subCategory: "أتوبيس" },
  "تكسي": { category: "مواصلات", subCategory: "تاكسي" },
  "تاكسي": { category: "مواصلات", subCategory: "تاكسي" },
  "بنزين": { category: "مواصلات", subCategory: "بنزين" },
  "تفويله": { category: "مواصلات", subCategory: "بنزين" },
  "ركنه": { category: "مواصلات", subCategory: "ركنة" },
  "جراج": { category: "مواصلات", subCategory: "ركنة" },
  "توكتوك": { category: "مواصلات", subCategory: "توكتوك" },
  "صيانه عربيه": { category: "مواصلات", subCategory: "صيانة عربية" },
  // Bills subcategories
  "كهربا": { category: "فواتير", subCategory: "كهرباء" },
  "نور": { category: "فواتير", subCategory: "كهرباء" },
  "ميه": { category: "فواتير", subCategory: "مياه" },
  "غاز": { category: "فواتير", subCategory: "غاز" },
  "نت": { category: "فواتير", subCategory: "إنترنت" },
  "راوتر": { category: "فواتير", subCategory: "إنترنت" },
  "شحن": { category: "فواتير", subCategory: "شحن رصيد" },
  "رصيد": { category: "فواتير", subCategory: "شحن رصيد" },
  "قسط": { category: "فواتير", subCategory: "أقساط" },
  "اقساط": { category: "فواتير", subCategory: "أقساط" },
  "تامين": { category: "فواتير", subCategory: "تأمين" },
  "ضرايب": { category: "فواتير", subCategory: "ضرائب" },
  // Home subcategories
  "ايجار": { category: "سكن", subCategory: "إيجار" },
  "عفش": { category: "سكن", subCategory: "أثاث" },
  "سباك": { category: "سكن", subCategory: "صيانة" },
  "كهربائي": { category: "سكن", subCategory: "صيانة" },
  "نقاش": { category: "سكن", subCategory: "صيانة" },
  "نجار": { category: "سكن", subCategory: "صيانة" },
  "شغاله": { category: "سكن", subCategory: "نظافة" },
  "منظفات": { category: "سكن", subCategory: "منظفات" },
  "غساله": { category: "سكن", subCategory: "أجهزة منزلية" },
  "تلاجه": { category: "سكن", subCategory: "أجهزة منزلية" },
  // Shopping subcategories
  "هدوم": { category: "تسوق", subCategory: "ملابس" },
  "لبس": { category: "تسوق", subCategory: "ملابس" },
  "موبايل": { category: "تسوق", subCategory: "أجهزة إلكترونية" },
  "لاب توب": { category: "تسوق", subCategory: "أجهزة إلكترونية" },
  "ايفون": { category: "تسوق", subCategory: "أجهزة إلكترونية" },
  "كوتشي": { category: "تسوق", subCategory: "أحذية" },
  "جزمه": { category: "تسوق", subCategory: "أحذية" },
  // Health subcategories
  "دكتور": { category: "صحة", subCategory: "دكتور" },
  "صيدليه": { category: "صحة", subCategory: "صيدلية" },
  "دوا": { category: "صحة", subCategory: "صيدلية" },
  "تحاليل": { category: "صحة", subCategory: "تحاليل" },
  "مستشفى": { category: "صحة", subCategory: "مستشفى" },
  "اسنان": { category: "صحة", subCategory: "أسنان" },
  // Education subcategories
  "مدرسه": { category: "تعليم", subCategory: "مدرسة" },
  "جامعه": { category: "تعليم", subCategory: "جامعة" },
  "كورس": { category: "تعليم", subCategory: "كورسات" },
  "درس": { category: "تعليم", subCategory: "دروس خصوصية" },
  "دروس": { category: "تعليم", subCategory: "دروس خصوصية" },
  // Entertainment subcategories
  "سينما": { category: "ترفيه", subCategory: "سينما" },
  "جيم": { category: "ترفيه", subCategory: "رياضة وجيم" },
  "نادي": { category: "ترفيه", subCategory: "رياضة وجيم" },
  "سفر": { category: "ترفيه", subCategory: "سفر" },
  "مصيف": { category: "ترفيه", subCategory: "سفر" },
  "خروجه": { category: "ترفيه", subCategory: "خروجة" },
  "شيشه": { category: "ترفيه", subCategory: "كافيه وشيشة" },
  // Subscriptions
  "نتفلكس": { category: "اشتراكات", subCategory: "نتفلكس" },
  "سبوتيفاي": { category: "اشتراكات", subCategory: "سبوتيفاي" },
  // Gifts
  "هديه": { category: "هدايا وصدقات", subCategory: "عام" },
  "صدقه": { category: "هدايا وصدقات", subCategory: "صدقة/تبرع" },
  "زكاه": { category: "هدايا وصدقات", subCategory: "زكاة" },
  "عيديه": { category: "هدايا وصدقات", subCategory: "عيدية" },
  // Investment
  "ذهب": { category: "استثمار", subCategory: "ذهب" },
  "دهب": { category: "استثمار", subCategory: "ذهب" },
  "اسهم": { category: "استثمار", subCategory: "أسهم" },
  "شهاده": { category: "استثمار", subCategory: "شهادات" },
  // Income subcategories
  "مرتب": { category: "مرتب", subCategory: "مرتب أساسي" },
  "بونص": { category: "مرتب", subCategory: "مكافأة/بونص" },
  "مكافاه": { category: "مرتب", subCategory: "مكافأة/بونص" },
  "عموله": { category: "عمل حر", subCategory: "عمولة" },
  "سبوبه": { category: "عمل حر", subCategory: "سبوبة" },
  "سجاير": { category: "تسوق", subCategory: "عناية شخصية" },
  "سجائر": { category: "تسوق", subCategory: "عناية شخصية" },
  "سجاره": { category: "تسوق", subCategory: "عناية شخصية" },
  "حلاق": { category: "تسوق", subCategory: "عناية شخصية" },
  "لبان": { category: "أكل وشرب", subCategory: "سناكس" },
  "شيبسي": { category: "أكل وشرب", subCategory: "سناكس" },
  "اوريو": { category: "أكل وشرب", subCategory: "سناكس" },
  "هوهوز": { category: "أكل وشرب", subCategory: "سناكس" },
  "دونت": { category: "أكل وشرب", subCategory: "سناكس" },
  "تويست": { category: "أكل وشرب", subCategory: "سناكس" },
  "بلايستيشن": { category: "ترفيه", subCategory: "ألعاب" },
  "كورة": { category: "ترفيه", subCategory: "رياضة وجيم" },
  "كوره": { category: "ترفيه", subCategory: "رياضة وجيم" },
};

/**
 * Determine if text is simple enough for rule engine (no AI needed)
 */
export function isSimpleText(text: string): boolean {
  const normalizedLen = text.length;
  const wordCount = text.split(/\s+/).length;

  // Too long = complex
  if (normalizedLen > 200 || wordCount > 30) return false;

  // Multiple "و" connectors with amounts = multi-transaction
  const amounts = extractAmounts(text);
  if (amounts.length > 4) return false;

  // Ambiguous phrases
  const ambiguousPatterns = [
    /حولت\s+\S+/, // "حولت لأحمد" - ambiguous
    /حطيت\s+فلوس/, // "حطيت فلوس" - ambiguous
    /ولا\s+\d/, // "خمسين ولا ستين" - uncertain
  ];

  for (const pattern of ambiguousPatterns) {
    if (pattern.test(text)) return false;
  }

  return true;
}

/**
 * Run the rule engine on normalized text
 */
export function runRuleEngine(
  normalizedText: string,
  userDict: Array<{ word: string; category: string; subCategory?: string }> = [],
  profileContext?: ClassificationProfileContext
): RuleEngineResult {
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

  for (let i = 0; i < amounts.length; i++) {
    const { amount, index, length } = amounts[i];
    const contextStart = i > 0 ? amounts[i - 1].index + amounts[i - 1].length : 0;
    const contextEnd = i < amounts.length - 1 ? amounts[i + 1].index : normalizedText.length;
    const beforeAmount = normalizedText.slice(contextStart, index).trim();
    const afterAmount = normalizedText.slice(index + length, contextEnd).trim();
    const allContext = (beforeAmount + " " + afterAmount).trim();

    // Detect intent
    const intentResult = detectIntent(allContext);

    // Find category + subcategory
    let category = intentResult.intent === "income" ? "مرتب" : "متنوعات";
    let subCategory = "عام";
    let confidence = 30;
    let inferenceSource: ParsedTransaction["inferenceSource"] = "rule";
    let ambiguityFlags: string[] | undefined;
    const words = allContext.split(/\s+/).filter(w => w.length >= 2);

    // 1. User dictionary (highest priority)
    let found = false;
    for (const word of words) {
      const userMatch = userDict.find(ud => ud.word === word);
      if (userMatch) {
        category = userMatch.category;
        subCategory = userMatch.subCategory || "عام";
        confidence = 100;
        inferenceSource = "dictionary";
        found = true;
        break;
      }
    }

    if (!found) {
      const synonymMatch = findTaxonomyMatch(allContext);
      if (synonymMatch) {
        category = synonymMatch.category;
        subCategory = synonymMatch.subCategory;
        confidence = synonymMatch.confidence;
        inferenceSource = "synonym";
        ambiguityFlags = synonymMatch.ambiguityFlags;
        found = true;
      }
    }

    // 2. Subcategory map (enriched matching — exact word)
    if (!found) {
      for (const word of words) {
        if (SUB_CATEGORY_MAP[word]) {
          category = SUB_CATEGORY_MAP[word].category;
          subCategory = SUB_CATEGORY_MAP[word].subCategory;
          confidence = 90;
          inferenceSource = "rule";
          found = true;
          break;
        }
      }
    }

    // 2.5. Substring matching in SUB_CATEGORY_MAP (catches "فبلايستيشن" → "بلايستيشن")
    if (!found) {
      const subMapKeys = Object.keys(SUB_CATEGORY_MAP);
      for (const word of words) {
        for (const key of subMapKeys) {
          if (key.length >= 3 && (word.includes(key) || key.includes(word)) && word.length >= 3) {
            category = SUB_CATEGORY_MAP[key].category;
            subCategory = SUB_CATEGORY_MAP[key].subCategory;
            confidence = 82;
            inferenceSource = "rule";
            found = true;
            break;
          }
        }
        if (found) break;
      }
    }

    // 3. Multi-word subcategory match
    if (!found) {
      for (let w = 0; w < words.length - 1; w++) {
        const phrase = words[w] + " " + words[w + 1];
        if (SUB_CATEGORY_MAP[phrase]) {
          category = SUB_CATEGORY_MAP[phrase].category;
          subCategory = SUB_CATEGORY_MAP[phrase].subCategory;
          confidence = 88;
          inferenceSource = "rule";
          found = true;
          break;
        }
      }
    }

    // 4. Global dictionary (main category) + auto-fill subcategory from SUB_CATEGORY_MAP
    if (!found) {
      for (const word of words) {
        if (CATEGORY_DICTIONARY[word]) {
          category = CATEGORY_DICTIONARY[word];
          // Try to derive a more specific subcategory
          if (SUB_CATEGORY_MAP[word]) {
            subCategory = SUB_CATEGORY_MAP[word].subCategory;
            confidence = 88;
          } else {
            subCategory = "عام";
            confidence = 85;
          }
          inferenceSource = "dictionary";
          found = true;
          break;
        }
      }
    }

    // 5. Multi-word global dictionary
    if (!found) {
      for (let w = 0; w < words.length - 1; w++) {
        const phrase = words[w] + " " + words[w + 1];
        if (CATEGORY_DICTIONARY[phrase]) {
          category = CATEGORY_DICTIONARY[phrase];
          subCategory = "عام";
          confidence = 80;
          inferenceSource = "dictionary";
          found = true;
          break;
        }
      }
    }

    // 6. Fuzzy match
    if (!found) {
      for (const word of words) {
        const fuzzyResult = fuzzyFindCategory(word, CATEGORY_DICTIONARY, 2);
        if (fuzzyResult && typeof fuzzyResult === "string") {
          category = fuzzyResult;
          subCategory = "عام";
          confidence = 60;
          inferenceSource = "dictionary";
          found = true;
          break;
        }
      }
    }

    // Income with no specific category
    if (intentResult.intent === "income" && !found) {
      category = "مرتب";
      subCategory = "عام";
      confidence = intentResult.confidence;
    }

    // If still "متنوعات", we let it pass through but with low confidence.
    // We no longer return early and discard all previous successes.
    if (category === "متنوعات" && confidence < 60) {
      // Keep going, this item will trigger `needsAI = true` at the end
    }

    let description = allContext
      .replace(/\d+(\.\d+)?/g, "")
      .replace(/(جنيه|ج\.م|ج|الف|ألف)/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 60);
    if (!description || description.length < 2) {
      description = intentResult.intent === "income" ? "دخل" : category;
    }

    items.push(applyProfileHints({
      amount,
      category,
      subCategory,
      description,
      type: intentResult.intent,
      confidence,
      currency: "EGP",
      needsReview: confidence < 85,
      parsedBy: "rule_engine",
      inferenceSource,
      ambiguityFlags,
      confidenceBreakdown: {
        intent: intentResult.confidence,
        taxonomy: confidence,
        heuristics: Math.min(100, Math.max(20, Math.round((intentResult.confidence + confidence) / 2))),
      },
    }, allContext, profileContext));
  }

  // Check if any item has low confidence or if text is complex → needs AI
  const needsAI = items.some(it => it.category === "متنوعات" || it.confidence < 80) || isComplex;

  return { items, usedAI: false, needsAI };
}

function applyProfileHints(
  item: ParsedTransaction,
  context: string,
  profileContext?: ClassificationProfileContext
): ParsedTransaction {
  if (!profileContext || item.type !== "expense") return item;

  const next: ParsedTransaction = { ...item };
  const flags = new Set(next.ambiguityFlags || []);

  if (
    profileContext.hasChildren === true &&
    /(مدرس|مدرسة|حضانة|درس|دروس|كتب|يونيفورم)/.test(context)
  ) {
    if (next.category === "متنوعات" || next.confidence < 92) {
      next.category = "تعليم";
      next.subCategory = /درس|دروس/.test(context) ? "دروس خصوصية" : "مدرسة";
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
