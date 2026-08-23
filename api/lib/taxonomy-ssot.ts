/**
 * SmartSpend Category Taxonomy Single Source of Truth (SSoT)
 * Version: 1.0.0
 * 
 * Consolidates standard category definitions, labels, icons, colors, aliases,
 * and subcategories for the entire system (rules, classifier, UI, agent, reports).
 */

export interface TaxonomyCategory {
  id: string;                // Stable ID (e.g. 'food', 'transport')
  labelAr: string;           // Display Arabic label (e.g. 'أكل وشرب')
  labelEn: string;           // Display English label (e.g. 'Food & Drinks')
  icon: string;              // Unicode Emoji
  color: string;             // Theme Color Hex
  type: "expense" | "income" | "transfer" | "investment";
  businessEligible: boolean; // Can be categorized as business expense
  isIncome: boolean;
  sortOrder: number;
  aliases: string[];         // Egyptian Arabic & English synonyms/aliases for matching
  examples: string[];
}

export interface TaxonomySubcategory {
  id: string;
  categoryId: string;
  labelAr: string;
  labelEn: string;
  aliases: string[];
  examples: string[];
}

export const TAXONOMY_VERSION = 1;

export const CATEGORIES: TaxonomyCategory[] = [
  {
    id: "food",
    labelAr: "أكل وشرب",
    labelEn: "Food & Drinks",
    icon: "🍔",
    color: "#f97316",
    type: "expense",
    businessEligible: true,
    isIncome: false,
    sortOrder: 1,
    aliases: ["اكل", "شرب", "مطعم", "مطاعم", "قهوة", "قهوه", "كافيه", "سوبرماركت", "سوبر ماركت", "بقالة", "بقاله", "خضار", "فاكهة", "لحوم", "جزار", "مخبز", "فرن", "دليفري", "طلبات", "talabat", "kfc", "mcdonalds", "ماكدونالدز", "كوك دور", "قهوجي"],
    examples: ["كشري بـ50 جنيه", "طلبات من السوبرماركت", "فطار فول وطعمية"]
  },
  {
    id: "transport",
    labelAr: "مواصلات",
    labelEn: "Transport",
    icon: "🚗",
    color: "#3b82f6",
    type: "expense",
    businessEligible: true,
    isIncome: false,
    sortOrder: 2,
    aliases: ["مواصلات", "اوبر", "uber", "كريم", "careem", "تاكسي", "مترو", "قطار", "قطارات", "اتوبيس", "ميكروباص", "بنزين", "تفويلة", "سولار", "زيت العربية", "ميكانيكي", "سايس", "ركنة", "ركنه", "توكتوك", "توك توك", "سفر", "طيران", "سويفل", "swvl"],
    examples: ["أوبر لمشوار الشغل", "تذكرة المترو", "تفويلة بنزين"]
  },
  {
    id: "bills",
    labelAr: "فواتير",
    labelEn: "Bills",
    icon: "📄",
    color: "#ef4444",
    type: "expense",
    businessEligible: true,
    isIncome: false,
    sortOrder: 3,
    aliases: ["فواتير", "فاتورة", "فاتوره", "قسط", "اقساط", "كهرباء", "كهربا", "مياه", "ميه", "غاز", "شحن رصيد", "كارت شحن", "باقة نت", "انترنت", "نت", "تليفون", "ارضي", "موبايل", "وي", "اورنج", "فودافون", "اتصالات", "اشتراك", "اشتراكات", "نتفليكس", "netflix", "سبوتيفاي", "spotify"],
    examples: ["فاتورة الكهرباء", "قسط الشقة", "شحن باقة فودافون"]
  },
  {
    id: "housing",
    labelAr: "سكن",
    labelEn: "Housing & Rent",
    icon: "🏠",
    color: "#8b5cf6",
    type: "expense",
    businessEligible: false,
    isIncome: false,
    sortOrder: 4,
    aliases: ["سكن", "ايجار", "إيجار", "شقة", "شقه", "صيانة شقة", "بواب", "حارس", "نظافة", "عفش", "اثاث", "اجهزة منزلية", "أجهزة منزلية", "سباكة", "سباك", "كهربائي", "نقاشة"],
    examples: ["إيجار الشقة", "مصاريف الصيانة الشهرية للبواب", "شراء خلاط جديد"]
  },
  {
    id: "shopping",
    labelAr: "تسوق",
    labelEn: "Shopping",
    icon: "🛍️",
    color: "#ec4899",
    type: "expense",
    businessEligible: false,
    isIncome: false,
    sortOrder: 5,
    aliases: ["تسوق", "شوبنج", "لبس", "ملابس", "قميص", "بنطلون", "فستان", "جزمة", "حذاء", "شراء", "جهاز", "مشتريات", "امازون", "amazon", "جوميا", "نون", "noon", "نظارة", "ساعة"],
    examples: ["قميص وبنطلون من زارا", "اوردر امازون"]
  },
  {
    id: "health",
    labelAr: "صحة",
    labelEn: "Health",
    icon: "🏥",
    color: "#10b981",
    type: "expense",
    businessEligible: false,
    isIncome: false,
    sortOrder: 6,
    aliases: ["صحة", "صحه", "دكتور", "طبيب", "كشف", "عيادة", "مستشفى", "مستشفي", "تحاليل", "اشعة", "أشعة", "صيدلية", "صيدليه", "دواء", "دوا", "روشتة", "نظارة طبية", "علاج"],
    examples: ["كشف الدكتور", "علاج من الصيدلية", "تحاليل معمل البرج"]
  },
  {
    id: "entertainment",
    labelAr: "ترفيه",
    labelEn: "Entertainment",
    icon: "🎬",
    color: "#eab308",
    type: "expense",
    businessEligible: false,
    isIncome: false,
    sortOrder: 7,
    aliases: ["ترفيه", "خروج", "فسحة", "فسحه", "سينما", "مسرح", "ملاهي", "سفرية", "مصيف", "بحر", "اوتيل", "فندق", "حجز رحلة", "بلايستيشن", "العاب", "ألعاب", "ماتش", "قهوة بلدي"],
    examples: ["حجز تذكرة السينما", "خروجة الويكند مع صحابي"]
  },
  {
    id: "education",
    labelAr: "تعليم",
    labelEn: "Education",
    icon: "🎓",
    color: "#14b8a6",
    type: "expense",
    businessEligible: false,
    isIncome: false,
    sortOrder: 8,
    aliases: ["تعليم", "مدرسة", "مدرسه", "جامعة", "كلية", "كليه", "دروس", "درس خصوصي", "كتب", "كشكول", "كورس", "كورسات", "دبلومة", "اشتراك باص مدرسة"],
    examples: ["مصاريف الكورس", "كتب المدرسة للأولاد"]
  },
  {
    id: "personal_care",
    labelAr: "عناية شخصية",
    labelEn: "Personal Care",
    icon: "🧴",
    color: "#f43f5e",
    type: "expense",
    businessEligible: false,
    isIncome: false,
    sortOrder: 9,
    aliases: ["عناية شخصية", "عنايه شخصيه", "حلاق", "حلاقة", "شعر", "دقن", "كوافير", "بيوتي سنتر", "جيم", "gym", "برفيوم", "مكياج", "مناديل", "شامبو", "معجون سنان"],
    examples: ["حلاقة عند الصالون", "اشتراك الجيم الشهري"]
  },
  {
    id: "gifts",
    labelAr: "هدايا",
    labelEn: "Gifts",
    icon: "🎁",
    color: "#d946ef",
    type: "expense",
    businessEligible: false,
    isIncome: false,
    sortOrder: 10,
    aliases: ["هدايا", "هدية", "هديه", "عيد ميلاد", "سبوع", "مناسبة", "مهر", "شبكة", "عزومة بمناسبة", "هدية لماما"],
    examples: ["هدية عيد ميلاد خطيبتي", "هدية سبوع ابن اختي"]
  },
  {
    id: "charity",
    labelAr: "صدقة وتبرعات",
    labelEn: "Charity",
    icon: "🤲",
    color: "#06b6d4",
    type: "expense",
    businessEligible: false,
    isIncome: false,
    sortOrder: 11,
    aliases: ["صدقة", "تبرع", "تبرعات", "زكاة", "زكاه", "جامع", "كنيسة", "جمعية خيرية", "رسالة", "اورمان", "٥٧٣٥٧", "اطعام", "مساعدة محتاج"],
    examples: ["تبرع لمستشفى 57357", "شنطة رمضان الخيرية"]
  },
  {
    id: "debt_payment",
    labelAr: "سداد ديون",
    labelEn: "Debt Payment",
    icon: "💸",
    color: "#64748b",
    type: "expense",
    businessEligible: false,
    isIncome: false,
    sortOrder: 12,
    aliases: ["ديون", "قرض", "سداد", "تسديد", "ارجاع فلوس", "جمعية", "قسط قرض", "رجع سلفة"],
    examples: ["تسديد 500 جنيه سلفة لأحمد", "دفع قسط البنك"]
  },
  {
    id: "income",
    labelAr: "دخل",
    labelEn: "Income",
    icon: "💰",
    color: "#22c55e",
    type: "income",
    businessEligible: true,
    isIncome: true,
    sortOrder: 13,
    aliases: ["دخل", "مرتب", "راتب", "قبض", " salary", "بونص", "مكافأة", "ربح", "ارباح", "أرباح", "حوالة واردة", "كاش باك", "مبيعات", "فيزا القبض"],
    examples: ["نزول المرتب في الحساب", "مبيعات من العميل"]
  },
  {
    id: "investment",
    labelAr: "استثمار",
    labelEn: "Investment",
    icon: "📈",
    color: "#0284c7",
    type: "investment",
    businessEligible: false,
    isIncome: false,
    sortOrder: 14,
    aliases: ["استثمار", "ذهب", "بورصة", "بورصه", "شراء ذهب", "سبائك", "شهادات بنك", "شهادة بنكية", "شراء سهم", "ثاندر", "thndr"],
    examples: ["شراء سبيكة ذهب للاستثمار", "إيداع في ثاندر لشراء أسهم"]
  },
  {
    id: "other",
    labelAr: "أخرى",
    labelEn: "Other",
    icon: "⚙️",
    color: "#6b7280",
    type: "expense",
    businessEligible: true,
    isIncome: false,
    sortOrder: 15,
    aliases: ["اخرى", "أخري", "عام", "غير مصنف", "تاني", "نثرية", "نثريات"],
    examples: ["مصاريف عامة غير محددة"]
  }
];

export const SUBCATEGORIES: TaxonomySubcategory[] = [
  // Food
  { id: "fast_food", categoryId: "food", labelAr: "وجبات سريعة", labelEn: "Fast Food", aliases: ["تيك اواي", "دليفري", "ماك", "كنتاكي"], examples: [] },
  { id: "restaurant", categoryId: "food", labelAr: "مطاعم", labelEn: "Restaurant", aliases: ["اكل بره", "خروج مطعم"], examples: [] },
  { id: "coffee", categoryId: "food", labelAr: "قهوة وكافيه", labelEn: "Coffee & Cafe", aliases: ["قهوه", "كافيه", "قهوة بلدي"], examples: [] },
  { id: "groceries", categoryId: "food", labelAr: "بقالة", labelEn: "Groceries", aliases: ["سوبر ماركت", "سوبرماركت", "مشتريات البيت"], examples: [] },
  
  // Transport
  { id: "ride_sharing", categoryId: "transport", labelAr: "أوبر وكريم", labelEn: "Uber & Careem", aliases: ["اوبر", "كريم", "ايندرايفر", "indrive"], examples: [] },
  { id: "metro_bus", categoryId: "transport", labelAr: "مترو وأتوبيس", labelEn: "Metro & Bus", aliases: ["ميكروباص", "مترو الأنفاق", "تذكرة"], examples: [] },
  { id: "fuel", categoryId: "transport", labelAr: "بنزين", labelEn: "Fuel", aliases: ["تفويلة", "بنزينة"], examples: [] },
  
  // Bills
  { id: "telecom", categoryId: "bills", labelAr: "شحن واتصالات", labelEn: "Telecom & Recharge", aliases: ["رصيد", "شحن رصيد", "كارت شحن", "باقة"], examples: [] },
  { id: "utilities", categoryId: "bills", labelAr: "مرافق (كهرباء وغاز)", labelEn: "Utilities", aliases: ["فاتورة الكهرباء", "غاز", "ميه"], examples: [] },
  
  // Housing
  { id: "rent", categoryId: "housing", labelAr: "إيجار", labelEn: "Rent", aliases: ["ايجار", "الايجار"], examples: [] },
  
  // Income
  { id: "salary", categoryId: "income", labelAr: "مرتب", labelEn: "Salary", aliases: ["القبض", "مرتب الشهري"], examples: [] }
];

export function getCategoryById(id: string): TaxonomyCategory | undefined {
  return CATEGORIES.find(c => c.id === id);
}

export function getCategoryByAlias(alias: string): TaxonomyCategory | undefined {
  const normalizedAlias = alias.trim().toLowerCase()
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "y")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه");
    
  return CATEGORIES.find(c => 
    c.id === normalizedAlias || 
    c.labelAr === alias || 
    c.labelEn.toLowerCase() === normalizedAlias ||
    c.aliases.some(a => a.toLowerCase() === normalizedAlias)
  );
}

export function getAllCategories(): TaxonomyCategory[] {
  return CATEGORIES;
}

export function getSubcategories(categoryId: string): TaxonomySubcategory[] {
  return SUBCATEGORIES.filter(s => s.categoryId === categoryId);
}

export function getCategoryAliases(categoryId: string): string[] {
  const cat = getCategoryById(categoryId);
  return cat ? cat.aliases : [];
}

export function isValidCategory(id: string): boolean {
  return CATEGORIES.some(c => c.id === id);
}
