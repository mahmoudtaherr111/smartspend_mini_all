import { normalizeArabic } from "../fuzzy-match";
import {
  STRONG_EXPENSE as STRONG_EXPENSE_VERBS,
  STRONG_INCOME as STRONG_INCOME_VERBS,
} from "../intent-detector";

export interface CategoryInfo {
  category: string;
  subCategory: string;
  isBrand?: boolean;
}

/**
 * Egyptian Arabic Financial Dictionary (v3)
 * ─────────────────────────────────────────
 * Goals:
 * 1) High precision signals for rule-engine classification (0 tokens).
 * 2) Works with normalizedText (أ/إ/آ → ا, ى → ي, ة → ه, etc.).
 * 3) Big on purpose: broad coverage via smart variants (الـ prefix, normalized key, latin-case variants)
 *    instead of random filler phrases.
 *
 * Notes:
 * - Prefer 1-word or 2-word keys. The rule engine currently checks tokens + bigrams.
 * - Avoid overly generic words (فلوس/مصاري/مبلغ/باقة...) because they cause systematic misclassification.
 */

type CategoryName =
  | "أكل وشرب"
  | "مواصلات"
  | "فواتير"
  | "سكن"
  | "تسوق"
  | "صحة"
  | "تعليم"
  | "ترفيه"
  | "اشتراكات"
  | "تدخين"
  | "هدايا وصدقات"
  | "حيوانات أليفة"
  | "عمل"
  | "مرتب"
  | "عمل حر"
  | "عوائد استثمار"
  | "تحويل"
  | "استثمار"
  | "عناية شخصية"
  | "أطفال"
  | "أقساط وفوايد"
  | "هدايا وعيديات"
  | "دخل آخر"
  | "العائلة"
  | "أصدقاء"
  | "موظفين"
  | "خدمات حكومية"
  | "متنوعات";

function normKey(input: string): string {
  return normalizeArabic(String(input || ""))
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isArabicLike(input: string): boolean {
  return /^[\u0600-\u06FF]/.test(String(input || "").trim());
}

/**
 * Keys written twice with two different categories. The first category used to win in
 * silence, so a word filed under a section it did not belong to shadowed its right one
 * (مخالفة read as transport, never as government paperwork). Building the dictionary
 * records every such key here, and `lexicon.integrity.test.ts` requires the list empty.
 */
const conflicts: string[] = [];

function setKey(out: Record<string, CategoryName>, key: string, category: CategoryName): void {
  if (!key) return;
  const existing = out[key];
  if (existing === undefined) out[key] = category;
  else if (existing !== category) conflicts.push(`${key}: ${existing} / ${category}`);
}

function addKey(
  out: Record<string, CategoryName>,
  key: string,
  category: CategoryName,
) {
  const raw = String(key || "").trim();
  if (!raw) return;

  // Keep both raw and normalized keys to maximize hit-rate in different layers.
  setKey(out, raw, category);
  setKey(out, normKey(raw), category);

  // Latin case variants (e.g. "WE" vs "we")
  setKey(out, raw.toLowerCase(), category);
  setKey(out, raw.toUpperCase(), category);

  // Arabic "ال" variants for single-word tokens only (avoid turning phrases into noise).
  if (isArabicLike(raw) && !raw.includes(" ")) {
    if (raw.startsWith("ال") && raw.length > 3) {
      const noAl = raw.slice(2);
      setKey(out, noAl, category);
      setKey(out, normKey(noAl), category);
    } else if (!raw.startsWith("ال") && raw.length > 2) {
      const withAl = "ال" + raw;
      setKey(out, withAl, category);
      setKey(out, normKey(withAl), category);
    }
  }
}

function addMany(
  out: Record<string, CategoryName>,
  keys: string[],
  category: CategoryName,
) {
  for (const k of keys) addKey(out, k, category);
}

function buildDictionary(): Record<string, CategoryName> {
  const dict: Record<string, CategoryName> = {};

  // ───────────────────────────────
  // Food & Drinks
  // ───────────────────────────────
  addMany(
    dict,
    [
      // Places / intent-y nouns
      "مطعم",
      "كافيه",
      "كوفي",
      "قهوه",
      "قهوة",
      "قهوجي",
      "مشاريب",
      "مشروبات",
      "دليفري",
      "طلبات",
      "سوبر",
      "سوبرماركت",
      "سوبر ماركت",
      "بقاله",
      "بقالة",
      "خضار",
      "فاكهه",
      "فاكهة",

      // Common items
      "فول",
      "طعمية",
      "فلافل",
      "كشري",
      "شاورما",
      "كباب",
      "كفته",
      "كفتة",
      "برجر",
      "بيتزا",
      "حواوشي",
      "كبدة",
      "سجق",
      "بطاطس",
      "رز",
      "مكرونه",
      "مكرونة",
      "مكرونيه",
      "مكرونية",
      "عيش",
      "فينو",
      "خبز",
      "مخبوزات",
      "فرن",
      "مخبز",
      "لحمه",
      "لحمة",
      "لحم",
      // Slaughter vocabulary — عيد الأضحى and ordinary butcher spending. Without these
      // "دبحت عجل بـ تسعتاشر ألف" had no noun at all, and the typo layer answered for it.
      "عجل",
      "عجول",
      "خروف",
      "خرفان",
      "جزار",
      "جزاره",
      "جزارة",
      "ذبيحه",
      "ذبيحة",
      "اضحيه",
      "اضحية",
      "أضحية",
      "كندوز",
      "ضاني",
      "بتلو",
      "فراخ",
      "دواجن",
      "سمك",
      "جمبري",
      "سي فود",
      "لبن",
      "حليب",
      "جبنه",
      "جبنة",
      "بيض",
      "زبادي",
      "زبادى",
      "حلويات",
      "بيبسي",
      "كولا",
      "بيبسى",
      "كانز",
      "شوكولاته",
      "شوكولاتة",
      "بسبوسه",
      "بسبوسة",
      "كنافه",
      "كنافة",
      "دونات",
      "تورتة",
      "جاتوه",
      "بسكوت",
      "بسكويت",
      // Snacks the typo layer used to cover for by accident: "فشار" only ever reached
      // أكل وشرب because it sat two edits from another word, and the same budget sent
      // "سواق" there too. Real words belong in the lexicon, not in the typo budget.
      "فشار",
      "بوشار",
      "بوب كورن",
      "شيبسي",
      "لب",
      "سوداني",
      "ترمس",
      "حلو",
      "ايسكريم",
      "ايس كريم",
      "ايس",
      "آيس",
      "عصير",
      "قهوه",
      "شاي",
      "نسكافيه",
      "لاتيه",
      "كابتشينو",
      "موكا",
      "اسبرسو",
      "espresso",

      // Brands (common, high-signal)
      "كنتاكي",
      "kfc",
      "ماكدونالدز",
      "mcdonalds",
      "هارديز",
      "برجر كينج",
      "burger king",
      "بيتزا هت",
      "pizza hut",
      "دومينوز",
      "dominos",
      "ستاربكس",
      "starbucks",
      "كوستا",
      "costa",
      "سيلانترو",
      "cilantro",
      "بيانوز",
      "beanos",
      "طلبات",
      "talabat",
      "بريدفاست",
      "breadfast",
      "كارفور",
      // Bank messages name card merchants in Latin letters.
      "carrefour",
      "kazyon",
      "كازيون",
      "سبينيس",
      "spinneys",
      "seoudi",
      "metro market",
      "gourmet",
      "هايبر وان",
      "hyper one",
      "خير زمان",
      "kheir zaman",
    ],
    "أكل وشرب",
  );

  // ───────────────────────────────
  // Transport
  // ───────────────────────────────
  addMany(
    dict,
    [
      "مواصلات",
      "تاكسي",
      "تكسي",
      "مترو",
      "اتوبيس",
      "أتوبيس",
      "ميكروباص",
      "سرفيس",
      "اوبر",
      "uber",
      "كريم",
      "careem",
      "اندرايف",
      "indrive",
      "ان درايفر",
      "ديدي",
      "didi",
      "سويفل",
      "swvl",
      "بنزين",
      "تفويله",
      "تفويلة",
      "محطه",
      "محطة",
      "بنزينه",
      "بنزينة",
      "موقف",
      "تذكرة",
      "تيكت",
      "طيران",
      "ركنه",
      "ركنة",
      "سايس",
      "سواق",
      "سواقين",
      "سائق",
    ],
    "مواصلات",
  );

  // ───────────────────────────────
  // Car Services (separate from transport rides)
  // ───────────────────────────────
  addMany(
    dict,
    [
      "كارتة",
      "كوبري",
      "كوبرى",
      "تغيير زيت",
      "غيار زيت",
      "زيت موتور",
      "زيت العربية",
      "زيت عربيه",
      "كاوتش",
      "اطارات",
      "إطارات",
      "بطارية",
      "ميكانيكي",
      "سمكري",
      "سمكره",
      "كهربائي سيارات",
      "قطعه غيار",
      "قطعة غيار",
      "صيانة عربية",
      "مركز صيانة",
    ],
    "مواصلات",
  );

  // ───────────────────────────────
  // Bills (utilities, telecom, insurance, bill-payment networks)
  // ───────────────────────────────
  addMany(
    dict,
    [
      // Generic but still meaningful in money context
      "فاتوره",
      "فاتورة",
      "فواتير",
      "ايصال",
      "إيصال",
      "عداد",

      // Utilities
      "فاتورة المياه",
      "فاتورة مياه",
      "فاتورة المية",
      "فاتورة مية",
      "فاتورة الكهربا",
      "فاتورة الكهرباء",
      "فاتورة كهربا",
      "فاتورة كهرباء",
      "فاتورة الغاز",
      "فاتورة غاز",
      "فاتورة نت",
      "فاتورة النت",
      "كهربا",
      "كهرباء",
      "نور",
      "ميه",
      "مياه",
      "غاز",

      // Internet / telecom (avoid bare "باقة" here; use specific forms)
      "انترنت",
      "إنترنت",
      "النت",
      "internet",
      "wifi",
      "واي فاي",
      "dsl",
      "adsl",
      "vdsl",
      "فايبر",
      "fiber",
      "راوتر",
      "router",
      "mywe",
      "my we",
      "tedata",
      "te data",
      "شحن رصيد",
      "كارت شحن",
      "كارت فكة",
      "كارت فكه",
      "رصيد",
      "باقة نت",
      "باقه نت",
      "باقة انترنت",
      "باقة إنترنت",
      "باقة مكالمات",
      "باقة رسائل",
      // Common bundle slang (high-signal in Egypt)
      "فليكس",
      "فليكسات",
      "فودافون فليكس",
      "سوبر فليكس",
      "ميكسات",
      "حكاية",
      "اتصالات حكاية",
      "دماغ تانية",
      "سلفني",
      "سلفني نت",
      "سلفني رصيد",
      "شحنلي",
      "خط",
      "شريحة",
      "شريحه",
      "ارضي",
      "أرضي",

      // Telecom providers
      "فودافون",
      "vodafone",
      "اورنج",
      "orange",
      "اتصالات",
      "etisalat",
      "وي",
      "we",
      "شحنت كارت",
      "كارت شحن",
      "باقة",
      "شحن",


      // Insurance / fees
      "تامين",
      "تأمين",
      "رسوم",

      // Bill payment networks (often used to pay bills/recharge)
      "فوري",
      "fawry",
      "masary",
      "bee",
      "خالص",
      "khales",
      "اي خالص",
      "e-khales",
      "ekhalis",
      "امان",
      "أمان",
      "aman",
    ],
    "فواتير",
  );

  // ───────────────────────────────
  // Home
  // ───────────────────────────────
  addMany(
    dict,
    [
      "سكن",
      "بيت",
      "ايجار",
      "إيجار",
      "اجار",
      "عفش",
      "اثاث",
      "أثاث",
      "مفروشات",
      "ستاره",
      "ستارة",
      "صيانه",
      "صيانة",
      "سباك",
      "نجار",
      "نقاش",
      "كهربائي",
      "دهان",
      "دهانات",
      "منظفات",
      "نظافه",
      "نظافة",
      "مسحوق",
      "صابون",
      "اريال",
      "بريل",
      "كلور",
      "غساله",
      "غسالة",
      "تلاجه",
      "تلاجة",
      "بوتاجاز",
      "سخان",
      "تكييف",
      "مروحه",
      "مروحة",
    ],
    "سكن",
  );

  // ───────────────────────────────
  // Shopping
  // ───────────────────────────────
  addMany(
    dict,
    [
      "تسوق",
      "تسوقي",
      "هدوم",
      "لبس",
      "ملابس",
      "بنطلون",
      "تيشيرت",
      "تي شيرت",
      "سويت شيرت",
      "بلوفر",
      "قميص",
      "جاكيت",
      "فستان",
      "شراب",
      "كاب",
      "جزمة",
      "حذاء",
      "كوتشي",
      "شوز",
      "صندل",
      "شبشب",
      "هاف بوت",
      "بوت",
      "زارا",
      "zara",
      "اتش اند ام",
      "h&m",
      "ديفاكتو",
      "defacto",
      "ماكس",
      "max",
      "وايكيكي",
      "lc waikiki",
      "نايكي",
      "nike",
      "اديداس",
      "adidas",
      "بوما",
      "puma",
      "ريبوك",
      "reebok",
      "شنطه",
      "شنطة",
      "حقيبه",
      "حقيبة",
      "موبايل",
      "سماعه",
      "سماعة",
      "لاب",
      "لاب توب",
      "laptop",
      "لابتوب",
      "tablet",
      "تابلت",
      "ساعة",
      "سمارت",
      // Phone purchase phrases (keep them explicit; "فاتورة" / provider names already cover phone bills)
      "تليفون",
      "تلفون",
      "تليفون جديد",
      "موبايل جديد",
      "موبايل مستعمل",
      "الكترونيات",
      "إلكترونيات",
      "شاحن",
      "باور بانك",
      "كابل",
      "وصله",
      "وصلة",
      "سنيكرز",
      "احذية",
      "أحذية",
      "اكسسوار",
      "إكسسوار",
      "اكسسوارات",
      "إكسسوارات",

      // E-commerce platforms (high-signal)
      "امازون",
      "amazon",
      "نون",
      "noon",
      "جوميا",
      "jumia",
      "شي ان",
      "shein",
      "بي تك",
      "b.tech",
      "btech",
      "2b",
      "راية",
      "raya",
    ],
    "تسوق",
  );

  // ───────────────────────────────
  // Personal care
  // ───────────────────────────────
  addMany(
    dict,
    [
      "عناية",
      "عنايه",
      "حلاق",
      "كوافير",
      "صالون",
      "ميكب",
      "makeup",
      "شامبو",
      "عطر",
      "برفان",
      // Creams: specific bigrams, so "كريم" alone stays the ride app it usually is
      "كريم شعر",
      "كريم جسم",
      "كريم بشره",
      "كريم بشرة",
      "كريم مرطب",
    ],
    "عناية شخصية",
  );

  // ───────────────────────────────
  // Installments and loan interest
  // ───────────────────────────────
  addMany(
    dict,
    [
      "قسط",
      "اقساط",
      "أقساط",
      "قرض",
      "مديونية",
      "مديونيه",
      "فاليو",
      "valu",
      "سهوله",
      "سهولة",
      "souhoola",
      "كونتكت",
      "contact",
    ],
    "أقساط وفوايد",
  );

  // ───────────────────────────────
  // Health
  // ───────────────────────────────
  addMany(
    dict,
    [
      "صحة",
      "دكتور",
      "كشف",
      "عياده",
      "عيادة",
      "طبيب",
      "مستشفى",
      "صيدليه",
      "صيدلية",
      "دواء",
      "دوا",
      "علاج",
      "روشته",
      "روشتة",
      "تحاليل",
      "معمل",
      "مختبر",
      "اشعه",
      "أشعة",
      "رنين",
      "سونار",
      "اسنان",
      "أسنان",
      "حشو",
      "خلع",
      "ضرس",
      "نظاره",
      "نظارة",
      "عدسه",
      "عدسة",
      // Common pharmacy chains (kept short and common)
      "العزبي",
      "سيف",
      "رشدي",
    ],
    "صحة",
  );

  // ───────────────────────────────
  // Education
  // ───────────────────────────────
  addMany(
    dict,
    [
      "تعليم",
      "مدرسه",
      "مدرسة",
      "جامعه",
      "جامعة",
      "كليه",
      "كلية",
      "سنتر",
      "درس",
      "دروس",
      "مذكره",
      "مذكرة",
      "ملزمه",
      "ملزمة",
      "كتاب",
      "كتب",
      "كورس",
      "كورسات",
      "دوره",
      "دورة",
      "يوديمي",
      "udemy",
      "كورسيرا",
      "coursera",
    ],
    "تعليم",
  );

  // ───────────────────────────────
  // Entertainment / Outings / Subscriptions / Smoking
  // ───────────────────────────────
  addMany(
    dict,
    [
      "ترفيه",
      "سينما",
      "فيلم",
      "مسرح",
      "حفله",
      "حفلة",
      "حفلات",
      "جيم",
      "رياضه",
      "رياضة",
      "اشتراك جيم",
      "سفر",
      "رحله",
      "رحلة",
      "مصيف",
      "فندق",
      "بلايستيشن",
      "playstation",
      "ps",
      "xbox",
      "خروجه",
      "خروجة",
      "فسحه",
      "فسحة",
      "كورنيش",
      "عزومه",
      "عزومة",
    ],
    "ترفيه",
  );

  addMany(
    dict,
    [
      "خروجه صحاب",
      "خروجة صحاب",
      "بورد جيم",
      "board game",
      "بولينج",
      "bowling",
      "سينما",
      "كورنيش",
      "فسحه",
      "فسحة",
      "بلايستيشن",
      "playstation",
    ],
    "ترفيه",
  );

  addMany(
    dict,
    [
      "اشتراك",
      "اشتراكات",
      "نتفلكس",
      "netflix",
      "سبوتيفاي",
      "spotify",
      "شاهد",
      "shahid",
      "واتش ات",
      "watch it",
      "watchit",
      "osn",
      "osn+",
      "يوتيوب بريميوم",
      "youtube premium",
      "انغامي",
      "anghami",
      "شات جي بي تي",
      "chatgpt",
      "openai",
      "جوجل ai",
      "google ai",
      "gemini",
    ],
    "اشتراكات",
  );

  addMany(
    dict,
    [
      "تدخين",
      "سجاير",
      "سجائر",
      "سيجارة",
      "معسل",
      "شيشه",
      "شيشة",
      "فيب",
      "vape",
      "ليكود",
      "liquid",
    ],
    "تدخين",
  );

  // ───────────────────────────────
  // Gifts & Charity
  // ───────────────────────────────
  addMany(
    dict,
    [
      "هدية",
      "هديه",
      "هدايا",
      "صدقه",
      "صدقة",
      "تبرع",
      "تبرعات",
      "زكاه",
      "زكاة",
      "عيديه",
      "عيدية",
      "نقطة",
      "نقطه",
      "مجامله",
      "مجاملة",
    ],
    "هدايا وصدقات",
  );

  // ───────────────────────────────
  // Pets
  // ───────────────────────────────
  addMany(
    dict,
    [
      "قط",
      "قطة",
      "كلب",
      "كلاب",
      "قطط",
      "بيطري",
      "دكتور بيطري",
      "اكل قطط",
      "اكل كلاب",
      "طعام قطط",
      "طعام كلاب",
      "رمل قطط",
      "ليتر",
      "pet",
      "pets",
      "petshop",
      "pet shop",
    ],
    "حيوانات أليفة",
  );

  // ───────────────────────────────
  // Work / Digital services (overlaps are ok; subcategory refinement handles it)
  // ───────────────────────────────
  addMany(
    dict,
    [
      "شغل",
      "مكتب",
      "مستلزمات مكتب",
      "طباعة",
      "تصوير",
      "ورق",
      "اقلام",
      "أقلام",
      "coworking",
      "co working",
      "مساحة عمل",
      "اجتماع",
      "ميتينج",
      "meeting",
      "استضافة",
      "hosting",
      "دومين",
      "domain",
      "سيرفر",
      "server",
      "api",
      "saas",
      "vpn",
      "vps",
      "cloud",
      "aws",
      "azure",
      "gcp",
      "google cloud",
      "firebase",
    ],
    "عمل",
  );

  addMany(
    dict,
    [
      "خدمات رقمية",
      "اشتراك vpn",
      "اشتراك cloud",
      "ai tools",
      "ادوات ai",
      "أدوات ai",
    ],
    "اشتراكات",
  );

  addMany(
    dict,
    ["vps", "aws", "azure", "gcp", "دومين", "domain", "استضافة", "hosting", "سيرفر", "server"],
    "عمل",
  );

  // ───────────────────────────────
  // Transfer / Investment / Income categories
  // ───────────────────────────────
  addMany(
    dict,
    [
      "فيزا",
      "visa",
      "ماستركارد",
      "mastercard",
      "بطاقة",
      "كارت",
      "كارت فيزا",
      "تحويل",
      "تحويل بنكي",
      "حواله",
      "حوالة",
      "تيلدا",
      "telda",
      "كليفر",
      "klippa",
      "انستاباي",
      "instapay",
      "فودافون كاش",
      "vodafone cash",
      "اورنج كاش",
      "orange cash",
      "اتصالات كاش",
      "etisalat cash",
      "we pay",
      "وي باي",
      "محفظه",
      "محفظة",
      "محفظه الكترونيه",
      "محفظة الكترونية",
      "wallet",
      "e-wallet",
      "ewallet",
      "سحب",
      "سحب atm",
      "atm",
      "ايداع",
      "إيداع",
      "ادخار",
      "توفير",
      "حوش",
      "تحويش",
      "تحت البلاطه",
      "تحت البلاطة",
      "حصاله",
      "حصالة",
      "في الدرج",
      "درج المكتب",
      "جمعيه",
      "جمعية",
      "سلفه",
      "سلفة",
      "سلف",
      "دين",
      "فك",
      "فكه",
      "فكة",
      "كاش",
    ],
    "تحويل",
  );

  // ───────────────────────────────
  // Family & Friends
  // ───────────────────────────────
  addMany(
    dict,
    [
      "صاحبي",
      "صديقي",
      "زميلي",
      "زميلتي",
      "صاحبتي",
      "صحبتي",
    ],
    "أصدقاء",
  );

  addMany(
    dict,
    [
      "اخويا",
      "أخويا",
      "اختي",
      "أختي",
      "اخي",
      "أخي",
      "ابويا",
      "أبويا",
      "امي",
      "أمي",
      "بابا",
      "ماما",
      "مراتي",
      "زوجتي",
      "جوزي",
      "زوجي",
      "بنتي",
      "ابني",
      "قريبي",
      "عيلتي",
      "عائلتي",
    ],
    "العائلة",
  );

  addMany(
    dict,
    [
      "استثمار",
      "ذهب",
      "دهب",
      "سبيكه",
      "سبيكة",
      "اسهم",
      "أسهم",
      "بورصه",
      "بورصة",
      "ثاندر",
      "thndr",
      "شهاده",
      "شهادة",
      "وديعه",
      "وديعة",
      "عقار",
      "عقارات",
      "ارض",
      "أرض",
      "كريبتو",
      "crypto",
      "بيتكوين",
      "بتكوين",
      "bitcoin",
      "btc",
      "usdt",
    ],
    "استثمار",
  );

  addMany(
    dict,
    [
      "مرتب",
      "راتب",
      "القبض",
      "المعاش",
      "بونص",
      "مكافاه",
      "مكافأة",
      "بدل",
      "حافز",
      "حوافز",
    ],
    "مرتب",
  );

  addMany(
    dict,
    [
      "فريلانس",
      "freelance",
      "شغل حر",
      "عمل حر",
      "سبوبه",
      "سبوبة",
      "عموله",
      "عمولة",
      "كلاينت",
      "client",
    ],
    "عمل حر",
  );

  addMany(
    dict,
    [
      "ارباح",
      "أرباح",
      "فوائد",
      "فوايد",
      "كاش باك",
      "cashback",
      "عائد",
    ],
    "عوائد استثمار",
  );

  addMany(dict, ["استرجاع", "refund", "مرتجع", "استرداد"], "دخل آخر");

  // ───────────────────────────────
  // Government Services
  // ───────────────────────────────
  addMany(
    dict,
    [
      "رخصة", "رخصه", "جواز", "جواز سفر", "رقم قومي", "بطاقة رقم قومي",
      "مخالفة", "مخالفه", "مخالفة مرور", "توثيق", "توثيق عقد",
      "تجديد رخصة", "تجديد رخصه", "ترخيص", "مرور", "traffic", "ضرايب", "ضرائب",
      // Egyptian paperwork fees people actually name out loud
      "دمغة", "دمغه", "دمغات", "شهر عقاري", "الشهر العقاري", "تصديق", "شهادة ميلاد",
      "شهاده ميلاد", "صحيفة جنائية", "صحيفه جنائيه", "فيش وتشبيه",
    ],
    "خدمات حكومية",
  );

  return dict;
}

export const CATEGORY_DICTIONARY: Record<string, string> = buildDictionary();

/** Keys the dictionary was given twice with different categories; must stay empty. */
export const DICTIONARY_CONFLICTS: readonly string[] = [...new Set(conflicts)];

// Keep intent keyword lists single-sourced in intent-detector, but re-export here
// to avoid breaking legacy imports.
export {
  INCOME_KEYWORDS,
  EXPENSE_KEYWORDS,
  STRONG_INCOME,
  STRONG_EXPENSE,
} from "../intent-detector";

/**
 * Stop words and common financial terms that should NEVER be added to custom user dictionaries.
 * Prevents "poison learning" where broad prepositions or currency units hijack classification.
 */
export const POISON_STOP_WORDS = new Set([
  "جنيه", "جنية", "جنيهات", "قرش", "دفعت", "صرفت", "حولت", "سجل", "من", "في", "على", "إلى", "هو", "هي",
  "عن", "مع", "هذا", "الذي", "التي", "لـ", "بـ", "فـ", "عند", "بتاع", "بتاعة", "egp", "le", "pound", "pounds", "cash", "money",
  "pay", "paid", "مصروف", "ايراد", "دخل", "رصيد", "حساب", "محفظة", "محفظه", "فودافون", "اتصالات", "اورنج", "انستاباي",
  "عشان", "كده", "كدا", "كذا", "يعني", "بسبب", "عشانها", "عشانه", "معاه", "معاها", "منه", "منها", "عليه", "عليها",
  "بتاعي", "بتاعتي", "خلاص", "بقى", "برضو", "طبعا", "اصلا", "خالص", "لحد", "لغاية", "كمان", "بردو", "عادي"
]);

/**
 * Words the lexicon already knows: currency units, grammar words, and the verbs intent
 * detection keys on. Fuzzy matching is typo correction, and a correctly spelled word is
 * not a typo of a different word — so these must never be "corrected" into a category.
 *
 * Without this guard the typo layer produced a category for tokens that carry none.
 * `دفعت` — the commonest expense verb in the dialect — sits two edits from `بعت` (sold),
 * so "دفعت 100 و100 و100 و100" came back as تحويل and the direction of the whole
 * transaction flipped from expense to transfer. Same for `جنيه` → أكل وشرب and
 * `حجزت` → تحويل. A verb governs direction; only a noun governs category.
 */
const KNOWN_LEXEMES: ReadonlySet<string> = (() => {
  const known = new Set<string>();
  const add = (word: string): void => {
    const normalized = normalizeArabic(word).toLowerCase().trim();
    // Multi-word entries ("شحنت رصيد") are phrases, not tokens — the fuzzy layer
    // only ever looks at single tokens, so they cannot collide with it.
    if (normalized.length >= 3 && !normalized.includes(" ")) known.add(normalized);
  };
  for (const word of POISON_STOP_WORDS) add(word);
  for (const verb of STRONG_EXPENSE_VERBS) add(verb);
  for (const verb of STRONG_INCOME_VERBS) add(verb);
  return known;
})();

/**
 * True when the token is a word we already recognise rather than a possible misspelling.
 * Used to keep the fuzzy layer from rewriting known verbs and currency units.
 */
export function isKnownLexeme(word: string): boolean {
  const normalized = normalizeArabic(String(word || "")).toLowerCase().trim();
  return normalized.length > 0 && KNOWN_LEXEMES.has(normalized);
}

/**
 * Verifies if a proposed word or phrase is considered "poisonous" (too short, or composed solely of stop words).
 */
export function isPoisonWord(text: string): boolean {
  const clean = text.trim().toLowerCase();
  if (clean.length < 3) return true;
  if (POISON_STOP_WORDS.has(clean)) return true;
  const tokens = clean.split(/\s+/);
  return tokens.every(token => POISON_STOP_WORDS.has(token));
}

/**
 * Cleans a raw transaction phrase by stripping out numbers, currency terms, and common financial stop words
 * (like "صرفت", "دفعت", "جنيه", "في", "على"), returning the core compound noun or entity (e.g., "سوبر ماركت", "خضار").
 */
export function extractCleanDictionaryPhrase(rawText: string): string {
  const normalized = rawText
    .replace(/\d+(\.\d+)?/g, " ") // Remove numbers
    .replace(/[^\u0600-\u06FFa-zA-Z\s]/g, " ") // Keep Arabic + English only
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const tokens = normalized.split(/\s+/).filter(token => {
    return token.length > 0 && !POISON_STOP_WORDS.has(token);
  });

  const cleanPhrase = tokens.join(" ").trim();
  if (!cleanPhrase || isPoisonWord(cleanPhrase)) {
    return "";
  }
  return cleanPhrase.substring(0, 100);
}

/**
 * Whitelist of Egyptian Arabic words/names starting with "و" that should NEVER be treated as a conjunction prefix.
 * Prevents context bleeding fixes from breaking words like "وجبة", "وقود", "وليد", etc.
 */
export const WAW_WHITELIST = new Set([
  // Nouns / Common financial words
  "وجبة", "وجبه", "وجبات", "وقود", "ورق", "ورقه", "ورقة", "ورشة", "ورشه", "ورش", "ولد", "ولاد", "وقت", "أوقات", "اوقات", "وجه", "وجوه", "وسط", "وعد", "وعود", "وطن", "وزن", "وحدة", "وحدات", "وحده", "وفاة", "وفاه", "وفيات", "وظيفة", "وظائف", "وظيفه", "ولاية", "ولايه", "ولايات", "وكيل", "وكلاء", "وريث", "ورثة", "ورثه", "وداع", "وضوء", "وجع", "أوجاع", "اوجاع", "وحش", "وحوش", "وصفة", "وصفه", "وصفات", "وفد", "وفود", "وعاء", "أوعية", "اوعية", "وهم", "أوهام", "اوهام", "وارد", "واردات", "واجب", "واجبات", "واحد", "واحدة", "واحده", "وادي", "وديعة", "وديعة", "ودائع", "وقار", "وقاية", "وقايه", "وقيعة", "وقيعه", "ولا", "ولكن", "ولو", "وهبة", "وهبه", "وفق", "وفقا",
  // Names starting with Waw
  "وليد", "وفاء", "وئام", "وجدي", "وسام", "وحيد", "ولاء", "وداد", "وسيم", "وائل", "وجيه", "وئام"
]);

/**
 * Helper to check if a word is whitelisted as starting with "و" naturally.
 */
export function isWawWhitelisted(word: string): boolean {
  if (!word) return false;
  const clean = word.toLowerCase().trim();
  if (!clean.startsWith("و")) return false;
  const normalized = normalizeArabic(clean).toLowerCase();
  
  if (WAW_WHITELIST.has(clean) || WAW_WHITELIST.has(normalized)) return true;
  
  // If it starts with a single waw, check the core word too (e.g. "وجبة" is whitelisted, we check it)
  if (clean.startsWith("و") && !clean.startsWith("وو")) {
    const core = clean.slice(1);
    const coreNorm = normalizeArabic(core).toLowerCase();
    if (WAW_WHITELIST.has(core) || WAW_WHITELIST.has(coreNorm)) return true;
  }
  
  return false;
}
