import { CATEGORIES } from "./category-registry";
import type { DecomposedSegment } from "./narrative-decomposer";
import type { ParsedTransaction } from "./rule-engine";

/**
 * Builds a dynamic taxonomy (filtered categories) based on segment context and rule hints.
 * This drastically reduces the token usage by only sending relevant categories to the AI.
 */
export function buildDynamicTaxonomy(): string {
  // Compress taxonomy for AI token efficiency
  return CATEGORIES.map((c) => {
    let subcats = c.subcategories.map((s) => s.name_ar).join(",");
    if (["العائلة", "أصدقاء", "موظفين"].includes(c.name_ar)) {
      subcats = "اسم_الشخص"; 
    }
    return `${c.name_ar}:${subcats}`;
  }).join("|");
}

/**
 * Checks if the segment mentions someone or has a transfer pattern.
 */
export function shouldInjectPersonalContext(segment: DecomposedSegment): boolean {
  if (segment.personMentioned) return true;
  
  // Check for transfer patterns "حولت لـ", "سلفت", "بعتت لـ", "اديت لـ"
  const transferRegex = /(?:ل(?:ـ)?|حولت|سلفت|بعتت|اديت|عطيت)\s+[\u0600-\u06FF]{2,}/;
  return transferRegex.test(segment.text);
}

/**
 * Builds a small part of the dictionary relevant to the direction.
 */
export function buildDynamicDictionary(): string {
  return 'income:جالي,قبضت,كسبت. transfer:حولت,سلفت,سلف,دين. expense:اديت,دفعت,صرفت,اشتريت,اكلت,ركبت. (Paying friend/employee=expense, lending them=transfer)';
}

/**
 * Builds the complete dynamic prompt for the AI.
 */
export function buildSmartSystemPrompt(
  text: string,
  knownPeople: Array<{ name: string; category: string; subCategory: string; relationship: string }> = []
): string {
  const taxonomy = buildDynamicTaxonomy();
  const dict = buildDynamicDictionary();
  
  let personalCtx = "";
  if (knownPeople.length > 0) {
    const normText = normalizeArabicString(text);
    const relevantPeople = knownPeople.filter((p) => {
      const normName = normalizeArabicString(p.name);
      return normText.includes(normName) || normName.split(/\s+/).some(part => part.length >= 2 && normText.includes(normalizeArabicString(part)));
    });

    if (relevantPeople.length > 0) {
      personalCtx = `\nKNOWN_PEOPLE: ${relevantPeople
        .map((p) => `${p.name}(${p.relationship})->${p.category}/${p.subCategory}`)
        .join(", ")}`;
    }
  }

  // Dynamic Injection of People Rules & Examples to save tokens and prevent Hallucination
  const transferRegex = /(?:ل(?:ـ)?|حولت|سلفت|بعتت|اديت|عطيت|عطيت|من|عند)\s+[\u0600-\u06FF]{2,}/;
  const hasPersonPattern = transferRegex.test(text) || knownPeople.some(p => text.includes(p.name));
  
  let peopleRule = "";
  let fewShotExamples = "";
  
  if (hasPersonPattern) {
    peopleRule = `\n3. ANTI-HALLUCINATION PEOPLE RULE (CRITICAL):
   - You MUST NOT guess relationships. If a person's name is NOT in the KNOWN_PEOPLE list above, you MUST classify them exactly as: main_category: "متنوعات", sub_category: "أشخاص", set needsClarification=true and ask "مين [Name]؟" in clarificationQuestion.
   - Do NOT classify unknown people as "العائلة" or "أصدقاء".`;
    
    fewShotExamples = `\nFEW-SHOT EXAMPLES FOR UNKNOWN NAMES:
User: "أديت 2000 جنيه لهدى"
Output: main_category: "متنوعات", sub_category: "أشخاص", needsClarification: true, clarificationQuestion: "مين هدى؟"`;
  }

  return `You are an expert Egyptian financial data parser. Extract ALL independent financial transactions from the user's Egyptian Arabic input.
USER TEXT MIGHT CONTAIN MULTIPLE TRANSACTIONS. Do not miss any.

STRICT RULES:
1. "decomposed_sentences": Array of strings. Split the input into separate logical sentences per transaction to ensure nothing is missed.
2. Independent parsing: Never mix amounts or entities! "Played for 20 and gave Ali 100" = 2 distinct items. DO NOT assign "Ali" to the first item! Strict context isolation per transaction is mandatory.
4. "type" MUST be: income, expense, transfer, or investment. Giving money to friends/family is "expense", UNLESS explicitly mentioned as a loan/debt ("سلف" / "دين"), then it's "transfer".
5. "item_name": Short descriptive Arabic title.
6. "confidence": 0-100 score.
7. "alertMessage": Short financial alert (max 10 words) if wasting money, else "ok".
8. "person_mentioned": Extract exact person name if any.
9. "person_relationship": Extract relationship if known.
10. Categories MUST match exact Arabic names from TAXONOMY.${peopleRule}${fewShotExamples}

DICT: ${dict}

TAXONOMY (main:sub1,sub2):
${taxonomy}${personalCtx}

OUTPUT STRICT JSON MATCHING THE SCHEMA.`;
}

function normalizeArabicString(str: string): string {
  return String(str || "")
    .trim()
    .replace(/[إأآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/\s+/g, "")
    .toLowerCase();
}
