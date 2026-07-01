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
  const scorerResult = scoreCategories(text, userHistoryCategories, numAmounts);
  const taxonomy = buildFilteredTaxonomy(scorerResult.filteredCategories);
  const dict = buildDynamicDictionary();

  const knownPeopleBlock = knownPeople.length > 0
    ? `\nKNOWN_PEOPLE_NAMES:\n` + knownPeople.map((p) => `  - "${p.name}" (${p.relationship})`).join("\n") + `\n⛔ اسم مجهول: اجعل sub_category="أشخاص" و needsClarification=true. لا تستخدم متنوعات.`
    : `\n⛔ اسم مجهول: اجعل sub_category="أشخاص" و needsClarification=true. لا تستخدم متنوعات.`;

  const kareemWarning = `\n⚠️ كلمة 'كريم' قد تعني المواصلات (أوبر/كريم) أو شخص (تحويل). اعتمد على الفعل (ركبت=تطبيق, اديت=شخص).`;

  const ragContext = userHistoryContext 
    ? `\nUSER_HISTORY:\n${userHistoryContext}`
    : "";

  const multiTransactionRules = (text.match(/\d+(?:[.,]\d+)?/g) || []).length > 1
    ? `\n🔀 جمل متعددة: استخرج كل عملية منفصلة. لا تدمج مبالغ أو أشخاص. كل مبلغ = عملية مستقلة.`
    : "";

  const schemaInstruction = useSimpleSchema 
    ? `JSON Schema Instruction:\nYou must output a JSON object containing ONLY the \`items\` array. DO NOT output \`reasoning\` or \`decomposed_sentences\`.`
    : `JSON Schema Instruction:\nYou must output a JSON object containing a \`reasoning\` array before the \`items\` array to enable Chain-of-Thought (CoT).`;

  return `أنت SmartSpend AI (V3) — محلل مالي مصري محترف. مهمتك: تحليل النصوص المالية بالعامية المصرية واستخراج العمليات كـ JSON.

## قواعد التصنيف:
1. ${useSimpleSchema ? "تجاهل الشرح، استخرج المصفوفة مباشرة." : '"decomposed_sentences": قسّم النص — كل عملية في جملة لوحدها.'}
2. عزل المبالغ والأشخاص لكل عملية — لا تخلط بينها.
3. type: income (جالي/خدت/قبضت/نزل المرتب/استلمت) | expense (دفعت/صرفت/اشتريت/اديت لشخص/اكلت/شربت) | transfer (حولت/سلفت/سحبت/جمعي/فكيت) | investment (ذهب/أسهم/شهادات).
4. الفئات والفرعية يجب اختيارها حرفياً من TAXONOMY المرفقة فقط — لا تبتكر فئات.
5. item_name: اسم وصفي قصير للعملية. alertMessage: تنبيه إيجازي لو إسراف أو "ok".
6. confidence: درجة الثقة في التصنيف كنسبة مئوية بين 0 و 100.

## قواعد العامية المصرية:
- "شحنت" + رصيد/موبايل/نت = فواتير (شحن رصيد). "شحنت العربية" = مواصلات (بنزين).
- "شلت" + دهب/ذهب = استثمار (ذهب). "شلت فلوس" = تحويل (سحب). "شلت" وحدها = غامض → needsClarification.
- "اديت" + اسم شخص = expense (مصروف لشخص) أو transfer (تحويل). "اديت لكاهربا" = فواتير.
- "حولت لـ" + اسم = transfer. "حولولي" = income. "حولت من البنك" = transfer (سحب).
- "سلفت" + اسم = transfer (دين/سلفة). "استلفت" = transfer (قرض).
- "رميت" + مبلغ = expense (صرفت). "رميت" + فلوس = expense.
- "فطرت/اتعشيت/اتغديت" = expense (أكل وشرب). "قعدت" + مبلغ = expense (ترفيه/كافيه).
- "فرتكت" + مبلغ = expense (ترفيه). "طيرت" + مبلغ = expense (خسرت/صرفت).
- "عزمت" + حد = expense (ترفيه/خروجة). "نقوط" = expense (هدايا/فرح).
- "كارت" + كهربا/مياه = فواتير. "كارت" + موبايل = تسوق أو فواتير (حسب السياق).
- "عربية" + فول/كبدة/خضار = أكل وشرب. "عربية" + غسيل/صيانة = مواصلات. "عربية" + طفل = تسوق.
- "كفر" + موبايل = تسوق. "كفر" + عربية = خدمات سيارات (إطارات).
- "باقة" + نت = فواتير (إنترنت). "باقة" + موبايل = فواتير (شحن رصيد).

## قواعد الأولوية:
1. سياق الجملة أهم من الكلمة المفردة. "دفعت باقة النت 200" = فواتير/إنترنت (سياق واضح).
2. الأرقام الكبيرة (>10000) غالباً: إيجار، أجهزة، سيارة، استثمار.
3. الأرقام الصغيرة (<50) غالباً: سناكس، قهوة، مواصلات، شحن رصيد.
4. لو النص يحتوي اسم شخص مجهول (مش في KNOWN_PEOPLE_NAMES) → needsClarification=true.

## أمثلة:
- "دفعت كهربا 200" → expense, فواتير/كهرباء, 200, confidence=95
- "أكلت بيتزا بـ 150" → expense, أكل وشرب/وجبات سريعة, 150, confidence=92
- "ركبت اوبر بـ 50" → expense, مواصلات/أوبر/كريم, 50, confidence=95
- "جالي المرتب 15000" → income, مرتب/مرتب أساسي, 15000, confidence=98
- "اشتريت ذهب بـ 5000" → investment, استثمار/ذهب, 5000, confidence=95
- "حولت 1000 انستاباي" → transfer, تحويل/انستاباي, 1000, confidence=95
- "اديت لمحمود 200" → expense, تحويل/أشخاص, 200, confidence=80, person_mentioned="محمود"
- "دفعت 3000 إيجار و500 كهربا" → عمليتان: سكن/إيجار 3000 + فواتير/كهرباء 500
${knownPeopleBlock}${kareemWarning}${multiTransactionRules}${ragContext}

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
  const systemPrompt = `أنت SmartSpend AI (V3) — محلل مالي مصري محترف. مهمتك: تحليل النصوص المالية بالعامية المصرية واستخراج العمليات كـ JSON.

## قواعد التصنيف:
1. ${useSimpleSchema ? "تجاهل الشرح، استخرج المصفوفة مباشرة." : '"decomposed_sentences": قسّم النص — كل عملية في جملة لوحدها.'}
2. عزل المبالغ والأشخاص لكل عملية — لا تخلط بينها.
3. type: income (جالي/خدت/قبضت/نزل المرتب/استلمت) | expense (دفعت/صرفت/اشتريت/اديت لشخص/اكلت/شربت) | transfer (حولت/سلفت/سحبت/جمعي/فكيت) | investment (ذهب/أسهم/شهادات).
4. الفئات والفرعية يجب اختيارها حرفياً من TAXONOMY المرفقة في رسالة المستخدم فقط.
5. item_name: اسم وصفي قصير. alertMessage: تنبيه إيجازي لو إسراف أو "ok".
6. confidence: درجة الثقة كنسبة مئوية 0-100.

## قواعد العامية المصرية:
- "شحنت"+رصيد/موبايل/نت=فواتير. "شحنت العربية"=مواصلات/بنزين.
- "شلت"+دهب/ذهب=استثمار. "شلت فلوس"=تحويل/سحب. "شلت" وحدها=غامض.
- "اديت"+اسم=expense أو transfer. "اديت لكهربا"=فواتير.
- "حولت لـ"+اسم=transfer. "حولولي"=income. "سلفت"+اسم=transfer/دين.
- "رميت"+مبلغ=expense. "فطرت/اتعشيت/اتغديت"=expense/أكل وشرب.
- "عربية"+فول/كبدة=أكل. "عربية"+غسيل=مواصلات. "عربية"+طفل=تسوق.
- "كفر"+موبايل=تسوق. "كفر"+عربية=خدمات سيارات.
- "باقة"+نت=فواتير/إنترنت. "باقة"+موبايل=فواتير/شحن رصيد.

## أمثلة:
- "دفعت كهربا 200" → expense, فواتير/كهرباء, 200, 95
- "أكلت بيتزا بـ 150" → expense, أكل وشرب/وجبات سريعة, 150, 92
- "ركبت اوبر بـ 50" → expense, مواصلات/أوبر/كريم, 50, 95
- "جالي المرتب 15000" → income, مرتب/مرتب أساسي, 15000, 98
- "حولت 1000 انستاباي" → transfer, تحويل/انستاباي, 1000, 95

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
