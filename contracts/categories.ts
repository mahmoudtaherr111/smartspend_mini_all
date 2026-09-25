/**
 * The category taxonomy: one list for the server, the web app and the data migration.
 *
 * A category answers "what was the money for". Who it went to is the contact, and how it
 * was paid is the wallet — both have their own columns on `expenses`. The person
 * categories (العائلة، أصدقاء، موظفين) remain for money given to someone without a
 * stated purpose ("اديت ماما 1000").
 *
 * This list replaced the one in `api/lib/category-registry.ts` and its hand-kept copy in
 * `src/lib/financial-taxonomy.ts`. The old names still arriving from older clients, model
 * replies or user dictionaries are translated by `LEGACY_TAXONOMY` below, which the
 * `taxonomy-migration` job (`api/jobs/taxonomy-migration-job.ts`) also applies to stored
 * rows. Why: docs/decisions/0008-money-movements-and-taxonomy.md.
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
  // ─── Spending ───
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
      { id: "uber", name: "Ride Apps", name_ar: "أوبر/كريم" },
      { id: "metro", name: "Metro", name_ar: "مترو" },
      { id: "bus", name: "Bus", name_ar: "أتوبيس" },
      { id: "microbus", name: "Microbus", name_ar: "ميكروباص" },
      { id: "train", name: "Train", name_ar: "قطر" },
      { id: "taxi", name: "Taxi", name_ar: "تاكسي" },
      { id: "toktok", name: "TokTok", name_ar: "توكتوك" },
      { id: "fuel", name: "Fuel", name_ar: "بنزين" },
      { id: "maintenance", name: "Car Maintenance", name_ar: "صيانة عربية" },
      { id: "parking", name: "Parking", name_ar: "ركنة" },
      { id: "toll", name: "Toll", name_ar: "كارتة" },
      { id: "flight", name: "Flight", name_ar: "طيران" },
      { id: "general_transport", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "bills",
    name: "Bills",
    name_ar: "فواتير",
    icon: "💡",
    color: "#eab308",
    type: "expense",
    subcategories: [
      { id: "electricity", name: "Electricity", name_ar: "كهرباء" },
      { id: "water", name: "Water", name_ar: "مياه" },
      { id: "gas", name: "Gas", name_ar: "غاز" },
      { id: "internet", name: "Internet", name_ar: "إنترنت" },
      { id: "phone", name: "Phone", name_ar: "تليفون" },
      { id: "mobile_recharge", name: "Mobile Recharge", name_ar: "شحن رصيد" },
      { id: "insurance", name: "Insurance", name_ar: "تأمين" },
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
      { id: "home_help", name: "Home Help", name_ar: "خدمات البيت" },
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
      { id: "shoes", name: "Shoes", name_ar: "أحذية" },
      { id: "electronics", name: "Electronics", name_ar: "أجهزة إلكترونية" },
      { id: "accessories", name: "Accessories", name_ar: "إكسسوارات" },
      { id: "general_shopping", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "personal_care",
    name: "Personal Care",
    name_ar: "عناية شخصية",
    icon: "💈",
    color: "#d946ef",
    type: "expense",
    subcategories: [
      { id: "barber_salon", name: "Barber & Salon", name_ar: "حلاق وكوافير" },
      { id: "cosmetics", name: "Care Products", name_ar: "مستحضرات وعناية" },
      { id: "general_personal_care", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "health",
    name: "Health",
    name_ar: "صحة",
    icon: "💊",
    color: "#ef4444",
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
    id: "kids",
    name: "Kids",
    name_ar: "أطفال",
    icon: "🍼",
    color: "#fb7185",
    type: "expense",
    subcategories: [
      { id: "nursery", name: "Nursery", name_ar: "حضانة" },
      { id: "baby_supplies", name: "Diapers & Formula", name_ar: "بامبرز ولبن أطفال" },
      { id: "kids_clothes_toys", name: "Clothes & Toys", name_ar: "هدوم ولعب" },
      { id: "pocket_money", name: "Pocket Money", name_ar: "مصروف العيال" },
      { id: "general_kids", name: "General", name_ar: "عام" },
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
      { id: "outing", name: "Outing", name_ar: "خروجة" },
      { id: "cinema", name: "Cinema", name_ar: "سينما" },
      { id: "gaming", name: "Gaming", name_ar: "ألعاب" },
      { id: "sports", name: "Sports & Gym", name_ar: "رياضة وجيم" },
      { id: "travel", name: "Travel", name_ar: "سفر" },
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
      { id: "streaming", name: "Streaming", name_ar: "منصات مشاهدة" },
      { id: "music", name: "Music", name_ar: "موسيقى" },
      { id: "ai_tools", name: "AI Tools", name_ar: "أدوات AI" },
      { id: "software", name: "Software & Cloud", name_ar: "برمجيات" },
      { id: "general_subscriptions", name: "General", name_ar: "عام" },
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
      { id: "general_smoking", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "gifts",
    name: "Gifts, Occasions & Charity",
    name_ar: "هدايا وصدقات",
    icon: "🎁",
    color: "#f43f5e",
    type: "expense",
    subcategories: [
      { id: "birthday", name: "Birthday", name_ar: "عيد ميلاد" },
      { id: "wedding", name: "Wedding", name_ar: "فرح/خطوبة" },
      { id: "social_duty", name: "Social Duty", name_ar: "نقطة وواجب" },
      { id: "eidiya", name: "Eidiya", name_ar: "عيدية" },
      { id: "charity", name: "Charity", name_ar: "صدقة/تبرع" },
      { id: "zakat", name: "Zakat", name_ar: "زكاة" },
      { id: "udhiya", name: "Eid Sacrifice", name_ar: "أضحية" },
      { id: "general_gifts", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "installments",
    name: "Installments & Interest",
    name_ar: "أقساط وفوايد",
    icon: "🧾",
    color: "#7c3aed",
    type: "expense",
    subcategories: [
      { id: "installment", name: "Installments", name_ar: "أقساط" },
      { id: "loan_interest", name: "Loan Interest", name_ar: "فوايد قروض" },
      { id: "general_installments", name: "General", name_ar: "عام" },
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
  {
    id: "work",
    name: "Work Expenses",
    name_ar: "عمل",
    icon: "💼",
    color: "#64748b",
    type: "expense",
    subcategories: [
      { id: "office_supplies", name: "Office Supplies", name_ar: "مستلزمات مكتب" },
      { id: "hosting", name: "Hosting & Domains", name_ar: "استضافة" },
      { id: "apis", name: "APIs", name_ar: "واجهات برمجية" },
      { id: "coworking", name: "Coworking", name_ar: "مساحة عمل" },
      { id: "general_work", name: "General", name_ar: "عام" },
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
      { id: "pet_supplies", name: "Supplies", name_ar: "مستلزمات" },
    ],
  },
  // ─── Money given to people, when no purpose is stated ───
  {
    id: "family_transactions",
    name: "Family",
    name_ar: "العائلة",
    icon: "👨‍👩‍👧‍👦",
    color: "#e11d48",
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
    name: "Friends",
    name_ar: "أصدقاء",
    icon: "🤝",
    color: "#10b981",
    type: "expense",
    subcategories: [{ id: "general_friends", name: "General", name_ar: "عام" }],
  },
  {
    id: "employees_transactions",
    name: "Employees",
    name_ar: "موظفين",
    icon: "👷",
    color: "#475569",
    type: "expense",
    subcategories: [
      { id: "general_employees", name: "General", name_ar: "عام" },
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
      { id: "tips", name: "Tips", name_ar: "بقشيش" },
    ],
  },
  // ─── Income ───
  {
    id: "salary",
    name: "Salary",
    name_ar: "مرتب",
    icon: "💵",
    color: "#22c55e",
    type: "income",
    subcategories: [
      { id: "base_salary", name: "Main Salary", name_ar: "مرتب أساسي" },
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
    ],
  },
  {
    id: "gifts_received",
    name: "Gifts Received",
    name_ar: "هدايا وعيديات",
    icon: "🧧",
    color: "#16a34a",
    type: "income",
    subcategories: [
      { id: "eidiya_received", name: "Eidiya", name_ar: "عيدية" },
      { id: "cash_gift", name: "Cash Gift", name_ar: "هدية فلوس" },
      { id: "nokta_received", name: "Wedding Money", name_ar: "نقطة" },
      { id: "general_gifts_received", name: "General", name_ar: "عام" },
    ],
  },
  {
    id: "other_income",
    name: "Other Income",
    name_ar: "دخل آخر",
    icon: "💰",
    color: "#15803d",
    type: "income",
    subcategories: [
      { id: "refund", name: "Refunds", name_ar: "مرتجعات واسترداد" },
      { id: "sold_item", name: "Sold Something", name_ar: "بيع حاجة" },
      { id: "general_other_income", name: "General", name_ar: "عام" },
    ],
  },
  // ─── Money moving between your own pockets: not spending, not income ───
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
      { id: "cash_transfer", name: "Cash Transfer", name_ar: "تحويل كاش" },
      { id: "savings", name: "Savings", name_ar: "ادخار" },
      { id: "gam3eya", name: "Gam3eya", name_ar: "جمعية" },
      { id: "debt", name: "Debt/Loan", name_ar: "دين/سلفة" },
      { id: "people", name: "People", name_ar: "أشخاص" },
    ],
  },
  {
    id: "investment",
    name: "Investment",
    name_ar: "استثمار",
    icon: "📊",
    color: "#ca8a04",
    type: "investment",
    subcategories: [
      { id: "gold", name: "Gold", name_ar: "ذهب" },
      { id: "stocks", name: "Stocks", name_ar: "أسهم" },
      { id: "certificates", name: "Certificates", name_ar: "شهادات" },
      { id: "real_estate", name: "Real Estate", name_ar: "عقارات" },
      { id: "crypto", name: "Crypto", name_ar: "عملات رقمية" },
    ],
  },
];

/**
 * Where an old (category, subcategory) pair lives now. `sub: "*"` matches any
 * subcategory of that category once the specific rows above it did not. `type` and
 * `direction` retype a money movement that used to be filed as spending or income —
 * a gam3eya installment, a loan, an ATM withdrawal — as a transfer.
 */
export interface LegacyTaxonomyRule {
  from: { category: string; sub: string };
  to: { category: string; sub: string };
  retype?: { type: "transfer"; direction: "incoming" | "outgoing" | "from_old_type" };
}

export const LEGACY_TAXONOMY: LegacyTaxonomyRule[] = [
  // Car services join transport; the traffic fine is a government service.
  { from: { category: "خدمات سيارات", sub: "كارتة" }, to: { category: "مواصلات", sub: "كارتة" } },
  { from: { category: "خدمات سيارات", sub: "ركنة" }, to: { category: "مواصلات", sub: "ركنة" } },
  { from: { category: "خدمات سيارات", sub: "مخالفة" }, to: { category: "خدمات حكومية", sub: "مخالفة مرور" } },
  { from: { category: "خدمات سيارات", sub: "*" }, to: { category: "مواصلات", sub: "صيانة عربية" } },
  // Digital services: tools and software are subscriptions, hosting is a work expense.
  { from: { category: "خدمات رقمية", sub: "أدوات AI" }, to: { category: "اشتراكات", sub: "أدوات AI" } },
  { from: { category: "خدمات رقمية", sub: "دومينات" }, to: { category: "عمل", sub: "استضافة" } },
  { from: { category: "خدمات رقمية", sub: "استضافة" }, to: { category: "عمل", sub: "استضافة" } },
  { from: { category: "خدمات رقمية", sub: "*" }, to: { category: "اشتراكات", sub: "برمجيات" } },
  // A gam3eya is saving, not spending: paying in and receiving are transfers.
  {
    from: { category: "التزامات وجمعيات", sub: "قسط جمعية" },
    to: { category: "تحويل", sub: "جمعية" },
    retype: { type: "transfer", direction: "outgoing" },
  },
  {
    from: { category: "التزامات وجمعيات", sub: "قبض جمعية" },
    to: { category: "تحويل", sub: "جمعية" },
    retype: { type: "transfer", direction: "incoming" },
  },
  { from: { category: "التزامات وجمعيات", sub: "*" }, to: { category: "أقساط وفوايد", sub: "أقساط" } },
  { from: { category: "فواتير", sub: "أقساط" }, to: { category: "أقساط وفوايد", sub: "أقساط" } },
  { from: { category: "فواتير", sub: "ضرائب" }, to: { category: "خدمات حكومية", sub: "ضرائب" } },
  { from: { category: "تسوق", sub: "عناية شخصية" }, to: { category: "عناية شخصية", sub: "عام" } },
  { from: { category: "ترفيه", sub: "كافيه" }, to: { category: "أكل وشرب", sub: "قهوة وكافيه" } },
  { from: { category: "ترفيه", sub: "منصات مشاهدة" }, to: { category: "اشتراكات", sub: "منصات مشاهدة" } },
  { from: { category: "ترفيه", sub: "PlayStation" }, to: { category: "ترفيه", sub: "ألعاب" } },
  { from: { category: "ترفيه", sub: "كافيه بورد جيم" }, to: { category: "ترفيه", sub: "ألعاب" } },
  { from: { category: "ترفيه", sub: "خروجة صحاب" }, to: { category: "ترفيه", sub: "خروجة" } },
  { from: { category: "اشتراكات", sub: "نتفلكس" }, to: { category: "اشتراكات", sub: "منصات مشاهدة" } },
  { from: { category: "اشتراكات", sub: "شاهد" }, to: { category: "اشتراكات", sub: "منصات مشاهدة" } },
  { from: { category: "اشتراكات", sub: "سبوتيفاي" }, to: { category: "اشتراكات", sub: "موسيقى" } },
  { from: { category: "اشتراكات", sub: "شات جي بي تي" }, to: { category: "اشتراكات", sub: "أدوات AI" } },
  { from: { category: "اشتراكات", sub: "جوجل AI" }, to: { category: "اشتراكات", sub: "أدوات AI" } },
  // A refund is money coming back, not an investment return.
  { from: { category: "عوائد استثمار", sub: "استرجاع" }, to: { category: "دخل آخر", sub: "مرتجعات واسترداد" } },
  { from: { category: "متنوعات", sub: "أشخاص" }, to: { category: "متنوعات", sub: "عام" } },
  // Cash taken from the ATM is still your money; bank messages filed it as spending.
  {
    from: { category: "متنوعات", sub: "سحب نقدي / ATM" },
    to: { category: "تحويل", sub: "سحب ATM" },
    retype: { type: "transfer", direction: "outgoing" },
  },
  // A loan comes back; lending and borrowing are transfers in the direction they moved.
  {
    from: { category: "تحويل", sub: "دين/سلفة" },
    to: { category: "تحويل", sub: "دين/سلفة" },
    retype: { type: "transfer", direction: "from_old_type" },
  },
  {
    from: { category: "تحويل", sub: "سحب ATM" },
    to: { category: "تحويل", sub: "سحب ATM" },
    retype: { type: "transfer", direction: "outgoing" },
  },
];

export interface LegacyTaxonomyResult {
  category: string;
  subCategory: string;
  type?: "transfer";
  direction?: "incoming" | "outgoing";
}

function same(a: string | null | undefined, b: string): boolean {
  return String(a ?? "").trim() === b;
}

/**
 * The current place of an old pair, or null when the pair is not a legacy one. `oldType`
 * decides the direction of a retyped loan ("سلفت" was an expense: outgoing).
 */
export function resolveLegacyTaxonomy(
  category: string | null | undefined,
  subCategory: string | null | undefined,
  oldType?: string | null,
): LegacyTaxonomyResult | null {
  for (const rule of LEGACY_TAXONOMY) {
    if (!same(category, rule.from.category)) continue;
    if (rule.from.sub !== "*" && !same(subCategory, rule.from.sub)) continue;
    const result: LegacyTaxonomyResult = { category: rule.to.category, subCategory: rule.to.sub };
    if (rule.retype) {
      // Only money that was booked as spending or income is retyped; a row that is
      // already a transfer keeps its own direction.
      if (oldType === "expense" || oldType === "income" || oldType == null) {
        result.type = "transfer";
        result.direction =
          rule.retype.direction === "from_old_type"
            ? oldType === "income" ? "incoming" : "outgoing"
            : rule.retype.direction;
      }
    }
    return result;
  }
  return null;
}

/**
 * Spending a person can choose to cut ("الرفاهيات"): one list for the statistics, the
 * monthly analysis and the behaviour snapshot, which each used to keep their own — with
 * names that are not categories (رفاهية، خروجات، هدايا).
 */
export const DISCRETIONARY_CATEGORIES: readonly string[] = [
  "ترفيه",
  "تسوق",
  "أكل وشرب",
  "عناية شخصية",
  "اشتراكات",
];

/** Category names that exist only as legacy input. */
export const RETIRED_CATEGORY_NAMES = ["خدمات سيارات", "خدمات رقمية", "التزامات وجمعيات"] as const;
