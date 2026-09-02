/**
 * Hand-authored Egyptian-dialect benchmark cases.
 *
 * Every `category` / `subCategory` below is an EXACT name_ar pair from
 * api/lib/category-registry.ts — enforced at import time by assertFixtureIntegrity().
 *
 * These expectations describe the CORRECT answer, not what the pipeline currently
 * produces. The gap between them is the measurement.
 */
import type { BenchmarkCase } from "./classification-cases.types";

const MARWAN = {
  name: "مروان",
  relationship: "أخ",
  category: "العائلة",
  subCategory: "مروان أخوك",
};
const SARA = {
  name: "سارة",
  relationship: "صديقة",
  category: "أصدقاء",
  subCategory: "سارة صاحبتك",
};
const AHMED = {
  name: "أحمد",
  relationship: "صديق",
  category: "أصدقاء",
  subCategory: "أحمد صاحبك",
};
const EMAD = {
  name: "عماد",
  relationship: "موظف",
  category: "موظفين",
  subCategory: "عماد موظفك",
};

// ─── direction_traps (10) ──────────────────────────────────────────
// The verb governs DIRECTION, the noun governs CATEGORY, and (noun x direction)
// selects the SUBCATEGORY. These are the cases the product brief names explicitly.

const DIRECTION_TRAPS: BenchmarkCase[] = [
  {
    id: "DIR-001",
    bucket: "direction_traps",
    tier: "locked",
    text: "قبضت الجمعية 5000",
    expectedItems: [
      {
        amount: 5000,
        type: "income",
        category: "التزامات وجمعيات",
        subCategory: "قبض جمعية",
        why: "قبضت = المال داخل",
      },
    ],
    tags: ["gam3eya", "income_verb", "direction"],
  },
  {
    id: "DIR-002",
    bucket: "direction_traps",
    tier: "locked",
    text: "عليا قسط الجمعية 5000 الشهر ده",
    expectedItems: [
      {
        amount: 5000,
        type: "expense",
        category: "التزامات وجمعيات",
        subCategory: "قسط جمعية",
        why: "عليا قسط = التزام خارج",
      },
    ],
    tags: ["gam3eya", "obligation", "direction"],
  },
  {
    id: "DIR-003",
    bucket: "direction_traps",
    tier: "locked",
    text: "دفعت قسط الجمعية 2000 وقبضت جمعية تانية 8000",
    expectedItems: [
      {
        amount: 2000,
        type: "expense",
        category: "التزامات وجمعيات",
        subCategory: "قسط جمعية",
      },
      {
        amount: 8000,
        type: "income",
        category: "التزامات وجمعيات",
        subCategory: "قبض جمعية",
      },
    ],
    tags: ["gam3eya", "mixed_direction_single_message", "direction"],
    note: "الحالة الأكثر تمييزاً: اتجاهان متعاكسان في رسالة واحدة — كاشف نية واحدة للرسالة لا يمكنه النجاح",
  },
  {
    id: "DIR-004",
    bucket: "direction_traps",
    tier: "locked",
    text: "سلفت مروان الفين",
    knownPeople: [MARWAN],
    expectedItems: [
      {
        amount: 2000,
        type: "expense",
        category: "العائلة",
        subCategory: "مروان أخوك",
        why: "سلفت = المال خارج لشخص معروف",
      },
    ],
    tags: ["debt_out", "known_person", "word_number"],
  },
  {
    id: "DIR-005",
    bucket: "direction_traps",
    tier: "aspirational",
    text: "استلفت من مروان الفين",
    knownPeople: [MARWAN],
    expectedItems: [
      {
        amount: 2000,
        type: "income",
        typeAnyOf: ["income", "transfer"],
        category: "تحويل",
        subCategory: "دين/سلفة",
        why: "استلفت = المال داخل — لكن التصنيف لا يفرّق بين دين عليّ ودين ليّ",
      },
    ],
    tags: ["debt_in", "taxonomy_gap"],
    note: "aspirational: لا يوجد سوى فرعية واحدة لكل اتجاهي الدين",
  },
  {
    id: "DIR-006",
    bucket: "direction_traps",
    tier: "aspirational",
    text: "مروان رجعلي فلوسي الفين",
    knownPeople: [MARWAN],
    expectedItems: [
      {
        amount: 2000,
        type: "income",
        typeAnyOf: ["income", "transfer"],
        category: "تحويل",
        subCategory: "دين/سلفة",
        why: "رجعلي = سداد وارد",
      },
    ],
    tags: ["debt_repaid_in", "taxonomy_gap"],
  },
  {
    id: "DIR-007",
    bucket: "direction_traps",
    tier: "aspirational",
    text: "رجعت لمروان فلوسه الفين",
    knownPeople: [MARWAN],
    expectedItems: [
      {
        amount: 2000,
        type: "expense",
        typeAnyOf: ["expense", "transfer"],
        category: "تحويل",
        categoryAnyOf: ["تحويل", "العائلة"],
        subCategoryMode: "soft",
        why: "رجعت لـ = سداد صادر",
      },
    ],
    tags: ["debt_repaid_out", "taxonomy_gap"],
  },
  {
    id: "DIR-008",
    bucket: "direction_traps",
    tier: "locked",
    text: "جالي تحويل 500 على انستاباي",
    expectedItems: [
      {
        amount: 500,
        type: "income",
        category: "تحويل",
        subCategory: "انستاباي",
        subCategoryMode: "soft",
        why: "جالي = وارد",
      },
    ],
    tags: ["instapay", "income_verb", "direction"],
  },
  {
    id: "DIR-009",
    bucket: "direction_traps",
    tier: "locked",
    text: "حولت 500 على انستاباي",
    expectedItems: [
      { amount: 500, type: "transfer", category: "تحويل", subCategory: "انستاباي" },
    ],
    tags: ["instapay", "transfer_verb", "direction"],
  },
  {
    id: "DIR-010",
    bucket: "direction_traps",
    tier: "locked",
    text: "اشتريت دهب بـ 12000 وبعدين بعت دهب قديم بـ 15000",
    expectedItems: [
      { amount: 12000, type: "investment", category: "استثمار", subCategory: "ذهب" },
      {
        amount: 15000,
        type: "income",
        typeAnyOf: ["income", "investment"],
        category: "عوائد استثمار",
        categoryAnyOf: ["عوائد استثمار", "استثمار"],
        subCategoryMode: "soft",
        why: "بعت = تصفية استثمار، مال داخل",
      },
    ],
    tags: ["investment_in", "investment_out", "direction"],
  },
];

// ─── numeric_forms (16) ────────────────────────────────────────────

const NUMERIC_FORMS: BenchmarkCase[] = [
  {
    id: "NUM-001",
    bucket: "numeric_forms",
    tier: "locked",
    text: "دفعت ٥٠٠ جنيه للعيادة",
    expectedItems: [
      { amount: 500, type: "expense", category: "صحة", subCategory: "دكتور" },
    ],
    tags: ["arabic_indic"],
  },
  {
    id: "NUM-002",
    bucket: "numeric_forms",
    tier: "locked",
    text: "اديت السواق ألفين ونص",
    expectedItems: [
      {
        amount: 2500,
        type: "expense",
        category: "مواصلات",
        subCategory: "تاكسي",
        subCategoryMode: "soft",
      },
    ],
    tags: ["word_number", "compound_number"],
  },
  {
    id: "NUM-003",
    bucket: "numeric_forms",
    tier: "locked",
    text: "دفعت خمسلاف جنيه مصاريف مدرسة",
    expectedItems: [
      { amount: 5000, type: "expense", category: "تعليم", subCategory: "مدرسة" },
    ],
    tags: ["run_together_number"],
  },
  {
    id: "NUM-004",
    bucket: "numeric_forms",
    tier: "locked",
    text: "اشتريت بـ تمنمية جنيه هدوم",
    expectedItems: [
      { amount: 800, type: "expense", category: "تسوق", subCategory: "ملابس" },
    ],
    tags: ["word_number"],
  },
  {
    id: "NUM-005",
    bucket: "numeric_forms",
    tier: "locked",
    text: "دبحت عجل بـ تسعتاشر ألف جنيه",
    expectedItems: [
      {
        amount: 19000,
        type: "expense",
        category: "أكل وشرب",
        subCategory: "لحوم ودواجن",
      },
    ],
    tags: ["teens_word_number"],
  },
  {
    id: "NUM-006",
    bucket: "numeric_forms",
    tier: "locked",
    text: "دفعت خمستاشر جنيه للسايس",
    expectedItems: [
      { amount: 15, type: "expense", category: "خدمات سيارات", subCategory: "ركنة" },
    ],
    tags: ["teens_word_number", "sayes"],
  },
  {
    id: "NUM-007",
    bucket: "numeric_forms",
    tier: "locked",
    text: "طيرت خمسين باكو في السفر",
    expectedItems: [
      { amount: 50000, type: "expense", category: "ترفيه", subCategory: "سفر" },
    ],
    tags: ["slang_unit_bako"],
  },
  {
    id: "NUM-008",
    bucket: "numeric_forms",
    tier: "aspirational",
    text: "جالي أرنب من الورث",
    expectedItems: [
      {
        amount: 1000000,
        type: "income",
        category: "عوائد استثمار",
        categoryAnyOf: ["عوائد استثمار", "متنوعات"],
        subCategoryMode: "soft",
      },
    ],
    tags: ["slang_unit_arnab", "inheritance"],
  },
  {
    id: "NUM-009",
    bucket: "numeric_forms",
    tier: "locked",
    text: "حاسبت بـ باكو ونص في الصيدلية",
    expectedItems: [
      { amount: 1500, type: "expense", category: "صحة", subCategory: "صيدلية" },
    ],
    tags: ["slang_unit_bako", "compound_number"],
  },
  {
    id: "NUM-010",
    bucket: "numeric_forms",
    tier: "locked",
    text: "جبت لبان بجنيه ونص",
    expectedItems: [
      { amount: 1.5, type: "expense", category: "أكل وشرب", subCategory: "سناكس" },
    ],
    tags: ["fraction", "micro_amount"],
  },
  {
    id: "NUM-011",
    bucket: "numeric_forms",
    tier: "locked",
    text: "حولت 1,250.50 ج.م انستاباي",
    expectedItems: [
      { amount: 1250.5, type: "transfer", category: "تحويل", subCategory: "انستاباي" },
    ],
    tags: ["thousands_separator", "decimal"],
  },
  {
    id: "NUM-012",
    bucket: "numeric_forms",
    tier: "locked",
    text: "حاسبت بـ ميتين وخمسين جنيه في المطعم",
    expectedItems: [
      { amount: 250, type: "expense", category: "أكل وشرب", subCategory: "مطعم" },
    ],
    tags: ["word_number"],
  },
  {
    id: "NUM-013",
    bucket: "numeric_forms",
    tier: "locked",
    text: "قبضت المرتب خمستاشر الف وخمسمية",
    expectedItems: [
      { amount: 15500, type: "income", category: "مرتب", subCategory: "مرتب أساسي" },
    ],
    tags: ["teens_word_number", "compound_number", "salary"],
  },
  {
    id: "NUM-014",
    bucket: "numeric_forms",
    tier: "locked",
    text: "دفعت 50.75 جنيه دمغة",
    expectedItems: [
      {
        amount: 50.75,
        type: "expense",
        category: "خدمات حكومية",
        subCategory: "توثيق",
        subCategoryMode: "soft",
      },
    ],
    tags: ["decimal", "government"],
  },
  {
    id: "NUM-015",
    bucket: "numeric_forms",
    tier: "locked",
    text: "جالي بونص خمسة آلاف وسبعمائة وعشرة جنيه",
    expectedItems: [
      { amount: 5710, type: "income", category: "مرتب", subCategory: "مكافأة/بونص" },
    ],
    tags: ["classical_arabic_number", "compound_number"],
  },
  {
    id: "NUM-016",
    bucket: "numeric_forms",
    tier: "locked",
    text: "شحنت ٧٥ جنيه رصيد وجبت كارت بـ ٢٥",
    expectedItems: [
      { amount: 75, type: "expense", category: "فواتير", subCategory: "شحن رصيد" },
      { amount: 25, type: "expense", category: "فواتير", subCategory: "شحن رصيد" },
    ],
    tags: ["arabic_indic", "compound", "two_items"],
    note: "رقمان هنديان في جملة واحدة — يكشف عمى التقسيم عن الأرقام الهندية",
  },
];

// ─── entity_ambiguity (10) ─────────────────────────────────────────

const ENTITY_AMBIGUITY: BenchmarkCase[] = [
  {
    id: "ENT-001",
    bucket: "entity_ambiguity",
    tier: "locked",
    text: "ركبت كريم بـ 50",
    expectedItems: [
      { amount: 50, type: "expense", category: "مواصلات", subCategory: "أوبر/كريم" },
    ],
    tags: ["kareem_merchant"],
  },
  {
    id: "ENT-002",
    bucket: "entity_ambiguity",
    tier: "locked",
    text: "اديت كريم 100",
    knownPeople: [
      { name: "كريم", relationship: "صديق", category: "أصدقاء", subCategory: "كريم صاحبك" },
    ],
    expectedItems: [
      {
        amount: 100,
        type: "expense",
        category: "أصدقاء",
        subCategory: "كريم صاحبك",
        why: "اديت + اسم معروف = شخص لا تطبيق مواصلات",
      },
    ],
    tags: ["kareem_person", "known_person"],
  },
  {
    id: "ENT-003",
    bucket: "entity_ambiguity",
    tier: "locked",
    text: "اديت باسم 100",
    expectedDecision: "clarify",
    expectedQuestionIncludes: "مين باسم",
    expectedItems: [
      { amount: 100, type: "expense", category: "متنوعات", subCategory: "أشخاص" },
    ],
    tags: ["unknown_person", "clarify"],
  },
  {
    id: "ENT-004",
    bucket: "entity_ambiguity",
    tier: "locked",
    text: "دفعت فوري 100 شحن موبايل",
    expectedItems: [
      { amount: 100, type: "expense", category: "فواتير", subCategory: "شحن رصيد" },
    ],
    tags: ["fawry_merchant"],
  },
  {
    id: "ENT-005",
    bucket: "entity_ambiguity",
    tier: "locked",
    text: "الضريبة زادت علي 200",
    expectedItems: [
      {
        amount: 200,
        type: "expense",
        category: "خدمات حكومية",
        categoryAnyOf: ["خدمات حكومية", "فواتير"],
        subCategoryMode: "soft",
        why: "علي هنا حرف جر لا اسم شخص",
      },
    ],
    tags: ["ali_preposition", "no_person"],
  },
  {
    id: "ENT-006",
    bucket: "entity_ambiguity",
    tier: "locked",
    text: "حولت لعلي 500",
    knownPeople: [
      { name: "علي", relationship: "صديق", category: "أصدقاء", subCategory: "علي صاحبك" },
    ],
    expectedItems: [
      { amount: 500, type: "expense", category: "أصدقاء", subCategory: "علي صاحبك" },
    ],
    tags: ["ali_person", "known_person"],
  },
  {
    id: "ENT-007",
    bucket: "entity_ambiguity",
    tier: "locked",
    text: "خدت منه 150",
    expectedItems: [
      {
        amount: 150,
        type: "income",
        category: "تحويل",
        categoryAnyOf: ["تحويل", "متنوعات", "مرتب"],
        subCategoryMode: "soft",
        why: "منه ضمير لا اسم — والاتجاه وارد",
      },
    ],
    tags: ["menno_pronoun", "direction"],
  },
  {
    id: "ENT-008",
    bucket: "entity_ambiguity",
    tier: "locked",
    text: "أديت شغالتي أم أحمد 200",
    expectedItems: [
      {
        amount: 200,
        type: "expense",
        category: "موظفين",
        subCategoryMode: "soft",
        personMentioned: "أم أحمد",
      },
    ],
    tags: ["employee", "compound_name"],
  },
  {
    id: "ENT-009",
    bucket: "entity_ambiguity",
    tier: "locked",
    text: "دفعت للبواب 150 بتاع الشهر",
    expectedItems: [
      {
        amount: 150,
        type: "expense",
        category: "سكن",
        categoryAnyOf: ["سكن", "موظفين"],
        subCategoryMode: "soft",
      },
    ],
    tags: ["bawab", "service_provider"],
  },
  {
    id: "ENT-010",
    bucket: "entity_ambiguity",
    tier: "locked",
    text: "السباك جه صلح الحنفية وخد 200",
    expectedItems: [
      { amount: 200, type: "expense", category: "سكن", subCategory: "صيانة" },
    ],
    tags: ["plumber", "indirect_payment"],
  },
];

// ─── non_financial (6) — MUST produce zero items ───────────────────

const NON_FINANCIAL: BenchmarkCase[] = [
  {
    id: "NEG-001",
    bucket: "non_financial",
    tier: "locked",
    text: "روحت السوبرماركت",
    expectedItems: [],
    tags: ["no_amount"],
  },
  {
    id: "NEG-002",
    bucket: "non_financial",
    tier: "locked",
    text: "النهاردة كان يوم حلو والجو جميل",
    expectedItems: [],
    tags: ["chatter"],
  },
  {
    id: "NEG-003",
    bucket: "non_financial",
    tier: "locked",
    text: "فكرني اكلم ماما بكرة الساعة خمسة",
    expectedItems: [],
    tags: ["number_is_time"],
    note: "خمسة هنا وقت لا مبلغ",
  },
  {
    id: "NEG-004",
    bucket: "non_financial",
    tier: "locked",
    text: "عايز اعرف صرفت كام الشهر ده",
    expectedItems: [],
    tags: ["query_not_transaction"],
  },
  {
    id: "NEG-005",
    bucket: "non_financial",
    tier: "locked",
    text: "كنت هروح الجيم وادفع 500 بس مروحتش",
    expectedItems: [],
    tags: ["negation"],
    note: "مبلغ حاضر لكن الفعل منفي — مأخوذ من test_long_sentences.js",
  },
  {
    id: "NEG-006",
    bucket: "non_financial",
    tier: "locked",
    text: "الشقة اللي شفتها كانت بمليون ونص بس مشتريتهاش",
    expectedItems: [],
    tags: ["negation", "large_amount"],
  },
];

// ─── boundary (6) ──────────────────────────────────────────────────

const BOUNDARY: BenchmarkCase[] = [
  {
    id: "BND-001",
    bucket: "boundary",
    tier: "locked",
    text: "صرفت -50 جنيه في النادي",
    expectedItems: [],
    tags: ["negative_amount"],
  },
  {
    id: "BND-002",
    bucket: "boundary",
    tier: "locked",
    text: "حولت 10000000000000000 جنيه لأحمد",
    knownPeople: [AHMED],
    expectedItems: [],
    tags: ["overflow_amount"],
  },
  {
    id: "BND-003",
    bucket: "boundary",
    tier: "locked",
    text: "جبت لبان بنص جنيه",
    expectedItems: [
      { amount: 0.5, type: "expense", category: "أكل وشرب", subCategory: "سناكس" },
    ],
    tags: ["micro_amount", "fraction"],
  },
  {
    id: "BND-004",
    bucket: "boundary",
    tier: "aspirational",
    text: "صرفت ٥ قروش في الشارع",
    expectedItems: [
      {
        amount: 0.05,
        type: "expense",
        category: "متنوعات",
        subCategoryMode: "soft",
      },
    ],
    tags: ["piastres", "micro_amount"],
  },
  {
    id: "BND-005",
    bucket: "boundary",
    tier: "locked",
    text: "اشتريت دواء بـ 0 جنيه",
    expectedItems: [],
    tags: ["zero_amount"],
  },
  {
    id: "BND-006",
    bucket: "boundary",
    tier: "locked",
    text: "دفعت 100 و100 و100 و100",
    expectedItems: [
      { amount: 100, type: "expense", category: "متنوعات", subCategoryMode: "soft" },
      { amount: 100, type: "expense", category: "متنوعات", subCategoryMode: "soft" },
      { amount: 100, type: "expense", category: "متنوعات", subCategoryMode: "soft" },
      { amount: 100, type: "expense", category: "متنوعات", subCategoryMode: "soft" },
    ],
    tags: ["repeated_amounts", "dedup_guard"],
    note: "الدمج يجب ألا يبتلع المكرر — أربع عمليات لا واحدة",
  },
];

// ─── single_clause (8) — categories the golden suite never touches ──

const SINGLE_CLAUSE: BenchmarkCase[] = [
  {
    id: "SIN-001",
    bucket: "single_clause",
    tier: "locked",
    text: "دفعت 350 تجديد رخصة العربية",
    expectedItems: [
      { amount: 350, type: "expense", category: "خدمات حكومية", subCategory: "رخصة" },
    ],
    tags: ["government"],
  },
  {
    id: "SIN-002",
    bucket: "single_clause",
    tier: "locked",
    text: "جبت أكل للقطة بـ 120",
    expectedItems: [
      { amount: 120, type: "expense", category: "حيوانات أليفة", subCategory: "أكل" },
    ],
    tags: ["pets"],
  },
  {
    id: "SIN-003",
    bucket: "single_clause",
    tier: "locked",
    text: "جددت اشتراك نتفلكس بـ 200",
    expectedItems: [
      { amount: 200, type: "expense", category: "اشتراكات", subCategory: "نتفلكس" },
    ],
    tags: ["subscriptions"],
  },
  {
    id: "SIN-004",
    bucket: "single_clause",
    tier: "locked",
    text: "دفعت 900 استضافة السيرفر",
    expectedItems: [
      {
        amount: 900,
        type: "expense",
        category: "خدمات رقمية",
        subCategory: "استضافة",
        subCategoryMode: "soft",
      },
    ],
    tags: ["digital_services"],
  },
  {
    id: "SIN-005",
    bucket: "single_clause",
    tier: "locked",
    text: "اشتريت ورق وأقلام للمكتب بـ 250",
    expectedItems: [
      { amount: 250, type: "expense", category: "عمل", subCategory: "مستلزمات مكتب" },
    ],
    tags: ["work"],
  },
  {
    id: "SIN-006",
    bucket: "single_clause",
    tier: "locked",
    text: "جالي عائد شهادات البنك 1800",
    expectedItems: [
      { amount: 1800, type: "income", category: "عوائد استثمار", subCategory: "فوائد" },
    ],
    tags: ["investment_income"],
  },
  {
    id: "SIN-007",
    bucket: "single_clause",
    tier: "locked",
    text: "خلصت مشروع فريلانس وقبضت 6000",
    expectedItems: [
      { amount: 6000, type: "income", category: "عمل حر", subCategory: "مشروع" },
    ],
    tags: ["freelance"],
  },
  {
    id: "SIN-008",
    bucket: "single_clause",
    tier: "locked",
    text: "غيرت زيت العربية بـ 650",
    expectedItems: [
      {
        amount: 650,
        type: "expense",
        category: "خدمات سيارات",
        subCategory: "تغيير زيت",
      },
    ],
    tags: ["car_services"],
  },
];

// ─── compound (12) ─────────────────────────────────────────────────

const COMPOUND: BenchmarkCase[] = [
  {
    id: "CMP-001",
    bucket: "compound",
    tier: "locked",
    text: "دفعت إيجار الشقة 2500 وجبت كهربا بـ 300 وللبواب 200",
    expectedItems: [
      { amount: 2500, type: "expense", category: "سكن", subCategory: "إيجار" },
      { amount: 300, type: "expense", category: "فواتير", subCategory: "كهرباء" },
      {
        amount: 200,
        type: "expense",
        category: "سكن",
        categoryAnyOf: ["سكن", "موظفين"],
        subCategoryMode: "soft",
      },
    ],
    tags: ["three_items", "housing"],
  },
  {
    id: "CMP-002",
    bucket: "compound",
    tier: "locked",
    text: "روحت البنزينة حطيت بنزين بـ 400 واديت السايس عشرة جنيه",
    expectedItems: [
      { amount: 400, type: "expense", category: "مواصلات", subCategory: "بنزين" },
      { amount: 10, type: "expense", category: "خدمات سيارات", subCategory: "ركنة" },
    ],
    tags: ["word_number_second_clause", "sayes"],
  },
  {
    id: "CMP-003",
    bucket: "compound",
    tier: "locked",
    text: "جبت شيبسي بـ 10 وبيبسي بـ 15 وشوكولاتة بـ 20 وبسكوت بـ 5",
    expectedItems: [
      { amount: 10, type: "expense", category: "أكل وشرب", subCategory: "سناكس" },
      { amount: 15, type: "expense", category: "أكل وشرب", subCategory: "مشروبات" },
      { amount: 20, type: "expense", category: "أكل وشرب", subCategory: "سناكس" },
      { amount: 5, type: "expense", category: "أكل وشرب", subCategory: "سناكس" },
    ],
    tags: ["dense_noun_amount_list", "four_items"],
  },
  {
    id: "CMP-004",
    bucket: "compound",
    tier: "locked",
    text: "دفعت مية وخمسين قهوة وبعدين ركبت اوبر بـ 80",
    expectedItems: [
      { amount: 150, type: "expense", category: "أكل وشرب", subCategory: "قهوة وكافيه" },
      { amount: 80, type: "expense", category: "مواصلات", subCategory: "أوبر/كريم" },
    ],
    tags: ["word_number_first_clause", "index_shift_probe"],
    note: "رقم منطوق في المقطع الأول — يكشف انزياح المؤشرات مباشرة",
  },
  {
    id: "CMP-005",
    bucket: "compound",
    tier: "locked",
    text: "اشتريت شاحن موبايل بـ 120 وجبت سلك بـ 50",
    expectedItems: [
      {
        amount: 120,
        type: "expense",
        category: "تسوق",
        subCategory: "أجهزة إلكترونية",
      },
      {
        amount: 50,
        type: "expense",
        category: "تسوق",
        subCategory: "أجهزة إلكترونية",
        subCategoryMode: "soft",
      },
    ],
    tags: ["two_items", "electronics"],
  },
  {
    id: "CMP-006",
    bucket: "compound",
    tier: "locked",
    text: "روحت للدكتور كشف بـ 400 وجبت دوا بـ 300",
    expectedItems: [
      { amount: 400, type: "expense", category: "صحة", subCategory: "دكتور" },
      { amount: 300, type: "expense", category: "صحة", subCategory: "صيدلية" },
    ],
    tags: ["health", "two_items"],
  },
  {
    id: "CMP-007",
    bucket: "compound",
    tier: "locked",
    text: "دفعت فاتورة الكهربا 600 والغاز 100",
    expectedItems: [
      { amount: 600, type: "expense", category: "فواتير", subCategory: "كهرباء" },
      { amount: 100, type: "expense", category: "فواتير", subCategory: "غاز" },
    ],
    tags: ["bills", "elided_verb"],
  },
  {
    id: "CMP-008",
    bucket: "compound",
    tier: "locked",
    text: "خرجت مع صحابي روحنا السينما بـ 200 وجبنا فشار بـ 100",
    expectedItems: [
      { amount: 200, type: "expense", category: "ترفيه", subCategory: "سينما" },
      { amount: 100, type: "expense", category: "أكل وشرب", subCategory: "سناكس" },
    ],
    tags: ["entertainment", "two_items"],
  },
  {
    id: "CMP-009",
    bucket: "compound",
    tier: "locked",
    text: "شحنت الرصيد فودافون بـ 100 وجبت كارت فكة بـ 25",
    expectedItems: [
      { amount: 100, type: "expense", category: "فواتير", subCategory: "شحن رصيد" },
      { amount: 25, type: "expense", category: "فواتير", subCategory: "شحن رصيد" },
    ],
    tags: ["recharge", "kart_fakka"],
  },
  {
    id: "CMP-010",
    bucket: "compound",
    tier: "locked",
    text: "حولت 450 جنيه لمروان و 550 لسارة",
    knownPeople: [MARWAN, SARA],
    expectedItems: [
      { amount: 450, type: "expense", category: "العائلة", subCategory: "مروان أخوك" },
      { amount: 550, type: "expense", category: "أصدقاء", subCategory: "سارة صاحبتك" },
    ],
    tags: ["two_people", "known_person"],
  },
  {
    id: "CMP-011",
    bucket: "compound",
    tier: "locked",
    text: "دبحت خروف بـ 15000 وصرفت 2000 جزار ووزعت 5000 لحمة صدقة",
    expectedItems: [
      {
        amount: 15000,
        type: "expense",
        category: "أكل وشرب",
        subCategory: "لحوم ودواجن",
      },
      {
        amount: 2000,
        type: "expense",
        category: "أكل وشرب",
        subCategory: "لحوم ودواجن",
        subCategoryMode: "soft",
      },
      {
        amount: 5000,
        type: "expense",
        category: "هدايا وصدقات",
        subCategory: "صدقة/تبرع",
      },
    ],
    tags: ["ritual", "three_items"],
  },
  {
    id: "CMP-012",
    bucket: "compound",
    tier: "locked",
    text: "صرفت ٥٠٠ جنيه في السوبر ماركت و ٣٠٠ بنزين",
    expectedItems: [
      { amount: 500, type: "expense", category: "أكل وشرب", subCategory: "بقالة" },
      { amount: 300, type: "expense", category: "مواصلات", subCategory: "بنزين" },
    ],
    tags: ["arabic_indic", "index_shift_probe", "two_items"],
  },
];

// ─── mixed_direction (8) ───────────────────────────────────────────

const MIXED_DIRECTION: BenchmarkCase[] = [
  {
    id: "MIX-001",
    bucket: "mixed_direction",
    tier: "locked",
    text: "جالي 2000 جنيه من فريلانس ودفعت 500 جنيه فاتورة النت",
    expectedItems: [
      { amount: 2000, type: "income", category: "عمل حر", subCategory: "مشروع" },
      { amount: 500, type: "expense", category: "فواتير", subCategory: "إنترنت" },
    ],
    tags: ["income_plus_expense"],
  },
  {
    id: "MIX-002",
    bucket: "mixed_direction",
    tier: "locked",
    text: "قبضت المرتب 15000 وحولت 2000 لمروان ودفعت الكهربا 450",
    knownPeople: [MARWAN],
    expectedItems: [
      { amount: 15000, type: "income", category: "مرتب", subCategory: "مرتب أساسي" },
      { amount: 2000, type: "expense", category: "العائلة", subCategory: "مروان أخوك" },
      { amount: 450, type: "expense", category: "فواتير", subCategory: "كهرباء" },
    ],
    tags: ["salary", "known_person", "three_items"],
  },
  {
    id: "MIX-003",
    bucket: "mixed_direction",
    tier: "aspirational",
    text: "سلفت أحمد 1000 وبعدين عماد رجعلي 500 كان واخدهم",
    knownPeople: [AHMED, EMAD],
    expectedItems: [
      { amount: 1000, type: "expense", category: "أصدقاء", subCategory: "أحمد صاحبك" },
      {
        amount: 500,
        type: "income",
        typeAnyOf: ["income", "transfer"],
        category: "تحويل",
        categoryAnyOf: ["تحويل", "موظفين"],
        subCategoryMode: "soft",
      },
    ],
    tags: ["debt_out", "debt_repaid_in"],
  },
  {
    id: "MIX-004",
    bucket: "mixed_direction",
    tier: "locked",
    text: "بعت 1000 جنيه لعلي وقبضت جمعية 5000",
    knownPeople: [
      { name: "علي", relationship: "صديق", category: "أصدقاء", subCategory: "علي صاحبك" },
    ],
    expectedItems: [
      { amount: 1000, type: "expense", category: "أصدقاء", subCategory: "علي صاحبك" },
      {
        amount: 5000,
        type: "income",
        category: "التزامات وجمعيات",
        subCategory: "قبض جمعية",
      },
    ],
    tags: ["gam3eya", "known_person", "mixed"],
  },
  {
    id: "MIX-005",
    bucket: "mixed_direction",
    tier: "locked",
    text: "كسبت 500 جنيه من مسابقة ودفعت منها 100 جنيه كهربا",
    expectedItems: [
      {
        amount: 500,
        type: "income",
        category: "عوائد استثمار",
        categoryAnyOf: ["عوائد استثمار", "عمل حر", "مرتب"],
        subCategoryMode: "soft",
      },
      { amount: 100, type: "expense", category: "فواتير", subCategory: "كهرباء" },
    ],
    tags: ["linked_income_expense"],
  },
  {
    id: "MIX-006",
    bucket: "mixed_direction",
    tier: "locked",
    text: "سحبت 1000 من الـ ATM واشتريت دهب بـ 5000",
    expectedItems: [
      { amount: 1000, type: "transfer", category: "تحويل", subCategory: "سحب ATM" },
      { amount: 5000, type: "investment", category: "استثمار", subCategory: "ذهب" },
    ],
    tags: ["atm", "investment"],
  },
  {
    id: "MIX-007",
    bucket: "mixed_direction",
    tier: "locked",
    text: "جالي كاشباك 30 جنيه وشحنت رصيد بـ 50 ودفعت قسط فاليو 600",
    expectedItems: [
      { amount: 30, type: "income", category: "عوائد استثمار", subCategory: "كاش باك" },
      { amount: 50, type: "expense", category: "فواتير", subCategory: "شحن رصيد" },
      { amount: 600, type: "expense", category: "فواتير", subCategory: "أقساط" },
    ],
    tags: ["cashback", "installment", "three_items"],
  },
  {
    id: "MIX-008",
    bucket: "mixed_direction",
    tier: "locked",
    text: "أخدت أوفر تايم 1200 وتبرعت بـ 200 للجامع وجبت عشا بـ 90",
    expectedItems: [
      { amount: 1200, type: "income", category: "مرتب", subCategory: "أوفر تايم" },
      {
        amount: 200,
        type: "expense",
        category: "هدايا وصدقات",
        subCategory: "صدقة/تبرع",
      },
      {
        amount: 90,
        type: "expense",
        category: "أكل وشرب",
        subCategory: "مطعم",
        subCategoryMode: "soft",
      },
    ],
    tags: ["overtime", "charity", "three_items"],
  },
];

export const CORE_CASES: BenchmarkCase[] = [
  ...DIRECTION_TRAPS,
  ...NUMERIC_FORMS,
  ...ENTITY_AMBIGUITY,
  ...NON_FINANCIAL,
  ...BOUNDARY,
  ...SINGLE_CLAUSE,
  ...COMPOUND,
  ...MIXED_DIRECTION,
];
