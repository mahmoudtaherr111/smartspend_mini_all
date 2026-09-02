/**
 * Full one-minute Egyptian narratives — the actual product use case.
 *
 * Each is a single spoken utterance the way a user would dictate it: no punctuation
 * discipline, filler speech, mixed numeral forms, mixed transaction directions, and
 * people both known and unknown.
 *
 * These are the cases that expose taxonomy starvation, output truncation and
 * segmentation drift all at once. Kept in their own module because each one is long.
 */
import type { BenchmarkCase } from "./classification-cases.types";

const MARWAN = {
  name: "مروان",
  relationship: "أخ",
  category: "العائلة",
  subCategory: "مروان أخوك",
};

export const MONOLOGUE_CASES: BenchmarkCase[] = [
  {
    id: "MON-001",
    bucket: "monologue",
    tier: "locked",
    text:
      "طب استنى بقى أحسبلك النهاردة، الصبح صحيت متأخر ونزلت جبت فطار فول وطعمية بـ ٢٥ جنيه من عم رجب، " +
      "وشربت قهوة من الكافيه اللي جنب الشغل بـ خمسة وتلاتين، وركبت اوبر للشغل بـ 85 جنيه عشان كنت متأخر، " +
      "وفي الشغل حاسبت على الغدا كشري بـ سبعين، وبعد الضهر نزلت البنزينة حطيت بنزين بـ 400 واديت السايس عشرة جنيه، " +
      "وف السكة عديت على الصيدلية وجبت دوا بـ مية وعشرين، ودفعت فاتورة الكهربا 450 من فوري، وشحنت رصيد بـ 50، " +
      "ولما وصلت البيت اديت البواب مية جنيه بتاع الشهر، وقبضت الجمعية 5000 الحمد لله، " +
      "وحولت لمروان الفين على انستاباي، ودفعت قسط فاليو 600، وآخر حاجة جبت علبة سجاير بـ خمسة وستين وخلاص كده يا سيدي.",
    knownPeople: [MARWAN],
    allowedDecisions: ["auto_save", "review"],
    expectedItems: [
      { amount: 25, type: "expense", category: "أكل وشرب", subCategory: "وجبات سريعة" },
      { amount: 35, type: "expense", category: "أكل وشرب", subCategory: "قهوة وكافيه" },
      { amount: 85, type: "expense", category: "مواصلات", subCategory: "أوبر/كريم" },
      { amount: 70, type: "expense", category: "أكل وشرب", subCategory: "مطعم" },
      { amount: 400, type: "expense", category: "مواصلات", subCategory: "بنزين" },
      { amount: 10, type: "expense", category: "خدمات سيارات", subCategory: "ركنة" },
      { amount: 120, type: "expense", category: "صحة", subCategory: "صيدلية" },
      { amount: 450, type: "expense", category: "فواتير", subCategory: "كهرباء" },
      { amount: 50, type: "expense", category: "فواتير", subCategory: "شحن رصيد" },
      {
        amount: 100,
        type: "expense",
        category: "سكن",
        categoryAnyOf: ["سكن", "موظفين"],
        subCategoryMode: "soft",
        why: "البواب — لا توجد فرعية مخصصة له",
      },
      {
        amount: 5000,
        type: "income",
        category: "التزامات وجمعيات",
        subCategory: "قبض جمعية",
        why: "قبضت الجمعية = دخل — ركيزة الاتجاه",
      },
      { amount: 2000, type: "expense", category: "العائلة", subCategory: "مروان أخوك" },
      { amount: 600, type: "expense", category: "فواتير", subCategory: "أقساط" },
      { amount: 65, type: "expense", category: "تدخين", subCategory: "سجائر" },
    ],
    tags: [
      "monologue",
      "arabic_indic",
      "word_number",
      "filler",
      "gam3eya_income",
      "known_person",
      "installment",
      "fourteen_items",
    ],
    note: "مجموع المصروف 4010 · الدخل 5000",
  },

  {
    id: "MON-002",
    bucket: "monologue",
    tier: "locked",
    text:
      "يلا نشوف عملت ايه امبارح، الصبح قبضت المرتب خمستاشر الف الحمد لله، وعلى طول حولت لأمي الفين على فودافون كاش، " +
      "وبعدين نزلت السوبر ماركت جبت خضار ولحمة بـ تمنمية جنيه، وجبت مناديل ومنظفات بـ مية وخمسين، " +
      "وبعدها استلفت من محمود خمسمية عشان معايا كاش قليل، وسلفت سيف تلتمية كان محتاجهم، " +
      "وحمزة رجعلي فلوسي مية وخمسين اللي كان واخدهم مني، ورحت الجيم دفعت الاشتراك سبعمية، " +
      "وف الرجوع ركبت مترو بـ عشرة، واشتريت شاحن من محل الموبايلات بـ ميتين وخمسين، " +
      "وطلبت دليفري بـ مية وتمانين بالليل، وآخر حاجة تبرعت بـ خمسين جنيه صدقة للجامع.",
    knownPeople: [
      { name: "محمود", relationship: "صديق", category: "أصدقاء", subCategory: "محمود صاحبك" },
      { name: "سيف", relationship: "صديق", category: "أصدقاء", subCategory: "سيف صاحبك" },
      { name: "حمزة", relationship: "صديق", category: "أصدقاء", subCategory: "حمزة صاحبك" },
    ],
    allowedDecisions: ["auto_save", "review"],
    expectedItems: [
      { amount: 15000, type: "income", category: "مرتب", subCategory: "مرتب أساسي" },
      {
        amount: 2000,
        type: "expense",
        category: "العائلة",
        subCategoryMode: "soft",
        why: "لأمي — لفظ قرابة عام بلا اسم مسجّل",
      },
      { amount: 800, type: "expense", category: "أكل وشرب", subCategory: "بقالة" },
      { amount: 150, type: "expense", category: "سكن", subCategory: "منظفات" },
      {
        amount: 500,
        type: "income",
        typeAnyOf: ["income", "transfer"],
        category: "تحويل",
        categoryAnyOf: ["تحويل", "أصدقاء"],
        subCategoryMode: "soft",
        why: "استلفت = مال داخل",
      },
      { amount: 300, type: "expense", category: "أصدقاء", subCategory: "سيف صاحبك" },
      {
        amount: 150,
        type: "income",
        typeAnyOf: ["income", "transfer"],
        category: "تحويل",
        categoryAnyOf: ["تحويل", "أصدقاء"],
        subCategoryMode: "soft",
        why: "رجعلي = سداد وارد",
      },
      { amount: 700, type: "expense", category: "ترفيه", subCategory: "رياضة وجيم" },
      { amount: 10, type: "expense", category: "مواصلات", subCategory: "مترو" },
      { amount: 250, type: "expense", category: "تسوق", subCategory: "أجهزة إلكترونية" },
      { amount: 180, type: "expense", category: "أكل وشرب", subCategory: "دليفري" },
      { amount: 50, type: "expense", category: "هدايا وصدقات", subCategory: "صدقة/تبرع" },
    ],
    tags: [
      "monologue",
      "salary_income",
      "debt_out",
      "debt_in",
      "debt_repaid_in",
      "word_numbers_only",
      "family_generic_term",
      "charity",
      "twelve_items",
    ],
    note: "كل المبالغ منطوقة بالكلمات — لا رقم واحد بالأرقام. مجموع المصروف 4440 · الدخل 15650",
  },

  {
    id: "MON-003",
    bucket: "monologue",
    tier: "locked",
    text:
      "النهارده كان يوم زحمه بجد، الصبح دفعت لسايس الجراج خمستاشر جنيه، وبعدين رحت البنزينه حطيت سولار ب تلتمية وخمسين، " +
      "وعديت على القهوجى شربت شاى ب عشرة، وطيرت باكو ونص فى قطع غيار للعربيه عند الميكانيكى، " +
      "وحاسبت الدكتور خمسميه جنيه كشف اسنان، وجبت الدوا من الاجزخانه ب ميتين وتلاتين، " +
      "وبعد كده 7awalt 500 gneh l Ahmed 3ala instapay، وشحنت كارت فكه ب عشرين، " +
      "ودفعت مصاريف الكورس اربعتلاف جنيه، وجالى ارنب من بيع الارض الحمد لله وخلاص.",
    knownPeople: [
      { name: "أحمد", relationship: "صديق", category: "أصدقاء", subCategory: "أحمد صاحبك" },
    ],
    allowedDecisions: ["review", "clarify", "auto_save"],
    expectedItems: [
      { amount: 15, type: "expense", category: "خدمات سيارات", subCategory: "ركنة" },
      { amount: 350, type: "expense", category: "مواصلات", subCategory: "بنزين" },
      { amount: 10, type: "expense", category: "أكل وشرب", subCategory: "قهوة وكافيه" },
      {
        amount: 1500,
        type: "expense",
        category: "خدمات سيارات",
        categoryAnyOf: ["خدمات سيارات", "مواصلات"],
        subCategoryMode: "soft",
        why: "باكو ونص = 1500",
      },
      { amount: 500, type: "expense", category: "صحة", subCategory: "أسنان" },
      { amount: 230, type: "expense", category: "صحة", subCategory: "صيدلية" },
      {
        amount: 500,
        type: "expense",
        category: "أصدقاء",
        subCategory: "أحمد صاحبك",
        why: "الجملة بالفرانكو كاملة — لازم تنجو من التطبيع",
      },
      { amount: 20, type: "expense", category: "فواتير", subCategory: "شحن رصيد" },
      { amount: 4000, type: "expense", category: "تعليم", subCategory: "كورسات" },
      {
        amount: 1000000,
        type: "income",
        typeAnyOf: ["income", "investment"],
        category: "عوائد استثمار",
        categoryAnyOf: ["عوائد استثمار", "استثمار", "متنوعات"],
        subCategoryMode: "soft",
        why: "أرنب = مليون",
      },
    ],
    tags: [
      "monologue",
      "stt_ta_marbuta",
      "stt_alef_maqsura",
      "franco",
      "slang_unit_bako",
      "slang_unit_arnab",
      "run_together_number",
      "ten_items",
    ],
    note:
      "فساد إملائي متعمّد (ة→ه، ي→ى، همزات ناقصة) + فرانكو + وحدات عامية. " +
      "فيه مبلغان بقيمة 500 — يختبر المطابقة بترتيب السرد.",
  },
];
