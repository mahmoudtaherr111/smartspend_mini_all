import { CATEGORIES } from "./category-registry";
import type { DecomposedSegment } from "./narrative-decomposer";
import { scoreCategories, buildFilteredTaxonomy, type TransactionIntent } from "./category-scorer";

export function shouldInjectPersonalContext(segment: DecomposedSegment): boolean {
  if (segment.personMentioned) return true;
  const transferRegex = /(?:ل(?:ـ)?|حولت|سلفت|بعتت|اديت|عطيت)\s+[\u0600-\u06FF]{2,}/;
  return transferRegex.test(segment.text);
}

export function buildDynamicDictionary(): string {
  return "income:جالي,قبضت,كسبت,استلمت,بونص,نزلي,الجمعية. transfer:حولت,سلفت,سلف,دين,انستاباي,رميت,حطيت في حساب. expense:اديت,دفعت,صرفت,اشتريت,اكلت,ركبت,عزمت,طيرت,فرتكت,سديت,طلعت قسط. (Paying friend/employee=expense, lending=transfer, putting money in savings=transfer/investment)";
}

export function buildSmartSystemPrompt(
  text: string,
  knownPeople: Array<{ name: string; category: string; subCategory: string; relationship: string }> = [],
  decompositionHint?: string,
  useSimpleSchema: boolean = false,
  userHistoryContext: string = "",
  userHistoryCategories: Array<{ category: string; count: number }> = [],
  numAmounts: number = 1
): string {
  // --- V3 Multi-Signal Category Routing ---
  const scorerResult = scoreCategories(text, userHistoryCategories, numAmounts);
  const taxonomy = buildFilteredTaxonomy(scorerResult.filteredCategories);
  const dict = buildDynamicDictionary();

  console.log(`[Category Scorer V3] Filtered from ${scorerResult.allCategories} down to ${scorerResult.totalCategories} categories.`);

  const knownPeopleBlock = knownPeople.length > 0
    ? `\nKNOWN_PEOPLE_NAMES:\n` + knownPeople.map((p) => `  - "${p.name}"`).join("\n") + `\n⛔ اسم مجهول: اجعل sub_category="أشخاص" و needsClarification=true. لا تستخدم متنوعات.`
    : `\n⛔ اسم مجهول: اجعل sub_category="أشخاص" و needsClarification=true. لا تستخدم متنوعات.`;

  const kareemWarning = `\n⚠️ كلمة 'كريم' قد تعني المواصلات (أوبر/كريم) أو شخص (تحويل). اعتمد على الفعل (ركبت=تطبيق, اديت=شخص).`;

  const ragContext = userHistoryContext 
    ? `\nUSER_HISTORY:\n${userHistoryContext}`
    : "";

  const multiTransactionRules = (text.match(/\d+(?:[.,]\d+)?/g) || []).length > 1
    ? `\n🔀 جمل متعددة: استخرج كل عملية منفصلة. لا تدمج مبالغ أو أشخاص.`
    : "";

  const schemaInstruction = useSimpleSchema 
    ? `JSON Schema Instruction:\nYou must output a JSON object containing ONLY the \`items\` array. DO NOT output \`reasoning\` or \`decomposed_sentences\`.`
    : `JSON Schema Instruction:\nYou must output a JSON object containing a \`reasoning\` array before the \`items\` array to enable Chain-of-Thought (CoT).`;

  return `أنت SmartSpend AI (V3). محلل مالي مصري. استخرج العمليات كـ JSON.
قواعد:
1. ${useSimpleSchema ? "تجاهل الشرح، استخرج المصفوفة مباشرة." : '"decomposed_sentences": قسّم النص — كل عملية في جملة لوحدها.'}
2. عزل المبالغ والأشخاص لكل عملية.
3. type: income (جالي/خدت/قبضت) | expense (دفعت/صرفت/اشتريت/اديت لشخص) | transfer (حولت/سلفت/سحبت/جمعي) | investment (ذهب/أسهم).
4. الفئات والفرعية يجب اختيارها حرفياً من TAXONOMY المرفقة فقط.
5. item_name: اسم وصفي قصير. alertMessage: تنبيه إيجازي لو إسراف أو "ok".
6. confidence: درجة الثقة في التصنيف كنسبة مئوية بين 0 و 100 (مثال: 95).${knownPeopleBlock}${kareemWarning}${multiTransactionRules}${ragContext}

DICT: ${dict}

TAXONOMY:
${taxonomy}

${schemaInstruction}

OUTPUT: JSON فقط بدون شرح. Only output JSON.`;
}

export function buildFireworksPrompts(
  text: string,
  knownPeople: Array<{ name: string; category: string; subCategory: string; relationship: string }> = [],
  useSimpleSchema: boolean = false,
  userHistoryContext: string = "",
  userHistoryCategories: Array<{ category: string; count: number }> = [],
  numAmounts: number = 1,
  classifierUserPrompt: string = ""
): { systemPrompt: string; userPrompt: string } {
  // --- V3 Multi-Signal Category Routing ---
  const scorerResult = scoreCategories(text, userHistoryCategories, numAmounts);
  const taxonomy = buildFilteredTaxonomy(scorerResult.filteredCategories);
  const dict = buildDynamicDictionary();

  const knownPeopleBlock = knownPeople.length > 0
    ? `\nKNOWN_PEOPLE_NAMES:\n` + knownPeople.map((p) => `  - "${p.name}"`).join("\n") + `\n⛔ اسم مجهول: اجعل sub_category="أشخاص" و needsClarification=true. لا تستخدم متنوعات.`
    : `\n⛔ اسم مجهول: اجعل sub_category="أشخاص" و needsClarification=true. لا تستخدم متنوعات.`;

  const kareemWarning = `\n⚠️ كلمة 'كريم' قد تعني المواصلات (أوبر/كريم) أو شخص (تحويل). اعتمد على الفعل (ركبت=تطبيق, اديت=شخص).`;

  const ragContext = userHistoryContext 
    ? `\nUSER_HISTORY:\n${userHistoryContext}`
    : "";

  const multiTransactionRules = (text.match(/\d+(?:[.,]\d+)?/g) || []).length > 1
    ? `\n🔀 جمل متعددة: استخرج كل عملية منفصلة. لا تدمج مبالغ أو أشخاص.`
    : "";

  const schemaInstruction = useSimpleSchema 
    ? `JSON Schema Instruction:\nYou must output a JSON object containing ONLY the \`items\` array. DO NOT output \`reasoning\` or \`decomposed_sentences\`.`
    : `JSON Schema Instruction:\nYou must output a JSON object containing a \`reasoning\` array before the \`items\` array to enable Chain-of-Thought (CoT).`;

  // STATIC SYSTEM PROMPT (Optimized for 100% Caching)
  const systemPrompt = `أنت SmartSpend AI (V3). محلل مالي مصري. استخرج العمليات كـ JSON.
قواعد:
1. ${useSimpleSchema ? "تجاهل الشرح، استخرج المصفوفة مباشرة." : '"decomposed_sentences": قسّم النص — كل عملية في جملة لوحدها.'}
2. عزل المبالغ والأشخاص لكل عملية.
3. type: income (جالي/خدت/قبضت) | expense (دفعت/صرفت/اشتريت/اديت لشخص) | transfer (حولت/سلفت/سحبت/جمعي) | investment (ذهب/أسهم).
4. الفئات والفرعية يجب اختيارها حرفياً من TAXONOMY المرفقة في رسالة المستخدم فقط.
5. item_name: اسم وصفي قصير. alertMessage: تنبيه إيجازي لو إسراف أو "ok".
6. confidence: درجة الثقة في التصنيف كنسبة مئوية بين 0 و 100 (مثال: 95).

DICT: ${dict}

${schemaInstruction}

OUTPUT: JSON فقط بدون شرح. Only output JSON.`;

  // DYNAMIC USER PROMPT (Request-specific details)
  const userPrompt = `TAXONOMY (استخدم هذه الفئات فقط):
${taxonomy}
${knownPeopleBlock}${kareemWarning}

User History context:
${userHistoryContext}

---
${classifierUserPrompt}`;

  return { systemPrompt, userPrompt };
}
