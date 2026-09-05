/**
 * SmartSpend Category Registry
 * Central registry for all financial categories and subcategories
 */

import { governedNouns } from "./direction-governed-taxonomy";

export interface SubCategory {
  id: string;
  name: string;
  name_ar: string;
}

export interface MainCategory {
  id: string;
  name: string;
  name_ar: string;
  icon: string;
  color: string;
  type: "expense" | "income" | "transfer" | "investment";
  subcategories: SubCategory[];
}

export const CATEGORIES: MainCategory[] = [
  {
    id: "food",
    name: "Food & Drinks",
    name_ar: "أكل وشرب",
    icon: "🍔",
    color: "#f97316",
    type: "expense",
    subcategories: [
      { id: "fast_food", name: "Fast Food", name_ar: "وجبات سريعة" },
      { id: "restaurant", name: "Restaurant", name_ar: "مطعم" },
      { id: "coffee", name: "Coffee & Cafe", name_ar: "قهوة وكافيه" },
      { id: "snacks", name: "Snacks", name_ar: "سناكس" },
      { id: "groceries", name: "Groceries", name_ar: "بقالة" },
      { id: "bakery", name: "Bakery", name_ar: "مخبوزات" },
      { id: "drinks", name: "Drinks", name_ar: "مشروبات" },
      { id: "delivery", name: "Delivery", name_ar: "دليفري" },
      { id: "meat_poultry", name: "Meat & Poultry", name_ar: "لحوم ودواجن" },
      { id: "seafood", name: "Seafood", name_ar: "سي فود" },
      { id: "general_food", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "transport",
    name: "Transport",
    name_ar: "مواصلات",
    icon: "🚗",
    color: "#3b82f6",
    type: "expense",
    subcategories: [
      { id: "uber", name: "Uber/Careem", name_ar: "أوبر/كريم" },
      { id: "metro", name: "Metro", name_ar: "مترو" },
      { id: "bus", name: "Bus", name_ar: "أتوبيس" },
      { id: "taxi", name: "Taxi", name_ar: "تاكسي" },
      { id: "fuel", name: "Fuel", name_ar: "بنزين" },
      { id: "parking", name: "Parking", name_ar: "ركنة" },
      { id: "maintenance", name: "Car Maintenance", name_ar: "صيانة عربية" },
      { id: "toktok", name: "TokTok", name_ar: "توكتوك" },
      { id: "flight", name: "Flight", name_ar: "طيران" },
      { id: "general_transport", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "bills",
    name: "Bills",
    name_ar: "فواتير",
    icon: "📄",
    color: "#ef4444",
    type: "expense",
    subcategories: [
      { id: "electricity", name: "Electricity", name_ar: "كهرباء" },
      { id: "water", name: "Water", name_ar: "مياه" },
      { id: "gas", name: "Gas", name_ar: "غاز" },
      { id: "internet", name: "Internet", name_ar: "إنترنت" },
      { id: "phone", name: "Phone", name_ar: "تليفون" },
      { id: "mobile_recharge", name: "Mobile Recharge", name_ar: "شحن رصيد" },
      { id: "installments", name: "Installments", name_ar: "أقساط" },
      { id: "insurance", name: "Insurance", name_ar: "تأمين" },
      { id: "taxes", name: "Taxes", name_ar: "ضرائب" },
      { id: "general_bills", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "home",
    name: "Home",
    name_ar: "سكن",
    icon: "🏠",
    color: "#8b5cf6",
    type: "expense",
    subcategories: [
      { id: "rent", name: "Rent", name_ar: "إيجار" },
      { id: "furniture", name: "Furniture", name_ar: "أثاث" },
      { id: "home_maintenance", name: "Maintenance", name_ar: "صيانة" },
      { id: "cleaning", name: "Cleaning", name_ar: "نظافة" },
      { id: "appliances", name: "Appliances", name_ar: "أجهزة منزلية" },
      { id: "cleaning_supplies", name: "Cleaning Supplies", name_ar: "منظفات" },
      { id: "general_home", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "shopping",
    name: "Shopping",
    name_ar: "تسوق",
    icon: "🛍️",
    color: "#ec4899",
    type: "expense",
    subcategories: [
      { id: "clothes", name: "Clothes", name_ar: "ملابس" },
      { id: "electronics", name: "Electronics", name_ar: "أجهزة إلكترونية" },
      { id: "personal_care", name: "Personal Care", name_ar: "عناية شخصية" },
      { id: "accessories", name: "Accessories", name_ar: "إكسسوارات" },
      { id: "shoes", name: "Shoes", name_ar: "أحذية" },
      { id: "general_shopping", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "health",
    name: "Health",
    name_ar: "صحة",
    icon: "🏥",
    color: "#10b981",
    type: "expense",
    subcategories: [
      { id: "doctor", name: "Doctor", name_ar: "دكتور" },
      { id: "pharmacy", name: "Pharmacy", name_ar: "صيدلية" },
      { id: "lab", name: "Lab Tests", name_ar: "تحاليل" },
      { id: "hospital", name: "Hospital", name_ar: "مستشفى" },
      { id: "dental", name: "Dental", name_ar: "أسنان" },
      { id: "optical", name: "Optical", name_ar: "نظارات" },
      { id: "general_health", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "education",
    name: "Education",
    name_ar: "تعليم",
    icon: "📚",
    color: "#6366f1",
    type: "expense",
    subcategories: [
      { id: "school", name: "School", name_ar: "مدرسة" },
      { id: "university", name: "University", name_ar: "جامعة" },
      { id: "courses", name: "Courses", name_ar: "كورسات" },
      { id: "books", name: "Books", name_ar: "كتب" },
      { id: "tutoring", name: "Tutoring", name_ar: "دروس خصوصية" },
      { id: "general_education", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "entertainment",
    name: "Entertainment",
    name_ar: "ترفيه",
    icon: "🎮",
    color: "#f59e0b",
    type: "expense",
    subcategories: [
      { id: "cinema", name: "Cinema", name_ar: "سينما" },
      { id: "cafe", name: "Cafe", name_ar: "كافيه" },
      { id: "travel", name: "Travel", name_ar: "سفر" },
      { id: "sports", name: "Sports & Gym", name_ar: "رياضة وجيم" },
      { id: "gaming", name: "Gaming", name_ar: "ألعاب" },
      { id: "streaming", name: "Streaming", name_ar: "منصات مشاهدة" },
      { id: "outing", name: "Outing", name_ar: "خروجة" },
      { id: "playstation", name: "PlayStation", name_ar: "PlayStation" },
      { id: "board_games", name: "Board Games", name_ar: "كافيه بورد جيم" },
      { id: "friends_outing", name: "Friends Outing", name_ar: "خروجة صحاب" },
      { id: "corniche", name: "Corniche", name_ar: "كورنيش" },
      { id: "general_entertainment", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "subscriptions",
    name: "Subscriptions",
    name_ar: "اشتراكات",
    icon: "📱",
    color: "#14b8a6",
    type: "expense",
    subcategories: [
      { id: "netflix", name: "Netflix", name_ar: "نتفلكس" },
      { id: "spotify", name: "Spotify", name_ar: "سبوتيفاي" },
      { id: "chatgpt", name: "ChatGPT", name_ar: "شات جي بي تي" },
      { id: "google_ai", name: "Google AI", name_ar: "جوجل AI" },
      { id: "saas", name: "SaaS", name_ar: "برمجيات" },
      { id: "general_subs", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "smoking",
    name: "Smoking",
    name_ar: "تدخين",
    icon: "🚬",
    color: "#6b7280",
    type: "expense",
    subcategories: [
      { id: "cigarettes", name: "Cigarettes", name_ar: "سجائر" },
      { id: "vape", name: "Vape", name_ar: "فيب/ليكود" },
      { id: "shisha", name: "Shisha", name_ar: "شيشة/معسل" },
      { id: "smoking_general", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "gifts",
    name: "Gifts & Charity",
    name_ar: "هدايا وصدقات",
    icon: "🎁",
    color: "#f43f5e",
    type: "expense",
    subcategories: [
      { id: "birthday", name: "Birthday", name_ar: "عيد ميلاد" },
      { id: "wedding", name: "Wedding", name_ar: "فرح/خطوبة" },
      { id: "charity", name: "Charity", name_ar: "صدقة/تبرع" },
      { id: "zakat", name: "Zakat", name_ar: "زكاة" },
      { id: "eidiya", name: "Eidiya", name_ar: "عيدية" },
      { id: "general_gifts", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "pets",
    name: "Pets",
    name_ar: "حيوانات أليفة",
    icon: "🐾",
    color: "#a855f7",
    type: "expense",
    subcategories: [
      { id: "pet_food", name: "Pet Food", name_ar: "أكل" },
      { id: "vet", name: "Vet", name_ar: "طبيب بيطري" },
      { id: "pet_accessories", name: "Accessories", name_ar: "مستلزمات" },
    ],
  },
  {
    id: "work",
    name: "Work",
    name_ar: "عمل",
    icon: "💼",
    color: "#64748b",
    type: "expense",
    subcategories: [
      {
        id: "office_supplies",
        name: "Office Supplies",
        name_ar: "مستلزمات مكتب",
      },
      { id: "hosting", name: "Hosting", name_ar: "استضافة" },
      { id: "apis", name: "APIs", name_ar: "واجهات برمجية" },
      { id: "coworking", name: "Coworking", name_ar: "مساحة عمل" },
      { id: "general_work", name: "General", name_ar: "عام" },
    ],
  },
  // ─── Income Categories ───
  {
    id: "salary",
    name: "Salary",
    name_ar: "مرتب",
    icon: "💵",
    color: "#22c55e",
    type: "income",
    subcategories: [
      { id: "main_salary", name: "Main Salary", name_ar: "مرتب أساسي" },
      { id: "overtime", name: "Overtime", name_ar: "أوفر تايم" },
      { id: "bonus", name: "Bonus", name_ar: "مكافأة/بونص" },
      { id: "allowance", name: "Allowance", name_ar: "بدلات" },
    ],
  },
  {
    id: "freelance",
    name: "Freelance",
    name_ar: "عمل حر",
    icon: "💻",
    color: "#06b6d4",
    type: "income",
    subcategories: [
      { id: "project", name: "Project", name_ar: "مشروع" },
      { id: "commission", name: "Commission", name_ar: "عمولة" },
      { id: "side_hustle", name: "Side Hustle", name_ar: "سبوبة" },
    ],
  },
  {
    id: "investment_income",
    name: "Investment Income",
    name_ar: "عوائد استثمار",
    icon: "📈",
    color: "#84cc16",
    type: "income",
    subcategories: [
      { id: "dividends", name: "Dividends", name_ar: "أرباح" },
      { id: "interest", name: "Interest", name_ar: "فوائد" },
      { id: "cashback", name: "Cashback", name_ar: "كاش باك" },
      { id: "refund", name: "Refund", name_ar: "استرجاع" },
    ],
  },
  // ─── Financial / Transfer Categories ───
  {
    id: "transfer",
    name: "Transfer",
    name_ar: "تحويل",
    icon: "🏧",
    color: "#0ea5e9",
    type: "transfer",
    subcategories: [
      { id: "atm", name: "ATM Withdrawal", name_ar: "سحب ATM" },
      { id: "bank_transfer", name: "Bank Transfer", name_ar: "تحويل بنكي" },
      { id: "instapay", name: "Instapay", name_ar: "انستاباي" },
      { id: "vodafone_cash", name: "Vodafone Cash", name_ar: "فودافون كاش" },
      { id: "savings", name: "Savings", name_ar: "ادخار" },
      { id: "debt", name: "Debt/Loan", name_ar: "دين/سلفة" },
      { id: "cash_transfer", name: "Cash Transfer", name_ar: "تحويل كاش" },
      { id: "people", name: "People", name_ar: "أشخاص" },
    ],
  },
  {
    id: "investment",
    name: "Investment",
    name_ar: "استثمار",
    icon: "📊",
    color: "#eab308",
    type: "investment",
    subcategories: [
      { id: "gold", name: "Gold", name_ar: "ذهب" },
      { id: "stocks", name: "Stocks", name_ar: "أسهم" },
      { id: "certificates", name: "Certificates", name_ar: "شهادات" },
      { id: "real_estate", name: "Real Estate", name_ar: "عقارات" },
      { id: "crypto", name: "Crypto", name_ar: "عملات رقمية" },
    ],
  },
  // "التزامات يومية" merged into "فواتير" — removed as separate category
  {
    id: "digital_services",
    name: "Digital Services",
    name_ar: "خدمات رقمية",
    icon: "💻",
    color: "#0ea5e9",
    type: "expense",
    subcategories: [
      { id: "vpn_sub", name: "VPN", name_ar: "اشتراك VPN" },
      { id: "cloud_sub", name: "Cloud", name_ar: "اشتراك Cloud" },
      { id: "ai_tools", name: "AI Tools", name_ar: "أدوات AI" },
      { id: "domains", name: "Domains", name_ar: "دومينات" },
      { id: "hosting_new", name: "Hosting", name_ar: "استضافة" },
      { id: "digital_general", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "car_services",
    name: "Car Services",
    name_ar: "خدمات سيارات",
    icon: "🚗",
    color: "#3b82f6",
    type: "expense",
    subcategories: [
      { id: "toll", name: "Toll", name_ar: "كارتة" },
      { id: "parking_valet", name: "Parking", name_ar: "ركنة" },
      { id: "oil_change", name: "Oil Change", name_ar: "تغيير زيت" },
      { id: "car_violation", name: "Violation", name_ar: "مخالفة" },
      { id: "battery", name: "Battery", name_ar: "بطارية" },
      { id: "tires", name: "Tires", name_ar: "إطارات" },
      { id: "car_general", name: "General", name_ar: "عام" },
    ],
  },
  // "خروجات" merged into "ترفيه" — removed as separate category
  {
    id: "family_transactions",
    name: "Family Transactions",
    name_ar: "العائلة",
    icon: "👨‍👩‍👧‍👦",
    color: "#f43f5e",
    type: "expense",
    subcategories: [
      { id: "general_family", name: "General", name_ar: "عام" },
      { id: "parents", name: "Parents", name_ar: "الوالدين" },
      { id: "siblings", name: "Siblings", name_ar: "الإخوة" },
      { id: "children", name: "Children", name_ar: "الأبناء" },
    ],
  },
  {
    id: "friends_transactions",
    name: "Friends Transactions",
    name_ar: "أصدقاء",
    icon: "🤝",
    color: "#10b981",
    type: "expense",
    subcategories: [{ id: "general_friends", name: "General", name_ar: "عام" }],
  },
  {
    id: "employees_transactions",
    name: "Employees Transactions",
    name_ar: "موظفين",
    icon: "👷",
    color: "#64748b",
    type: "expense",
    subcategories: [
      { id: "general_employees", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "liabilities_and_gam3eyat",
    name: "Liabilities & Gam3eyat",
    name_ar: "التزامات وجمعيات",
    icon: "📜",
    color: "#8b5cf6",
    type: "expense", // mixed, but mostly expense
    subcategories: [
      {
        id: "gam3eya_installment",
        name: "Gam3eya Installment",
        name_ar: "قسط جمعية",
      },
      { id: "gam3eya_payout", name: "Gam3eya Payout", name_ar: "قبض جمعية" },
      {
        id: "corporate_installment",
        name: "Corporate Installment",
        name_ar: "أقساط شركات",
      },
      { id: "general", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "miscellaneous",
    name: "Miscellaneous",
    name_ar: "متنوعات",
    icon: "📦",
    color: "#94a3b8",
    type: "expense",
    subcategories: [
      { id: "general", name: "General", name_ar: "عام" },
      { id: "people", name: "People", name_ar: "أشخاص" },
    ],
  },
  {
    id: "government_services",
    name: "Government Services",
    name_ar: "خدمات حكومية",
    icon: "🏛️",
    color: "#78716c",
    type: "expense",
    subcategories: [
      { id: "license", name: "License", name_ar: "رخصة" },
      { id: "passport", name: "Passport", name_ar: "جواز سفر" },
      { id: "national_id", name: "National ID", name_ar: "بطاقة رقم قومي" },
      { id: "traffic_violation", name: "Traffic Violation", name_ar: "مخالفة مرور" },
      { id: "taxes_gov", name: "Taxes", name_ar: "ضرائب" },
      { id: "documentation", name: "Documentation", name_ar: "توثيق" },
      { id: "gov_general", name: "General", name_ar: "عام" },
    ],
  },
];

/** Get category by Arabic name */
export function getCategoryByArabicName(
  name_ar: string,
): MainCategory | undefined {
  return CATEGORY_BY_NORMALIZED_AR.get(comparableArabic(name_ar));
}

/** Get all category Arabic names */
export function getAllCategoryNames(): string[] {
  return CATEGORIES.map((c) => c.name_ar);
}

/** Get subcategories for a category */
export function getSubcategoriesFor(categoryNameAr: string): SubCategory[] {
  return getCategoryByArabicName(categoryNameAr)?.subcategories || [];
}

/** Get category type */
export function getCategoryType(categoryNameAr: string): string {
  return getCategoryByArabicName(categoryNameAr)?.type || "expense";
}

/** Get all expense category names */
export function getExpenseCategories(): string[] {
  return CATEGORIES.filter((c) => c.type === "expense").map((c) => c.name_ar);
}

/** Get all income category names */
export function getIncomeCategories(): string[] {
  return CATEGORIES.filter((c) => c.type === "income").map((c) => c.name_ar);
}

type TransactionType = MainCategory["type"];

const CATEGORY_ALIASES: Array<[string, string]> = [
  ["أخرى", "متنوعات"],
  ["مصروف شخصي", "متنوعات"],
  ["مدفوعات طوارئ", "متنوعات"],
  ["دخل", "مرتب"],
  ["راتب", "مرتب"],
  ["سكن وفواتير", "فواتير"],
  ["التزامات يومية", "فواتير"],
  ["Daily Commitments", "فواتير"],
  ["خروجات", "ترفيه"],
  ["Outings", "ترفيه"],
  ["ملابس", "تسوق"],
  ["سيارات", "خدمات سيارات"],
  ["تكنولوجيا", "خدمات رقمية"],
  ["أهل وبيت", "سكن"],
  ["تحويلات", "تحويل"],
  ["عائلة", "العائلة"],
  ["معاملة عائلية", "العائلة"],
  ["عائلي", "العائلة"],
  ["أشخاص", "العائلة"],
  ["معاملات عائلية", "العائلة"],
  ["صحاب", "أصدقاء"],
  ["أصدقاء", "أصدقاء"],
  ["صديق", "أصدقاء"],
  ["رياضة", "ترفيه"],
  ["رياضه", "ترفيه"],
  ["ألعاب", "ترفيه"],
  ["لعب", "ترفيه"],
  ["كورة", "ترفيه"],
  ["مشتريات", "تسوق"],
  ["طعام", "أكل وشرب"],
  ["أغذية", "أكل وشرب"],
  ["بقالة", "أكل وشرب"],
  ["صاحبي", "أصدقاء"],
  ["Friends", "أصدقاء"],
  ["موظف", "موظفين"],
  ["موظفين", "موظفين"],
  ["عمال", "موظفين"],
  ["عامل", "موظفين"],
  ["صنايعي", "موظفين"],
  ["موظفين وعمال", "موظفين"],
  ["شريك", "عمل"],
  ["جمعية", "التزامات وجمعيات"],
  ["جمعيتي", "التزامات وجمعيات"],
  ["قسط جمعية", "التزامات وجمعيات"],
  ["أقساط شركات", "التزامات وجمعيات"],
  ["فاليو", "التزامات وجمعيات"],
  ["حكومي", "خدمات حكومية"],
  ["خدمات حكومة", "خدمات حكومية"],
  ["رسوم حكومية", "خدمات حكومية"],
  ["هدايا", "هدايا وصدقات"],
  ["مجاملات", "هدايا وصدقات"],
  ["صيانة", "سكن"],
  ["أدوات شغل", "عمل"],
  ["أقساط", "فواتير"],
  ["تحويلات", "تحويل"],
  ["Bills", "فواتير"],
  ["Home & Bills", "فواتير"],
  ["Daily Commitments", "فواتير"],
  ["Income", "مرتب"],
  ["Salary", "مرتب"],
  ["Freelance", "عمل حر"],
  ["Transfer", "تحويل"],
  ["Shopping", "تسوق"],
  ["Transport", "مواصلات"],
  ["Car Services", "خدمات سيارات"],
  ["Digital Services", "خدمات رقمية"],
  ["Miscellaneous", "متنوعات"],
];

const DEFAULT_SUBCATEGORY_BY_CATEGORY = new Map(
  CATEGORIES.map((category) => [
    category.name_ar,
    category.subcategories.find((sub) => sub.name_ar === "عام")?.name_ar ||
      category.subcategories[0]?.name_ar ||
      "عام",
  ]),
);

import { normalizeArabic } from "./unified-normalizer";

export function comparableArabic(value: string): string {
  return normalizeArabic(value)
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function hasAny(text: string, terms: string[]): boolean {
  const normalized = comparableArabic(text);
  return terms.some((term) => normalized.includes(comparableArabic(term)));
}

function findCategoryByAnyName(value: string): MainCategory | undefined {
  const normalized = comparableArabic(value);
  return CATEGORIES.find(
    (category) =>
      comparableArabic(category.name_ar) === normalized ||
      comparableArabic(category.name) === normalized ||
      comparableArabic(category.id) === normalized,
  );
}

function findSubCategoryByAnyName(
  category: MainCategory,
  value: string,
): SubCategory | undefined {
  const normalized = comparableArabic(value);
  return category.subcategories.find(
    (subCategory) =>
      comparableArabic(subCategory.name_ar) === normalized ||
      comparableArabic(subCategory.name) === normalized ||
      comparableArabic(subCategory.id) === normalized,
  );
}

/** Nouns whose category is decided by the noun, not by the verb around it. */
const GOVERNED_NOUNS = governedNouns();

/**
 * Nouns that name the source of the income outright. Like the governed nouns above they
 * outrank the generic income verb standing next to them: "خلصت مشروع فريلانس وقبضت 6000"
 * contains قبضت, but it is freelance work, not salary — and the rule engine had already
 * resolved it to عمل حر/مشروع with 98 confidence before this scan overwrote it on the
 * way to storage. Only the unambiguous ones belong here; مشروع and عمولة are left out
 * because "قبضت مرتب المشروع" is still salary.
 */
const FREELANCE_NOUNS = ["فريلانس", "عمل حر", "سبوبة", "سبوبه", "كلاينت", "freelance"];

function inferCategoryFromEvidence(
  rawCategory: string,
  evidence: string,
): string | undefined {
  const categoryText = `${rawCategory} ${evidence}`;

  if (hasAny(rawCategory, ["التزامات يومية", "Daily Commitments"])) {
    return "فواتير";
  }

  if (
    hasAny(rawCategory, ["خدمات رقمية", "Digital Services"]) &&
    hasAny(categoryText, [
      "نت",
      "انترنت",
      "إنترنت",
      "راوتر",
      "باقة",
      "شحن",
      "رصيد",
      "فودافون",
      "اتصالات",
      "اورنج",
      "أورنج",
      "وي",
    ])
  ) {
    return "فواتير";
  }

  if (
    hasAny(categoryText, [
      "مرتب",
      "راتب",
      "قبضت",
      "استلمت",
      "جالي مرتب",
      "المعاش",
      "بونص",
      "مكافأة",
    ]) &&
    !hasAny(categoryText, ["دفعت", "صرفت", "اشتريت", "قسط"]) &&
    // A direction-governed noun is more specific than the income verb beside it.
    // "قبضت الجمعية" contains قبضت, but it is a gam3eya payout, not salary — and the
    // rule engine has already resolved it to التزامات وجمعيات/قبض جمعية. Without this
    // guard the evidence scan overwrote that correct answer on the way to storage.
    !hasAny(categoryText, GOVERNED_NOUNS) &&
    !hasAny(categoryText, FREELANCE_NOUNS)
  ) {
    return "مرتب";
  }

  if (
    hasAny(categoryText, [
      "فريلانس",
      "عمل حر",
      "سبوبة",
      "عمولة",
      "مشروع",
      "كلاينت",
    ])
  ) {
    return "عمل حر";
  }

  if (hasAny(categoryText, ["أرباح", "فوائد", "كاش باك", "استرجاع", "عائد"])) {
    return "عوائد استثمار";
  }

  return undefined;
}

function inferSubCategory(
  category: string,
  evidence: string,
): string | undefined {
  switch (category) {
    case "فواتير":
      if (hasAny(evidence, ["كهرب", "نور"])) return "كهرباء";
      if (hasAny(evidence, ["مية", "مياه", "مايه"])) return "مياه";
      if (hasAny(evidence, ["غاز"])) return "غاز";
      // Use word-boundary regex to avoid matching "نت" inside "انت/كنت/أنت"
      if (
        hasAny(evidence, ["انترنت", "إنترنت", "راوتر", "واي فاي", "wifi", "باقة"]) ||
        /(?:^|[\s،,؟!])(?:نت|النت)(?=[\s،,؟!]|$)/.test(comparableArabic(evidence))
      )
        return "إنترنت";
      if (hasAny(evidence, ["شحن", "رصيد", "كارت فكة", "كارت شحن"]))
        return "شحن رصيد";
      if (hasAny(evidence, ["تليفون", "هاتف", "ارضي", "أرضي"])) return "تليفون";
      if (
        hasAny(evidence, [
          "قسط",
          "أقساط",
          "اقساط",
          "فاليو",
          "سهولة",
          "دين",
          "سلفة",
          "قرض",
          "تمويل",
        ])
      )
        return "أقساط";
      if (hasAny(evidence, ["تأمين", "تامين"])) return "تأمين";
      if (hasAny(evidence, ["ضريبة", "ضرائب", "ضرايب"])) return "ضرائب";
      return undefined;
    case "تسوق":
      if (
        hasAny(evidence, ["هدوم", "لبس", "ملابس", "تيشيرت", "بنطلون", "جاكيت"])
      )
        return "ملابس";
      if (hasAny(evidence, ["جزمة", "كوتشي", "شوز", "حذاء"])) return "أحذية";
      if (
        hasAny(evidence, [
          "موبايل",
          "لاب",
          "لابتوب",
          "كمبيوتر",
          "سماعة",
          "شاحن",
          "ايفون",
          "تليفون",
        ])
      )
        return "أجهزة إلكترونية";
      if (hasAny(evidence, ["حلاق", "عناية", "ميكاب", "برفان", "عطر", "شامبو"]))
        return "عناية شخصية";
      return undefined;
    case "أكل وشرب":
      if (
        hasAny(evidence, [
          "قهوة",
          "نسكافيه",
          "كافيه",
          "لاتيه",
          "ستاربكس",
          "شاي",
        ])
      )
        return "قهوة وكافيه";
      if (hasAny(evidence, ["دليفري", "تيك اواي", "طلبات"])) return "دليفري";
      if (hasAny(evidence, ["سوبر", "بقال", "خضار", "فاكهة", "بيض", "لبن", "مياه", "ميه", "ازايز", "زجاجات", "كشك", "ماركت"]))
        return "بقالة";
      if (hasAny(evidence, ["لحمة", "فراخ", "سمك", "جمبري", "سوشي"]))
        return "لحوم ودواجن";
      if (hasAny(evidence, ["عيش", "مخبز", "فرن"])) return "مخبوزات";
      if (hasAny(evidence, ["شيبسي", "شوكولاتة", "حلويات", "ايس كريم", "كانز", "بيبسي"]))
        return "سناكس";
      if (hasAny(evidence, ["بيتزا", "شاورما", "برجر", "كريب"])) return "وجبات سريعة";
      if (hasAny(evidence, ["فول", "طعمية", "كبدة", "حواوشي"])) return "مطعم";
      return undefined;
    case "مواصلات":
      if (hasAny(evidence, ["اوبر", "أوبر", "كريم", "ان درايف", "اندرايف", "ديدي"])) return "أوبر/كريم";
      if (hasAny(evidence, ["مترو", "تذكرة", "تيكت"])) return "مترو";
      if (hasAny(evidence, ["اتوبيس", "باص", "ميكروباص", "سويفل", "مشروع"])) return "أتوبيس";
      if (hasAny(evidence, ["تاكسي", "تكسي"])) return "تاكسي";
      if (hasAny(evidence, ["بنزين", "تفويلة"])) return "بنزين";
      if (hasAny(evidence, ["ركنة", "جراج"])) return "ركنة";
      return undefined;
    case "خدمات سيارات":
      if (hasAny(evidence, ["كارتة"])) return "كارتة";
      if (hasAny(evidence, ["ركنة", "سايس", "جراج"])) return "ركنة";
      if (hasAny(evidence, ["زيت", "تغيير زيت"])) return "تغيير زيت";
      if (hasAny(evidence, ["مخالفة"])) return "مخالفة";
      if (hasAny(evidence, ["بطارية"])) return "بطارية";
      if (hasAny(evidence, ["كاوتش", "إطارات", "اطارات"])) return "إطارات";
      return undefined;
    case "سكن":
      if (hasAny(evidence, ["ايجار", "إيجار", "اجار"])) return "إيجار";
      if (hasAny(evidence, ["عفش", "أثاث", "اثاث"])) return "أثاث";
      if (hasAny(evidence, ["سباك", "كهربائي", "نقاش", "نجار", "صيانة"]))
        return "صيانة";
      if (hasAny(evidence, ["منظفات", "مسحوق", "صابون"])) return "منظفات";
      if (hasAny(evidence, ["تلاجة", "غسالة", "بوتاجاز"]))
        return "أجهزة منزلية";
      return undefined;
    case "صحة":
      if (hasAny(evidence, ["دكتور", "كشف", "عيادة", "طبيب"])) return "دكتور";
      if (hasAny(evidence, ["صيدلية", "دوا", "علاج", "روشتة"])) return "صيدلية";
      if (hasAny(evidence, ["تحاليل", "اشعة", "سونار"])) return "تحاليل";
      if (hasAny(evidence, ["أسنان", "اسنان", "ضرس"])) return "أسنان";
      if (hasAny(evidence, ["مستشفى"])) return "مستشفى";
      return undefined;
    case "تعليم":
      if (hasAny(evidence, ["مدرسة", "مدرسه", "يونيفورم"])) return "مدرسة";
      if (hasAny(evidence, ["جامعة", "جامعه", "كلية"])) return "جامعة";
      if (hasAny(evidence, ["كورس", "دورة", "كورسيرا", "يوديمي"]))
        return "كورس";
      if (hasAny(evidence, ["درس", "دروس", "سنتر"])) return "دروس خصوصية";
      if (hasAny(evidence, ["كتاب", "كتب", "مذكرة", "أدوات"])) return "كتب";
      return undefined;
    case "ترفيه":
      if (hasAny(evidence, ["سينما", "فيلم"])) return "سينما";
      if (hasAny(evidence, ["كافيه", "قهوة", "شاي", "عصير"])) return "كافيه";
      if (hasAny(evidence, ["سفر", "مصيف", "رحلة"])) return "سفر";
      if (hasAny(evidence, ["جيم", "رياضة", "رياضه", "بروتين", "كرة", "كورة", "ملعب", "ماتش", "حجز", "بادل", "خماسي", "تراك"])) return "رياضة وجيم";
      if (hasAny(evidence, ["بلايستيشن", "العاب", "ألعاب", "gaming", "بلياردو"]))
        return "ألعاب";
      if (hasAny(evidence, ["خروجة", "فسحة", "تمشية"])) return "خروجة";
      return undefined;
    case "هدايا وصدقات":
      if (hasAny(evidence, ["صدقة", "تبرع", "زكاة", "رسالة", "جامع"]))
        return "صدقة/تبرع";
      if (hasAny(evidence, ["عيدية"])) return "عيدية";
      if (hasAny(evidence, ["فرح", "خطوبة"])) return "فرح/خطوبة";
      if (hasAny(evidence, ["عيد ميلاد"])) return "عيد ميلاد";
      return undefined;
    case "اشتراكات":
      if (hasAny(evidence, ["نتفلكس", "netflix", "شاهد", "برايم", "واتش ات"])) return "نتفلكس";
      if (hasAny(evidence, ["سبوتيفاي", "spotify", "انغامي"])) return "سبوتيفاي";
      if (hasAny(evidence, ["شات جي بي تي", "chatgpt", "gpt"]))
        return "شات جي بي تي";
      if (hasAny(evidence, ["جوجل ai", "google ai", "gemini"]))
        return "جوجل AI";
      if (hasAny(evidence, ["saas", "برنامج", "برمجيات", "يوتيوب"])) return "برمجيات";
      return undefined;
    case "تدخين":
      if (hasAny(evidence, ["سجاير", "سجائر", "علبة"])) return "سجائر";
      if (hasAny(evidence, ["فيب", "بود", "ليكود"])) return "فيب/ليكود";
      if (hasAny(evidence, ["شيشة", "معسل"])) return "شيشة/معسل";
      return undefined;
    case "عمل":
      if (hasAny(evidence, ["استضافة", "hosting"])) return "استضافة";
      if (hasAny(evidence, ["api", "واجهة", "واجهات"])) return "واجهات برمجية";
      if (hasAny(evidence, ["مكتب", "أدوات", "ادوات"])) return "مستلزمات مكتب";
      if (hasAny(evidence, ["مساحة عمل", "coworking"])) return "مساحة عمل";
      return undefined;
    case "خدمات رقمية":
      if (hasAny(evidence, ["vpn"])) return "اشتراك VPN";
      if (hasAny(evidence, ["cloud", "كلاود"])) return "اشتراك Cloud";
      if (hasAny(evidence, ["ai", "ذكاء", "chatgpt", "جيميناي"]))
        return "أدوات AI";
      if (hasAny(evidence, ["دومين", "domain"])) return "دومينات";
      if (hasAny(evidence, ["استضافة", "hosting"])) return "استضافة";
      return undefined;
    case "مرتب":
      if (hasAny(evidence, ["بونص", "مكافأة", "مكافاه"])) return "مكافأة/بونص";
      if (hasAny(evidence, ["اوفر", "أوفر", "اضافي", "إضافي"]))
        return "أوفر تايم";
      if (hasAny(evidence, ["بدل"])) return "بدلات";
      return "مرتب أساسي";
    case "عمل حر":
      if (hasAny(evidence, ["عمولة"])) return "عمولة";
      if (hasAny(evidence, ["سبوبة"])) return "سبوبة";
      return "مشروع";
    case "عوائد استثمار":
      if (hasAny(evidence, ["فوائد", "فايدة"])) return "فوائد";
      if (hasAny(evidence, ["كاش باك", "cashback"])) return "كاش باك";
      if (hasAny(evidence, ["استرجاع", "refund"])) return "استرجاع";
      return "أرباح";
    case "تحويل":
      if (hasAny(evidence, ["atm", "سحب"])) return "سحب ATM";
      if (hasAny(evidence, ["انستاباي", "instapay"])) return "انستاباي";
      if (hasAny(evidence, ["فودافون كاش"])) return "فودافون كاش";
      if (hasAny(evidence, ["ادخار", "تحويش"])) return "ادخار";
      if (hasAny(evidence, ["دين", "سلف", "سلفة", "قرض", "loan"])) return "دين/سلفة";
      if (hasAny(evidence, ["أشخاص"])) return "أشخاص";
      return "تحويل بنكي";
    case "استثمار":
      if (hasAny(evidence, ["دهب", "ذهب", "سبيكة"])) return "ذهب";
      if (hasAny(evidence, ["سهم", "أسهم", "اسهم", "بورصة"])) return "أسهم";
      if (hasAny(evidence, ["شهادة", "شهادات"])) return "شهادات";
      if (hasAny(evidence, ["عقار", "شقة", "ارض", "أرض"])) return "عقارات";
      if (hasAny(evidence, ["كريبتو", "بيتكوين", "crypto"]))
        return "عملات رقمية";
      return undefined;
    default:
      return undefined;
  }
}

export function normalizeCategoryName(
  rawCategory?: string | null,
  evidence = "",
  fallback = "متنوعات",
): string {
  const raw = String(rawCategory || "").trim();
  const inferred = inferCategoryFromEvidence(raw, evidence);
  if (inferred && findCategoryByAnyName(inferred)) return inferred;

  const direct = findCategoryByAnyName(raw);
  if (direct) return direct.name_ar;

  const normalized = comparableArabic(raw);
  const alias = CATEGORY_ALIASES.find(
    ([from]) => comparableArabic(from) === normalized,
  );
  if (alias && findCategoryByAnyName(alias[1])) return alias[1];

  return fallback;
}

export function normalizeSubCategoryName(
  categoryName: string,
  rawSubCategory?: string | null,
  evidence = "",
): string {
  const category = getCategoryByArabicName(categoryName);
  if (!category) return "عام";

  const raw = String(rawSubCategory || "").trim();
  if (["العائلة", "أصدقاء", "موظفين"].includes(categoryName) && raw) {
    return raw;
  }
  const exact = raw ? findSubCategoryByAnyName(category, raw) : undefined;
  if (exact) return exact.name_ar;

  const inferred = inferSubCategory(category.name_ar, `${raw} ${evidence}`);
  if (inferred) {
    const inferredMatch = findSubCategoryByAnyName(category, inferred);
    if (inferredMatch) return inferredMatch.name_ar;
  }

  if (raw && comparableArabic(raw) === comparableArabic("أخرى")) {
    return DEFAULT_SUBCATEGORY_BY_CATEGORY.get(category.name_ar) || "عام";
  }

  return DEFAULT_SUBCATEGORY_BY_CATEGORY.get(category.name_ar) || "عام";
}

export function normalizeTransactionTaxonomy<
  T extends {
    category?: string;
    subCategory?: string | null;
    type?: string;
    description?: string | null;
  },
>(
  item: T,
  evidence = "",
): T & { category: string; subCategory: string; type: TransactionType } {
  const combinedEvidence = `${item.description || ""} ${item.subCategory || ""} ${evidence}`;
  const category = normalizeCategoryName(item.category, combinedEvidence);
  const subCategory = normalizeSubCategoryName(
    category,
    item.subCategory,
    combinedEvidence,
  );

  // Preserve explicit type if valid, otherwise fall back to category default type
  const type =
    item.type === "income" ||
    item.type === "expense" ||
    item.type === "transfer" ||
    item.type === "investment"
      ? (item.type as TransactionType)
      : (getCategoryType(category) as TransactionType);

  return {
    ...item,
    category,
    subCategory,
    type,
  };
}

export function normalizeTransactionTaxonomyList<
  T extends {
    category?: string;
    subCategory?: string | null;
    type?: string;
    description?: string | null;
  },
>(
  items: T[],
  evidence = "",
): Array<T & { category: string; subCategory: string; type: TransactionType }> {
  return items.map((item) => normalizeTransactionTaxonomy(item, evidence));
}

// ─── Unified Taxonomy Bridge ───
// Internal canonical = English `id` from CATEGORIES
// Display = Arabic `name_ar` from CATEGORIES
// This bridge ensures no mixing of "food" and "أكل وشرب" in storage and analysis.

const CATEGORY_ID_MAP = new Map<string, MainCategory>(
  CATEGORIES.map((c) => [c.id, c]),
);

const CATEGORY_BY_NORMALIZED_AR = new Map<string, MainCategory>(
  CATEGORIES.map((c) => [comparableArabic(c.name_ar), c]),
);

const CATEGORY_BY_NORMALIZED_EN = new Map<string, MainCategory>(
  CATEGORIES.map((c) => [c.name.toLowerCase(), c]),
);

export const EXTRA_ALIASES_TO_ID: Array<[string, string]> = [
  ["كارفور", "food"],
  ["خضار", "food"],
  ["خضه", "food"],
  ["فاكهه", "food"],
  ["فاكهة", "food"],
  ["لحمه", "food"],
  ["لحمة", "food"],
  ["فراخ", "food"],
  ["دليفري", "food"],
  ["طلبات", "food"],
  ["talabat", "food"],
  ["سوبرماركت", "food"],
  ["سوبر ماركت", "food"],
  ["ماركت", "food"],
  ["هايبر", "food"],
  ["جروسري", "food"],
  ["groceries", "food"],
  ["restaurant", "food"],
  ["مطعم", "food"],
  ["مطاعم", "food"],
  ["قهوة", "food"],
  ["قهوه", "food"],
  ["كافيه", "food"],
  ["كافيهات", "food"],
  ["بنزين", "transport"],
  ["تفويلة", "transport"],
  ["اوبر", "transport"],
  ["كريم", "transport"],
  ["مترو", "transport"],
  ["تاكسي", "transport"],
  ["اتوبيس", "transport"],
  ["ميكروباص", "transport"],
  ["uber", "transport"],
  ["لبس", "shopping"],
  ["هدوم", "shopping"],
  ["ملابس", "shopping"],
  ["جزمة", "shopping"],
  ["كوتشي", "shopping"],
  ["شوز", "shopping"],
  ["عنايه شخصيه", "shopping"],
  ["عطر", "shopping"],
  ["دكتور", "health"],
  ["صيدليه", "health"],
  ["صيدلية", "health"],
  ["دوا", "health"],
  ["دواء", "health"],
  ["علاج", "health"],
  ["تحاليل", "health"],
  ["كهربا", "bills"],
  ["كهرباء", "bills"],
  ["مياه", "bills"],
  ["مايه", "bills"],
  ["غاز", "bills"],
  ["نت", "bills"],
  ["انترنت", "bills"],
  ["إنترنت", "bills"],
  ["شحن", "bills"],
  ["رصيد", "bills"],
  ["فاتوره", "bills"],
  ["فاتورة", "bills"],
  ["قسط", "bills"],
  ["اقساط", "bills"],
  ["أقساط", "bills"],
  ["مرتب", "salary"],
  ["راتب", "salary"],
  ["salary", "salary"],
  ["قبض", "salary"],
  ["دخل", "salary"],
  ["بونص", "salary"],
  ["مكافاه", "salary"],
  ["مكافأة", "salary"],
  ["سبوبه", "freelance"],
  ["فريلانس", "freelance"],
  ["عموله", "freelance"],
  ["كاش باك", "investment_income"],
  ["كاشباك", "investment_income"],
  ["استرجاع", "investment_income"],
  ["ارباح", "investment_income"],
  ["أرباح", "investment_income"],
  ["فوائد", "investment_income"],
  ["atm", "transfer"],
  ["سحب", "transfer"],
  ["انستاباي", "transfer"],
  ["instapay", "transfer"],
  ["فودافون كاش", "transfer"],
  ["دين", "transfer"],
  ["سلفه", "transfer"],
  ["سلفة", "transfer"],
  ["قرض", "transfer"],
  ["ادخار", "transfer"],
  ["تحويش", "transfer"],
  ["ذهب", "investment"],
  ["دهب", "investment"],
  ["سهم", "investment"],
  ["أسهم", "investment"],
  ["اسهم", "investment"],
  ["بورصه", "investment"],
  ["بورصة", "investment"],
  ["شهادات", "investment"],
  ["شهاده", "investment"],
  ["عقار", "investment"],
  ["شقه", "investment"],
  ["شقة", "investment"],
  ["ايجار", "home"],
  ["إيجار", "home"],
  ["عفش", "home"],
  ["أثاث", "home"],
  ["اثاث", "home"],
  ["سباك", "home"],
  ["كهربائي", "home"],
  ["نقاش", "home"],
  ["منظفات", "home"],
  ["سينما", "entertainment"],
  // NOTE: "كافيهات" is already mapped to `food` above. It used to be re-mapped here to
  // "outings", an id that no longer exists in CATEGORIES (خروجات was merged into ترفيه),
  // and because buildAliasMap() writes in array order that later entry silently won.
  // Every كافيهات row therefore canonicalized to a dangling id that arabicDisplayName()
  // rendered as the literal string "outings" in Arabic UI.
  ["بلايستيشن", "entertainment"],
  ["جيم", "entertainment"],
  ["رياضه", "entertainment"],
  ["رياضة", "entertainment"],
  ["نتفلكس", "subscriptions"],
  ["netflix", "subscriptions"],
  ["سبوتيفاي", "subscriptions"],
  ["spotify", "subscriptions"],
  ["chatgpt", "subscriptions"],
  ["شات جي بي تي", "subscriptions"],
  ["سجاير", "smoking"],
  ["سجائر", "smoking"],
  ["علبه", "smoking"],
  ["علبة", "smoking"],
  ["فيب", "smoking"],
  ["ليكود", "smoking"],
  ["شيشه", "smoking"],
  ["شيشة", "smoking"],
  ["معسل", "smoking"],
  ["صدقه", "gifts"],
  ["صدقة", "gifts"],
  ["تبرع", "gifts"],
  ["اتبرعت", "gifts"],
  ["زكاه", "gifts"],
  ["زكاة", "gifts"],
  ["عيديه", "gifts"],
  ["عيدية", "gifts"],
  ["فرح", "gifts"],
  ["خطوبه", "gifts"],
  ["خطوبة", "gifts"],
  ["كارتة", "car_services"],
  ["ركنه", "car_services"],
  ["ركنة", "car_services"],
  ["زيت", "car_services"],
  ["مخالفه", "car_services"],
  ["مخالفة", "car_services"],
  ["بطاريه", "car_services"],
  ["بطارية", "car_services"],
  ["كاوتش", "car_services"],
  ["إطارات", "car_services"],
  ["اطارات", "car_services"],
  [" vpn", "digital_services"],
  ["vpn", "digital_services"],
  ["cloud", "digital_services"],
  ["كلاود", "digital_services"],
  ["دومين", "digital_services"],
  ["domain", "digital_services"],
  // "hosting" was declared twice; buildAliasMap() writes in array order, so the later
  // `work` entry silently won. Both categories happen to declare an استضافة
  // subcategory, but hosting belongs with domains and cloud under digital_services.
  ["hosting", "digital_services"],
  ["استضافه", "work"],
  ["استضافة", "work"],
  ["api", "work"],
  ["واجهه", "work"],
  ["واجهات", "work"],
  ["مكتب", "work"],
  ["ادوات", "work"],
  ["أدوات", "work"],
  ["مدرسه", "education"],
  ["مدرسة", "education"],
  ["جامعه", "education"],
  ["جامعة", "education"],
  ["كورس", "education"],
  ["كورسات", "education"],
  ["كتاب", "education"],
  ["كتب", "education"],
  ["دروس", "education"],
  ["جمعيه", "liabilities_and_gam3eyat"],
  ["جمعية", "liabilities_and_gam3eyat"],
  ["فاليو", "liabilities_and_gam3eyat"],
  ["تمويل", "liabilities_and_gam3eyat"],

  // ── Migrated from taxonomy-ssot.ts ──────────────────────────────────────────
  // taxonomy-ssot.ts carried a richer Egyptian alias set than this table but was
  // consumed by exactly one module, and five of its ids (housing, personal_care,
  // charity, debt_payment, other) do not exist here — so those aliases resolved to
  // nothing and AI-Center questions about سكن / تبرعات / سداد ديون matched no rows.
  // The aliases are migrated here so the whole system gains them and the ssot can
  // become a derived view.
  //
  // Only aliases that resolved to NOTHING before are added: where the ssot and this
  // table disagreed the existing mapping wins, because it is generally the better one
  // (ركنة is car_services, netflix is subscriptions, جيم is entertainment).
  //
  // Deliberately NOT migrated, because canonicalCategoryId() falls back to an
  // unanchored substring scan over aliases of length >= 3, so a common word here
  // hijacks any sentence containing it: تاني · رسالة · شعر · مهر (inside مهرجان) ·
  // gym · شراء · جهاز · مشتريات · اشتراك.
  ["شرب", "food"],
  ["لحوم", "food"],
  ["جزار", "food"],
  ["مخبز", "food"],
  ["فرن", "food"],
  ["kfc", "food"],
  ["mcdonalds", "food"],
  ["ماكدونالدز", "food"],
  ["كوك دور", "food"],
  ["قهوجي", "food"],

  ["careem", "transport"],
  ["قطار", "transport"],
  ["قطارات", "transport"],
  ["سولار", "transport"],
  ["ميكانيكي", "transport"],
  ["سايس", "transport"],
  ["توك توك", "transport"],
  ["سويفل", "transport"],
  ["swvl", "transport"],

  ["ميه", "bills"],
  ["ارضي", "bills"],
  ["موبايل", "bills"],
  ["وي", "bills"],
  ["اورنج", "bills"],
  ["فودافون", "bills"],
  ["اتصالات", "bills"],
  ["نتفليكس", "subscriptions"],

  ["بواب", "home"],
  ["حارس", "home"],

  ["شوبنج", "shopping"],
  ["قميص", "shopping"],
  ["بنطلون", "shopping"],
  ["فستان", "shopping"],
  ["حذاء", "shopping"],
  ["امازون", "shopping"],
  ["amazon", "shopping"],
  ["جوميا", "shopping"],
  ["نون", "shopping"],
  ["noon", "shopping"],
  ["نظارة", "shopping"],
  ["ساعة", "shopping"],
  ["حلاق", "shopping"],
  ["حلاقة", "shopping"],
  ["دقن", "shopping"],
  ["كوافير", "shopping"],
  ["بيوتي سنتر", "shopping"],
  ["برفيوم", "shopping"],
  ["مكياج", "shopping"],
  ["مناديل", "shopping"],
  ["شامبو", "shopping"],
  ["معجون سنان", "shopping"],

  ["طبيب", "health"],
  ["كشف", "health"],
  ["عيادة", "health"],
  ["اشعة", "health"],
  ["أشعة", "health"],
  ["روشتة", "health"],

  ["كلية", "education"],
  ["كليه", "education"],
  ["كشكول", "education"],
  ["دبلومة", "education"],

  ["خروج", "entertainment"],
  ["فسحة", "entertainment"],
  ["فسحه", "entertainment"],
  ["مسرح", "entertainment"],
  ["ملاهي", "entertainment"],
  ["مصيف", "entertainment"],
  ["بحر", "entertainment"],
  ["اوتيل", "entertainment"],
  ["فندق", "entertainment"],
  ["ماتش", "entertainment"],

  ["هدية", "gifts"],
  ["هديه", "gifts"],
  ["سبوع", "gifts"],
  ["شبكة", "gifts"],
  ["جامع", "gifts"],
  ["كنيسة", "gifts"],
  ["اورمان", "gifts"],
  ["٥٧٣٥٧", "gifts"],
  ["مساعدة محتاج", "gifts"],

  ["سبائك", "investment"],
  ["ثاندر", "investment"],
  ["thndr", "investment"],
  ["ربح", "investment_income"],
  ["مبيعات", "freelance"],
  ["حوالة واردة", "salary"],

  ["ديون", "liabilities_and_gam3eyat"],
  ["سداد", "liabilities_and_gam3eyat"],
  ["تسديد", "liabilities_and_gam3eyat"],
  ["ارجاع فلوس", "liabilities_and_gam3eyat"],

  ["غير مصنف", "miscellaneous"],
  ["نثرية", "miscellaneous"],
  ["نثريات", "miscellaneous"],

  // ── Collision repairs (must stay last: buildAliasMap applies this table AFTER the
  //    auto-generated subcategory names, so these entries win) ──────────────────
  //
  // "أكل" is the single most common Egyptian food word, but `pets` declares a
  // subcategory literally named "أكل" (pet food), so the auto-generated alias sent
  // every "الاكل" query to حيوانات أليفة.
  ["أكل", "food"],
  ["اكل", "food"],
  // "طعام" was worse: it is not a direct alias, so canonicalCategoryId fell through to
  // its unanchored substring scan, where "طعام" contains "عام" — the generic
  // subcategory name every category declares — and resolved to whichever category
  // happened to own the last "عام" entry.
  ["طعام", "food"],
];

const ALIAS_TO_ID = new Map<string, string>();

function buildAliasMap(): void {
  for (const cat of CATEGORIES) {
    ALIAS_TO_ID.set(comparableArabic(cat.id), cat.id);
    ALIAS_TO_ID.set(comparableArabic(cat.name), cat.id);
    ALIAS_TO_ID.set(comparableArabic(cat.name_ar), cat.id);
    for (const sub of cat.subcategories) {
      ALIAS_TO_ID.set(comparableArabic(sub.id), cat.id);
      ALIAS_TO_ID.set(comparableArabic(sub.name), cat.id);
      ALIAS_TO_ID.set(comparableArabic(sub.name_ar), cat.id);
    }
  }
  for (const [alias, id] of EXTRA_ALIASES_TO_ID) {
    ALIAS_TO_ID.set(comparableArabic(alias), id);
  }
  for (const [from, to] of CATEGORY_ALIASES) {
    const targetCat = findCategoryByAnyName(to);
    if (targetCat) {
      ALIAS_TO_ID.set(comparableArabic(from), targetCat.id);
    }
  }
}

buildAliasMap();

const VIRTUAL_AGGREGATE_IDS: Record<string, { id: string; arabicName: string; type: string }> = {
  income: { id: "income", arabicName: "الدخل", type: "income" },
  saving: { id: "saving", arabicName: "الادخار", type: "transfer" },
  uncategorized: { id: "uncategorized", arabicName: "غير مصنف", type: "expense" },
};

/**
 * Exact-alias resolution only, for callers that must not guess.
 *
 * `canonicalCategoryId` deliberately falls through to an unanchored substring scan so it
 * can pull a category out of free-form user text. That is the right behaviour there and
 * the wrong behaviour when the input is a MODEL answering an enum: "business" contains
 * "bus", so an invalid category was silently "repaired" into مواصلات and written down as
 * if the model had said it. Returns null instead of a guess.
 */
export function exactCategoryId(input: string | null | undefined): string | null {
  if (!input) return null;
  const normalized = comparableArabic(input);
  if (!normalized) return null;
  return ALIAS_TO_ID.get(normalized) ?? findCategoryByAnyName(input)?.id ?? null;
}

export function canonicalCategoryId(input: string | null | undefined): string {
  if (!input) return "uncategorized";
  const normalized = comparableArabic(input);
  if (!normalized) return "uncategorized";

  const direct = ALIAS_TO_ID.get(normalized);
  if (direct) return direct;

  for (const [alias, id] of ALIAS_TO_ID) {
    if (normalized.includes(alias) && alias.length >= 3) {
      return id;
    }
  }

  const cat = findCategoryByAnyName(input);
  if (cat) return cat.id;

  return "uncategorized";
}

export function arabicDisplayName(id: string | null | undefined): string {
  if (!id) return "غير مصنف";
  if (VIRTUAL_AGGREGATE_IDS[id]) return VIRTUAL_AGGREGATE_IDS[id].arabicName;
  const cat = CATEGORY_ID_MAP.get(id);
  return cat?.name_ar ?? (id || "غير مصنف");
}

export function getCategoryAliasesById(id: string): string[] {
  if (VIRTUAL_AGGREGATE_IDS[id]) {
    const aliases: string[] = [id];
    if (id === "income") aliases.push("دخل", "مرتب", "راتب", "salary", "قبض");
    if (id === "saving") aliases.push("ادخار", "تحويش", "جمعية", "جمعيه");
    if (id === "uncategorized") aliases.push("غير مصنف", "أخرى", "متنوعات");
    return [...new Set(aliases)];
  }
  const cat = CATEGORY_ID_MAP.get(id);
  if (!cat) return [id];
  const aliases = [id, cat.name, cat.name_ar];
  for (const [alias, targetId] of ALIAS_TO_ID) {
    if (targetId === id) {
      const originalAlias = [...EXTRA_ALIASES_TO_ID].find(([a]) => comparableArabic(a) === alias)?.[0];
      if (originalAlias) aliases.push(originalAlias);
    }
  }
  return [...new Set(aliases)];
}

export function categoryTypeOf(id: string | null | undefined): string {
  if (!id) return "expense";
  if (VIRTUAL_AGGREGATE_IDS[id]) return VIRTUAL_AGGREGATE_IDS[id].type;
  const cat = CATEGORY_ID_MAP.get(id);
  return cat?.type ?? "expense";
}

export function normalizeCategoryFromUserText(text: string): string {
  return canonicalCategoryId(text);
}

/**
 * The ONLY function permitted to produce a value for `expenses.category` or
 * `user_budgets.category`.
 *
 * `expenses.category` is a varchar holding the ARABIC `name_ar`, and historical rows
 * already hold it. Readers compare it by exact string equality in the places users
 * actually look — budget-router.ts matches budgets to spend, expense-router filters
 * and the person-category set, export-router writes it straight into the export file —
 * so a row written with an English canonical id is invisible to all of them.
 *
 * Accepts an English id, an Arabic name_ar, an alias, or free text; always returns a
 * real CATEGORIES[].name_ar. Virtual aggregate ids are report buckets, never storage,
 * so they are resolved to the concrete category that represents them.
 */
export function storageCategoryName(input: string | null | undefined): string {
  const id = canonicalCategoryId(input);
  if (VIRTUAL_AGGREGATE_IDS[id]) {
    if (id === "saving") return "تحويل";
    if (id === "income") return "مرتب";
    return "متنوعات";
  }
  return CATEGORY_ID_MAP.get(id)?.name_ar ?? "متنوعات";
}

export function normalizeStoredCategory(stored: string | null | undefined): string {
  if (!stored) return "uncategorized";
  const id = canonicalCategoryId(stored);
  return id;
}

export function taxonomyVersion(): string {
  return "tax_v2_2026_06";
}
