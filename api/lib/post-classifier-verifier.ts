/**
 * SmartSpend v2 — Post-Classifier Verifier
 * ═════════════════════════════════════════
 * Runs AFTER all segments are classified. Performs cross-segment
 * verification, catches duplicates, validates taxonomy, and adjusts
 * confidence. 100% local processing, 0 tokens.
 */

import { CATEGORIES, getCategoryByArabicName } from "./category-registry";
import type { ParsedTransaction } from "./rule-engine";
import { extractAmounts } from "./entity-extractor";

// ─── Types ────────────────────────────────────────────────────────

export interface VerificationFlag {
  type:
    | "duplicate"
    | "amount_mismatch"
    | "intent_conflict"
    | "taxonomy_invalid"
    | "anomaly"
    | "amount_sanity";
  severity: "info" | "warning" | "error";
  /** Arabic message explaining the issue */
  message: string;
  /** Indices of affected items */
  affectedItems: number[];
}

export interface VerificationResult {
  /** Potentially modified items */
  items: ParsedTransaction[];
  /** Verification flags */
  flags: VerificationFlag[];
  /** Adjusted overall confidence */
  overallConfidence: number;
}

export interface MonthlyContext {
  totalIncome: number;
  totalExpense: number;
}

// ─── Category Type Maps ──────────────────────────────────────────

// Bug #14 fix: متنوعات is a neutral fallback, NOT expense-only.
// Removing it prevents unclassified income from being silently converted to expense.
const EXPENSE_ONLY_CATEGORIES = new Set([
  "أكل وشرب",
  "مواصلات",
  "فواتير",
  "سكن",
  "تسوق",
  "صحة",
  "تعليم",
  "ترفيه",
  "اشتراكات",
  "تدخين",
  "حيوانات أليفة",
  "عمل",
  "خدمات رقمية",
  "خدمات سيارات",
  // "متنوعات" — REMOVED: neutral fallback, not expense-only
]);

const INCOME_ONLY_CATEGORIES = new Set(["مرتب", "عمل حر", "عوائد استثمار"]);

// ─── Max Amount Constant ─────────────────────────────────────────

const MAX_AMOUNT = 10_000_000; // 10 million EGP

// ─── Main Verification Function ─────────────────────────────────

/**
 * Verify classified items for consistency, duplicates, and errors.
 * Returns modified items with adjusted confidence and flags.
 */
export function verifyClassifiedItems(
  items: ParsedTransaction[],
  originalText: string,
  monthlyContext?: MonthlyContext,
): VerificationResult {
  if (items.length === 0) {
    return { items: [], flags: [], overallConfidence: 0 };
  }

  const flags: VerificationFlag[] = [];
  // Bug #15 fix: Deep copy using spread on each item — prevents mutations from
  // leaking back to the caller's original array (shallow [...items] was mutating originals).
  let verifiedItems = items.map((item) => ({ ...item }));

  // Step 1: Normalize amounts
  verifiedItems = normalizeAmounts(verifiedItems);

  // Step 2: Detect duplicates
  const totalAmountsInText = extractAmounts(originalText).length;
  if (verifiedItems.length !== totalAmountsInText) {
    const dupFlags = detectDuplicates(verifiedItems);
    if (dupFlags.length > 0) {
      flags.push(...dupFlags);
      // Remove the lower-confidence duplicate
      const toRemove = new Set<number>();
      for (const flag of dupFlags) {
        if (flag.affectedItems.length >= 2) {
          const [a, b] = flag.affectedItems;
          // Keep the one with higher confidence
          const remove =
            verifiedItems[a].confidence >= verifiedItems[b].confidence ? b : a;
          toRemove.add(remove);
        }
      }
      verifiedItems = verifiedItems.filter((_, idx) => !toRemove.has(idx));
    }
  }

  // Step 3: Check intent-taxonomy conflicts
  const intentFlags = checkIntentTaxonomyConflicts(verifiedItems);
  flags.push(...intentFlags);

  // Step 4: Validate taxonomy
  const taxFlags = validateTaxonomy(verifiedItems);
  flags.push(...taxFlags);

  // Step 5: Amount sanity check
  const sanityFlags = checkAmountSanity(verifiedItems, originalText);
  flags.push(...sanityFlags);

  // Step 6: Cross-segment anomaly detection
  if (monthlyContext) {
    const anomalyFlags = detectAnomalies(verifiedItems, monthlyContext);
    flags.push(...anomalyFlags);
  }

  // Step 7: Adjust confidence based on verification results
  verifiedItems = adjustConfidence(verifiedItems, flags);

  // Calculate overall confidence
  const overallConfidence =
    verifiedItems.length > 0
      ? Math.round(
          verifiedItems.reduce((sum, it) => sum + it.confidence, 0) /
            verifiedItems.length,
        )
      : 0;

  return {
    items: verifiedItems,
    flags,
    overallConfidence,
  };
}

// ─── Step 1: Normalize Amounts ──────────────────────────────────

/**
 * Ensure all amounts are positive, rounded to 2 decimals, and capped.
 */
export function normalizeAmounts(
  items: ParsedTransaction[],
): ParsedTransaction[] {
  return items.map((item) => ({
    ...item,
    amount: Math.min(MAX_AMOUNT, Math.round(Math.abs(item.amount) * 100) / 100),
  }));
}

// ─── Step 2: Duplicate Detection ────────────────────────────────

function detectDuplicates(items: ParsedTransaction[]): VerificationFlag[] {
  const flags: VerificationFlag[] = [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];

      // Same amount AND same category → possible duplicate
      if (
        a.amount === b.amount &&
        a.category === b.category &&
        a.type === b.type &&
        a.person_mentioned === b.person_mentioned
      ) {
        // Check if descriptions are also similar (not different items of same price)
        const descSimilar = areDescriptionsSimilar(
          a.description,
          b.description,
        );
        if (descSimilar) {
          flags.push({
            type: "duplicate",
            severity: "warning",
            message: `عملية مكررة محتملة: ${a.amount} جنيه في "${a.category}" — هيتم حذف المكرر`,
            affectedItems: [i, j],
          });
        }
      }
    }
  }

  return flags;
}

import { normalizeArabicCompact as normalizeArabicForCompare } from "./unified-normalizer";

function areDescriptionsSimilar(a: string, b: string): boolean {
  if (!a || !b) return true;
  const na = normalizeArabicForCompare(a);
  const nb = normalizeArabicForCompare(b);
  if (na === nb) return true;

  const wordsA = na.split(/\s+/);
  const wordsB = new Set(nb.split(/\s+/));
  let overlap = 0;
  for (let i = 0; i < wordsA.length; i++) {
    if (wordsB.has(wordsA[i])) overlap++;
  }
  const uniqueA = new Set(wordsA);
  const similarity = overlap / Math.max(uniqueA.size, wordsB.size);
  return similarity >= 0.6;
}

// ─── Step 3: Intent-Taxonomy Conflict ────────────────────────────

function checkIntentTaxonomyConflicts(
  items: ParsedTransaction[],
): VerificationFlag[] {
  const flags: VerificationFlag[] = [];

  items.forEach((item, idx) => {
    // Bug #14 fix: متنوعات is now neutral — don't auto-flip income→expense for it.
    // Only correct genuine expense-only categories (food, transport, bills, etc.).
    if (item.type === "income" && EXPENSE_ONLY_CATEGORIES.has(item.category)) {
      if (item.category === "متنوعات") {
        // متنوعات = unclassified, not inherently expense.
        // Mark for review but do NOT change intent.
        item.needsReview = true;
        flags.push({
          type: "intent_conflict",
          severity: "info",
          message: `دخل غير مصنف في "متنوعات" — يرجى مراجعة تصنيف هذا الدخل`,
          affectedItems: [idx],
        });
      } else {
        // Genuine expense-only category with income intent → correct it
        flags.push({
          type: "intent_conflict",
          severity: "warning",
          message: `تعارض: نوع العملية "دخل" لكن الفئة "${item.category}" فئة مصروفات — هيتم تصحيحها تلقائي`,
          affectedItems: [idx],
        });
        item.type = "expense";
        item.confidence = Math.max(item.confidence - 10, 30);
      }
    }

    // Expense type but income-only category
    if (item.type === "expense" && INCOME_ONLY_CATEGORIES.has(item.category)) {
      flags.push({
        type: "intent_conflict",
        severity: "warning",
        message: `تعارض: نوع العملية "مصروف" لكن الفئة "${item.category}" فئة دخل — هيتم تصحيحها تلقائي`,
        affectedItems: [idx],
      });
      item.type = "income";
      item.confidence = Math.max(item.confidence - 10, 30);
    }
  });

  return flags;
}

// ─── Step 4: Taxonomy Validation ─────────────────────────────────

function validateTaxonomy(items: ParsedTransaction[]): VerificationFlag[] {
  const flags: VerificationFlag[] = [];

  items.forEach((item, idx) => {
    const cat = getCategoryByArabicName(item.category);
    if (!cat) {
      flags.push({
        type: "taxonomy_invalid",
        severity: "error",
        message: `الفئة "${item.category}" مش موجودة في النظام`,
        affectedItems: [idx],
      });
      return;
    }

    const subExists = cat.subcategories.some((s) => s.name_ar === item.subCategory);
    if (!subExists && item.subCategory !== "عام") {
      // EXCEPTION: person-name subcategories for relationship categories
      if (["العائلة", "أصدقاء", "موظفين"].includes(item.category)) {
        return;
      }
      if (item.category === "تحويل" && item.subCategory === "تحويلات شخصية") {
        return;
      }

      // Bug #16 fix: Use BEST match (highest overlap) instead of first match.
      // Previously, "دكتور" could match "دكتور عيون" before "دكتور" via .find().
      let bestMatch: { name_ar: string } | null = null;
      let bestScore = 0;
      for (const s of cat.subcategories) {
        let score = 0;
        if (s.name_ar === item.subCategory) { score = 3; } // exact
        else if (s.name_ar.includes(item.subCategory)) { score = 1; } // sub is prefix of registry
        else if (item.subCategory.includes(s.name_ar)) { score = 2; } // registry is prefix of sub (tighter)
        if (score > bestScore) { bestScore = score; bestMatch = s; }
      }

      if (bestMatch && bestScore > 0) {
        item.subCategory = bestMatch.name_ar;
      } else {
        // Special case for "تحويل" when a person is mentioned
        if (item.category === "تحويل" && item.person_mentioned) {
            flags.push({
              type: "taxonomy_invalid",
              severity: "info",
              message: `الفئة الفرعية "${item.subCategory}" غير دقيقة في "تحويل" مع وجود شخص — هيتم استخدام "تحويلات شخصية"`,
              affectedItems: [idx],
            });
            item.subCategory = "تحويلات شخصية";
        } else {
            flags.push({
              type: "taxonomy_invalid",
              severity: "warning",
              message: `الفئة الفرعية "${item.subCategory}" مش موجودة في "${item.category}" — هيتم استخدام "عام"`,
              affectedItems: [idx],
            });
            item.subCategory = "عام";
        }
      }
    }
  });

  return flags;
}

// ─── Step 5: Amount Sanity ──────────────────────────────────────

function checkAmountSanity(
  items: ParsedTransaction[],
  originalText: string,
): VerificationFlag[] {
  const flags: VerificationFlag[] = [];

  // Extract all numbers from original text (handling thousands separators)
  const textNumbers = (originalText.match(/\d+(?:[.,]\d+)?(?:[.,]\d+)?/g) || [])
    .map((n) => {
      // Remove commas used as thousands separators
      let cleanNum = n;
      if (n.includes(",") && n.split(",")[1].length === 3) {
        cleanNum = n.replace(/,/g, "");
      } else {
        cleanNum = n.replace(",", "."); // Assume decimal if it doesn't look like a thousands separator
      }
      return parseFloat(cleanNum);
    })
    .filter((n) => !isNaN(n) && n > 0);

  if (textNumbers.length === 0 || items.length === 0) return flags;

  // Sum of classified amounts
  const classifiedSum = items.reduce((sum, it) => sum + it.amount, 0);
  // Sum of text amounts
  const textSum = textNumbers.reduce((sum, n) => sum + n, 0);

  // If classified sum is significantly more than text amounts → possible double-count
  if (textSum > 0 && classifiedSum > textSum * 1.5) {
    flags.push({
      type: "amount_sanity",
      severity: "warning",
      message: `مجموع المبالغ المصنفة (${classifiedSum} ج) أكبر من المبالغ في النص (${textSum} ج) — ممكن يكون فيه مبلغ مكرر`,
      affectedItems: items.map((_, i) => i),
    });
  }

  // Check individual amounts
  items.forEach((item, idx) => {
    if (item.amount > MAX_AMOUNT) {
      flags.push({
        type: "amount_sanity",
        severity: "error",
        message: `المبلغ ${item.amount} ج كبير جداً — الحد الأقصى ${MAX_AMOUNT.toLocaleString()} ج`,
        affectedItems: [idx],
      });
    }

    if (item.amount === 0) {
      flags.push({
        type: "amount_sanity",
        severity: "error",
        message: `المبلغ صفر — لازم يكون أكبر من صفر`,
        affectedItems: [idx],
      });
    }
  });

  return flags;
}

// ─── Step 6: Anomaly Detection ──────────────────────────────────

function detectAnomalies(
  items: ParsedTransaction[],
  ctx: MonthlyContext,
): VerificationFlag[] {
  const flags: VerificationFlag[] = [];

  const avgMonthlyExpense = ctx.totalExpense > 0 ? ctx.totalExpense / 30 : 500;
  const avgMonthlyIncome = ctx.totalIncome > 0 ? ctx.totalIncome / 30 : 5000;

  items.forEach((item, idx) => {
    // Single income > 3x daily average
    if (item.type === "income" && item.amount > avgMonthlyIncome * 3) {
      flags.push({
        type: "anomaly",
        severity: "info",
        message: `مبلغ الدخل ${item.amount} ج أعلى من المعتاد — تأكد إنه صحيح`,
        affectedItems: [idx],
      });
    }

    // Single expense > 2x daily average
    if (item.type === "expense" && item.amount > avgMonthlyExpense * 5) {
      flags.push({
        type: "anomaly",
        severity: "info",
        message: `مبلغ المصروف ${item.amount} ج أعلى من المعتاد — ممكن يحتاج مراجعة`,
        affectedItems: [idx],
      });
    }
  });

  // Total expense in one message > total monthly income
  const msgExpense = items
    .filter((it) => it.type === "expense")
    .reduce((sum, it) => sum + it.amount, 0);
  if (ctx.totalIncome > 0 && msgExpense > ctx.totalIncome) {
    flags.push({
      type: "anomaly",
      severity: "warning",
      message: `إجمالي المصاريف في الرسالة (${msgExpense} ج) أكبر من إجمالي الدخل الشهري (${ctx.totalIncome} ج)`,
      affectedItems: items.map((_, i) => i),
    });
  }

  return flags;
}

// ─── Step 7: Confidence Adjustment ──────────────────────────────

function adjustConfidence(
  items: ParsedTransaction[],
  flags: VerificationFlag[],
): ParsedTransaction[] {
  const errorIndices = new Set<number>();
  const warningIndices = new Set<number>();

  for (const flag of flags) {
    for (const idx of flag.affectedItems) {
      if (flag.severity === "error") errorIndices.add(idx);
      if (flag.severity === "warning") warningIndices.add(idx);
    }
  }

  return items.map((item, idx) => {
    let adjustedConfidence = item.confidence;

    if (errorIndices.has(idx)) {
      adjustedConfidence = Math.max(adjustedConfidence - 15, 20);
    } else if (warningIndices.has(idx)) {
      adjustedConfidence = Math.max(adjustedConfidence - 5, 30);
    } else {
      // Bug #18 fix: Only boost items with ZERO flags affecting THEM specifically.
      // Previously: blocked for ALL items if any item had a flag — unfair penalty.
      const hasNoPersonalFlag = !errorIndices.has(idx) && !warningIndices.has(idx);
      if (hasNoPersonalFlag) {
        adjustedConfidence = Math.min(adjustedConfidence + 5, 95);
      }
    }

    return {
      ...item,
      confidence: adjustedConfidence,
      needsReview:
        adjustedConfidence < 85 ||
        errorIndices.has(idx) ||
        warningIndices.has(idx),
    };
  });
}
