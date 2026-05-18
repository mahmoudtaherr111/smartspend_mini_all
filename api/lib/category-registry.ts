/**
 * SmartSpend Category Registry
 * Central registry for all financial categories and subcategories
 */

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
    id: "food", name: "Food & Drinks", name_ar: "أكل وشرب",
    icon: "🍔", color: "#f97316", type: "expense",
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
    id: "transport", name: "Transport", name_ar: "مواصلات",
    icon: "🚗", color: "#3b82f6", type: "expense",
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
    id: "bills", name: "Bills", name_ar: "فواتير",
    icon: "📄", color: "#ef4444", type: "expense",
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
    id: "home", name: "Home", name_ar: "سكن",
    icon: "🏠", color: "#8b5cf6", type: "expense",
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
    id: "shopping", name: "Shopping", name_ar: "تسوق",
    icon: "🛍️", color: "#ec4899", type: "expense",
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
    id: "health", name: "Health", name_ar: "صحة",
    icon: "🏥", color: "#10b981", type: "expense",
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
    id: "education", name: "Education", name_ar: "تعليم",
    icon: "📚", color: "#6366f1", type: "expense",
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
    id: "entertainment", name: "Entertainment", name_ar: "ترفيه",
    icon: "🎮", color: "#f59e0b", type: "expense",
    subcategories: [
      { id: "cinema", name: "Cinema", name_ar: "سينما" },
      { id: "cafe", name: "Cafe", name_ar: "كافيه" },
      { id: "travel", name: "Travel", name_ar: "سفر" },
      { id: "sports", name: "Sports & Gym", name_ar: "رياضة وجيم" },
      { id: "gaming", name: "Gaming", name_ar: "ألعاب" },
      { id: "streaming", name: "Streaming", name_ar: "منصات مشاهدة" },
      { id: "outing", name: "Outing", name_ar: "خروجة" },
      { id: "general_entertainment", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "subscriptions", name: "Subscriptions", name_ar: "اشتراكات",
    icon: "📱", color: "#14b8a6", type: "expense",
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
    id: "smoking", name: "Smoking", name_ar: "تدخين",
    icon: "🚬", color: "#6b7280", type: "expense",
    subcategories: [
      { id: "cigarettes", name: "Cigarettes", name_ar: "سجائر" },
      { id: "vape", name: "Vape", name_ar: "فيب/ليكود" },
      { id: "shisha", name: "Shisha", name_ar: "شيشة/معسل" },
      { id: "smoking_general", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "gifts", name: "Gifts & Charity", name_ar: "هدايا وصدقات",
    icon: "🎁", color: "#f43f5e", type: "expense",
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
    id: "pets", name: "Pets", name_ar: "حيوانات أليفة",
    icon: "🐾", color: "#a855f7", type: "expense",
    subcategories: [
      { id: "pet_food", name: "Pet Food", name_ar: "أكل" },
      { id: "vet", name: "Vet", name_ar: "طبيب بيطري" },
      { id: "pet_accessories", name: "Accessories", name_ar: "مستلزمات" },
    ],
  },
  {
    id: "work", name: "Work", name_ar: "عمل",
    icon: "💼", color: "#64748b", type: "expense",
    subcategories: [
      { id: "office_supplies", name: "Office Supplies", name_ar: "مستلزمات مكتب" },
      { id: "hosting", name: "Hosting", name_ar: "استضافة" },
      { id: "apis", name: "APIs", name_ar: "واجهات برمجية" },
      { id: "coworking", name: "Coworking", name_ar: "مساحة عمل" },
      { id: "general_work", name: "General", name_ar: "عام" },
    ],
  },
  // ─── Income Categories ───
  {
    id: "salary", name: "Salary", name_ar: "مرتب",
    icon: "💵", color: "#22c55e", type: "income",
    subcategories: [
      { id: "main_salary", name: "Main Salary", name_ar: "مرتب أساسي" },
      { id: "overtime", name: "Overtime", name_ar: "أوفر تايم" },
      { id: "bonus", name: "Bonus", name_ar: "مكافأة/بونص" },
      { id: "allowance", name: "Allowance", name_ar: "بدلات" },
    ],
  },
  {
    id: "freelance", name: "Freelance", name_ar: "عمل حر",
    icon: "💻", color: "#06b6d4", type: "income",
    subcategories: [
      { id: "project", name: "Project", name_ar: "مشروع" },
      { id: "commission", name: "Commission", name_ar: "عمولة" },
      { id: "side_hustle", name: "Side Hustle", name_ar: "سبوبة" },
    ],
  },
  {
    id: "investment_income", name: "Investment Income", name_ar: "عوائد استثمار",
    icon: "📈", color: "#84cc16", type: "income",
    subcategories: [
      { id: "dividends", name: "Dividends", name_ar: "أرباح" },
      { id: "interest", name: "Interest", name_ar: "فوائد" },
      { id: "cashback", name: "Cashback", name_ar: "كاش باك" },
      { id: "refund", name: "Refund", name_ar: "استرجاع" },
    ],
  },
  // ─── Financial / Transfer Categories ───
  {
    id: "transfer", name: "Transfer", name_ar: "تحويل",
    icon: "🏧", color: "#0ea5e9", type: "transfer",
    subcategories: [
      { id: "atm", name: "ATM Withdrawal", name_ar: "سحب ATM" },
      { id: "bank_transfer", name: "Bank Transfer", name_ar: "تحويل بنكي" },
      { id: "instapay", name: "Instapay", name_ar: "انستاباي" },
      { id: "vodafone_cash", name: "Vodafone Cash", name_ar: "فودافون كاش" },
      { id: "savings", name: "Savings", name_ar: "ادخار" },
      { id: "debt", name: "Debt/Loan", name_ar: "دين/سلفة" },
    ],
  },
  {
    id: "investment", name: "Investment", name_ar: "استثمار",
    icon: "📊", color: "#eab308", type: "investment",
    subcategories: [
      { id: "gold", name: "Gold", name_ar: "ذهب" },
      { id: "stocks", name: "Stocks", name_ar: "أسهم" },
      { id: "certificates", name: "Certificates", name_ar: "شهادات" },
      { id: "real_estate", name: "Real Estate", name_ar: "عقارات" },
      { id: "crypto", name: "Crypto", name_ar: "عملات رقمية" },
    ],
  },
  {
    id: "daily_commitments", name: "Daily Commitments", name_ar: "التزامات يومية",
    icon: "🧾", color: "#ef4444", type: "expense",
    subcategories: [
      { id: "electricity_daily", name: "Electricity", name_ar: "كهرباء" },
      { id: "water_daily", name: "Water", name_ar: "مياه" },
      { id: "internet_bundle", name: "Internet Bundle", name_ar: "باقات إنترنت" },
      { id: "mobile_recharge_new", name: "Mobile Recharge", name_ar: "شحن موبايل" },
      { id: "daily_general", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "digital_services", name: "Digital Services", name_ar: "خدمات رقمية",
    icon: "💻", color: "#0ea5e9", type: "expense",
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
    id: "car_services", name: "Car Services", name_ar: "خدمات سيارات",
    icon: "🚗", color: "#3b82f6", type: "expense",
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
  {
    id: "outings", name: "Outings", name_ar: "خروجات",
    icon: "🎉", color: "#f59e0b", type: "expense",
    subcategories: [
      { id: "cinema_new", name: "Cinema", name_ar: "سينما" },
      { id: "playstation", name: "PlayStation", name_ar: "PlayStation" },
      { id: "board_games", name: "Board Games Cafe", name_ar: "كافيه بورد جيم" },
      { id: "friends_outing", name: "Friends Outing", name_ar: "خروجة صحاب" },
      { id: "corniche", name: "Corniche", name_ar: "كورنيش" },
      { id: "outing_general", name: "General", name_ar: "فسحة" },
    ],
  },
  {
    id: "miscellaneous", name: "Miscellaneous", name_ar: "متنوعات",
    icon: "📦", color: "#94a3b8", type: "expense",
    subcategories: [
      { id: "general", name: "General", name_ar: "عام" },
    ],
  },
];

// ─── Helper functions ───

/** Get category by Arabic name */
export function getCategoryByArabicName(name_ar: string): MainCategory | undefined {
  return CATEGORIES.find(c => c.name_ar === name_ar);
}

/** Get all category Arabic names */
export function getAllCategoryNames(): string[] {
  return CATEGORIES.map(c => c.name_ar);
}

/** Get subcategories for a category */
export function getSubcategoriesFor(categoryNameAr: string): SubCategory[] {
  return CATEGORIES.find(c => c.name_ar === categoryNameAr)?.subcategories || [];
}

/** Get category type */
export function getCategoryType(categoryNameAr: string): string {
  return CATEGORIES.find(c => c.name_ar === categoryNameAr)?.type || "expense";
}

/** Get all expense category names */
export function getExpenseCategories(): string[] {
  return CATEGORIES.filter(c => c.type === "expense").map(c => c.name_ar);
}

/** Get all income category names */
export function getIncomeCategories(): string[] {
  return CATEGORIES.filter(c => c.type === "income").map(c => c.name_ar);
}
