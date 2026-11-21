/**
 * Taxonomy v2: what money was for.
 *
 * A category answers one question, the purpose. Who the money went to is the contact, how it
 * was paid is the wallet, which obligation it belongs to is the commitment, and whether it
 * was spending, income or only a movement is the ledger kind (`contracts/ledger-movement.ts`).
 * Keeping those apart is what lets one sentence have one right answer: «قسط المدرسة» is
 * education, linked to its commitment; it is not "an instalment".
 *
 * The id is the identity. `nameAr` is display text and may change without touching stored
 * data. `guide` is what belongs in the category, written the way people in Egypt say it; it
 * builds the model's prompt (`api/lib/understanding/prompt.ts`) and the app's help text.
 *
 * Why: docs/decisions/0052-understanding-engine.md.
 */
import type { MovementKind } from "./ledger-movement";

export type TaxonomyGroup = "spending" | "movement" | "income";

export interface TaxonomySub {
  id: string;
  nameAr: string;
  nameEn: string;
  /** Typical wording and things that belong here. Empty for `other`. */
  guide: string;
}

export interface TaxonomyCategory {
  id: string;
  nameAr: string;
  nameEn: string;
  icon: string;
  color: string;
  group: TaxonomyGroup;
  /** The ledger kinds an event of this category may have. */
  kinds: readonly MovementKind[];
  /** What the category is, and what it is not. */
  guide: string;
  subs: readonly TaxonomySub[];
}

/** Bump when a category or subcategory is added, removed or re-bound. Names and guides do not count. */
export const TAXONOMY_VERSION = "2.1";

const other: TaxonomySub = { id: "other", nameAr: "أخرى", nameEn: "Other", guide: "" };
const sub = (id: string, nameAr: string, nameEn: string, guide: string): TaxonomySub => ({ id, nameAr, nameEn, guide });

const SPENDING: readonly MovementKind[] = ["spending", "refund"];
const INCOME: readonly MovementKind[] = ["income"];

export const TAXONOMY: readonly TaxonomyCategory[] = [
  // ─── Spending: what the money bought ───
  {
    id: "groceries", nameAr: "بقالة وتموين", nameEn: "Groceries", icon: "🛒", color: "#16a34a",
    group: "spending", kinds: SPENDING,
    guide: "مشتريات البقال والسوبر ماركت والكشك الغذائية حتى لو اتاكلت في السكة. السلة المتنوعة من فروع مختلفة بمبلغ واحد أو فاتورة من غير تفاصيل في supermarket. لو صنف بعينه غرضه معروف زي مسحوق الغسيل أو لبن الرضع، اختار غرضه.",
    subs: [
      sub("vegetables_fruits", "خضار وفاكهة", "Vegetables & fruit", "خضار، فاكهة، الخضري، الفكهاني"),
      sub("meat_poultry_fish", "لحوم وفراخ وسمك", "Meat, poultry & fish", "لحمة، فراخ، سمك، جمبري، الجزار، الفرارجي"),
      sub("bakery", "عيش ومخبوزات", "Bakery", "عيش، فينو، الفرن، المخبز"),
      sub("dairy_eggs", "ألبان وبيض", "Dairy & eggs", "لبن، جبنة، زبادي، بيض، مشتريات الألبان والبيض مع بعض"),
      sub("packaged_snacks", "سناكس ومشروبات", "Packaged snacks & drinks", "شيبسي، بسكوت معلب، شوكولاتة مغلفة، عصير معلب، كانز، مية معدنية، تسالي من الكشك"),
      sub("supermarket", "تموين ومشتريات متنوعة", "Staples & mixed groceries", "طلبات الأسبوع، سلة بقالة متنوعة، فاتورة كارفور بدون تفاصيل، طلبات مارت، بريدفاست، تموين، رز وزيت وسكر، حساب البقال"),
      other,
    ],
  },
  {
    id: "dining", nameAr: "أكل برّه", nameEn: "Eating out & delivery", icon: "🍔", color: "#f97316",
    group: "spending", kinds: SPENDING,
    guide: "وجبة أو مشروب من مطعم أو كافيه أو عربية أكل، حتى لو اتاكلت في البيت. دليفري الأكل هنا؛ توصيل مشتريات البقالة يفضل بقالة.",
    subs: [
      sub("restaurant", "مطاعم", "Restaurants", "مطعم، غدا أو عشا بره، عزومة"),
      sub("fast_food", "وجبات سريعة", "Fast food & sandwiches", "فول وطعمية، كشري، شاورما، برجر، بيتزا، سندوتشات، ماك، فطار من العربية"),
      sub("cafe", "كافيهات وقهوة", "Cafes & coffee", "قهوة، كافيه، القعدة على القهوة، فنجان قهوة، شاي على القهوة"),
      sub("delivery", "دليفري مطاعم", "Restaurant delivery", "أوردر أكل، توصيل وجبة من مطعم، طلبات من مطعم"),
      sub("sweets_snacks", "حلويات وعصاير", "Desserts & fresh juice", "كنافة من الحلواني، آيس كريم من المحل، عصير قصب، عصير طازة"),
      other,
    ],
  },
  {
    id: "transport", nameAr: "مواصلات", nameEn: "Transport", icon: "🚌", color: "#3b82f6",
    group: "spending", kinds: SPENDING,
    guide: "أجرة أي حاجة بتركبها. مصاريف عربيتك أنت مش هنا (car)، والطيران مش هنا (travel).",
    subs: [
      sub("ride_apps", "أوبر وتاكسي", "Ride apps & taxi", "أوبر، كريم، إن درايفر، ديدي، تاكسي"),
      sub("metro", "مترو", "Metro", "مترو، تذكرة أو اشتراك المترو"),
      sub("microbus_bus", "ميكروباص وأتوبيس وتوكتوك", "Microbus, bus & toktok", "ميكروباص، أتوبيس، ميني باص، توكتوك، أجرة"),
      sub("train_intercity", "قطر وسفر داخلي", "Train & intercity", "قطر، سوبر جيت، جو باص، عربية أجرة لمحافظة"),
      other,
    ],
  },
  {
    id: "car", nameAr: "العربية", nameEn: "Car", icon: "🚗", color: "#0ea5e9",
    group: "spending", kinds: SPENDING,
    guide: "كل مصاريف عربيتك أو موتوسيكلك: بنزين، صيانة، غسيل وركنة وكارتة، ترخيص ومخالفات، تأمين، وشراها (مقدم وأقساط).",
    subs: [
      sub("fuel", "بنزين", "Fuel", "بنزين، تفويل، غاز للعربية، شحن عربية كهربا"),
      sub("maintenance", "صيانة وقطع غيار", "Maintenance & parts", "صيانة، ميكانيكي، زيت، كاوتش، بطارية، قطع غيار، سمكرة"),
      sub("wash_parking_tolls", "غسيل وركنة وكارتة", "Wash, parking & tolls", "غسيل العربية، ركنة، جراج، سايس، كارتة، بوابة"),
      sub("license_fines", "ترخيص ومخالفات", "Licence & fines", "رخصة العربية أو القيادة، تجديد الترخيص، مخالفة مرور، مخالفة ركن"),
      sub("car_insurance", "تأمين العربية", "Car insurance", "تأمين العربية"),
      sub("car_purchase", "شراء عربية", "Car purchase", "مقدم العربية، قسط العربية، تمن العربية"),
      other,
    ],
  },
  {
    id: "bills", nameAr: "فواتير ومرافق", nameEn: "Bills & utilities", icon: "💡", color: "#eab308",
    group: "spending", kinds: SPENDING,
    guide: "كهربا ومية وغاز ونت البيت وخط الموبايل. شحن رصيد المكالمات هنا، وشحن محفظتك الإلكترونية حركة بين حساباتك.",
    subs: [
      sub("electricity", "كهرباء", "Electricity", "فاتورة الكهربا، النور، شحن عداد أو كارت الكهربا"),
      sub("water", "مياه", "Water", "فاتورة المية، عداد المية"),
      sub("gas", "غاز", "Gas", "فاتورة الغاز، أنبوبة"),
      sub("internet_landline", "إنترنت وتليفون أرضي", "Internet & landline", "نت البيت، باقة النت، الراوتر، WE، التليفون الأرضي"),
      sub("mobile", "شحن وباقات", "Mobile", "شحن رصيد، رصيد، كارت شحن، كارت فودافون، كارت أورنج، كارت اتصالات، باقة الموبايل، فاتورة الخط"),
      other,
    ],
  },
  {
    id: "housing", nameAr: "سكن وبيت", nameEn: "Home", icon: "🏠", color: "#8b5cf6",
    group: "spending", kinds: SPENDING,
    guide: "البيت اللي ساكن فيه: إيجاره أو شراه، صيانته، عفشه وأجهزته، أدواته، وخدماته زي المكوجي ونقل العفش. إيجار محل أو مكتب مش هنا (work).",
    subs: [
      sub("rent", "إيجار", "Rent", "إيجار الشقة، صاحب البيت"),
      sub("home_purchase", "شراء شقة", "Home purchase", "مقدم الشقة، عربون الشقة، قسط الشقة"),
      sub("maintenance", "صيانة وتصليحات", "Repairs", "سباك، كهربائي، نقاش، نجار، تصليح في البيت، دهان"),
      sub("furniture", "عفش ومفروشات", "Furniture", "عفش، أثاث، سجاد، ستاير، مراتب"),
      sub("appliances", "أجهزة منزلية", "Appliances", "تلاجة، غسالة، بوتاجاز، تكييف، مروحة، قسط أي جهاز منهم"),
      sub("supplies", "منظفات وأدوات البيت", "Household supplies", "منظفات، مسحوق، أدوات مطبخ، لمبات"),
      sub("home_services", "خدمات البيت", "Home help", "الشغالة، البواب، الزبال، الجنايني"),
      sub("building_fees", "مصاريف العمارة", "Building fees", "اتحاد الملاك، صيانة العمارة، الأسانسير"),
      other,
    ],
  },
  {
    id: "shopping", nameAr: "تسوق ولبس", nameEn: "Shopping", icon: "🛍️", color: "#ec4899",
    group: "spending", kinds: SPENDING,
    guide: "حاجات بتشتريها لنفسك أو للبيت غير الأكل: لبس، جزم، موبايلات وإلكترونيات وتصليحها، إكسسوارات. لبس ولعب الأولاد في kids.",
    subs: [
      sub("clothes", "لبس", "Clothes", "هدوم، لبس، تيشيرت، بنطلون، فستان"),
      sub("shoes_bags", "جزم وشنط", "Shoes & bags", "جزمة، كوتشي، شنطة"),
      sub("electronics", "موبايلات وإلكترونيات", "Phones & electronics", "موبايل، لاب توب، سماعة، شاحن، جراب، تصليح الموبايل، قسط الموبايل"),
      sub("accessories", "إكسسوارات وساعات", "Accessories", "ساعة، نضارة شمس، إكسسوارات، محفظة"),
      other,
    ],
  },
  {
    id: "personal_care", nameAr: "عناية شخصية", nameEn: "Personal care", icon: "💈", color: "#d946ef",
    group: "spending", kinds: SPENDING,
    guide: "الحلاق والكوافير ومستحضرات العناية والعطور.",
    subs: [
      sub("barber_salon", "حلاق وكوافير", "Barber & salon", "حلاق، كوافير، قص شعر، صبغة"),
      sub("cosmetics", "مستحضرات وعطور", "Cosmetics & perfume", "برفان، كريم، شامبو، ميكب"),
      other,
    ],
  },
  {
    id: "health", nameAr: "صحة وعلاج", nameEn: "Health", icon: "💊", color: "#ef4444",
    group: "spending", kinds: SPENDING,
    guide: "أي علاج ليك أو لحد من أهلك: كشف، دوا، تحاليل، مستشفى، أسنان، نضارة نظر، جلسات، تأمين صحي. اسم الشخص بيتكتب جنب العملية ومش هو الفئة.",
    subs: [
      sub("doctor", "كشف دكتور", "Doctor", "كشف، دكتور، عيادة، استشارة"),
      sub("pharmacy", "أدوية وصيدلية", "Pharmacy", "دوا، روشتة، فيتامين، علاج من الصيدلية"),
      sub("lab_scan", "تحاليل وأشعة", "Labs & scans", "تحاليل، أشعة، سونار، رنين"),
      sub("hospital", "مستشفى وعمليات", "Hospital & surgery", "مستشفى، عملية، ولادة، حجز"),
      sub("dental", "أسنان", "Dental", "دكتور أسنان، حشو، خلع، تقويم"),
      sub("optical", "نظارات وعدسات", "Optical", "كشف نظر، نضارة نظر، عدسات"),
      sub("therapy", "علاج طبيعي وجلسات", "Therapy sessions", "جلسات علاج طبيعي، علاج نفسي، جلسة تخاطب"),
      sub("health_insurance", "تأمين صحي", "Health insurance", "تأمين صحي، كارت التأمين"),
      other,
    ],
  },
  {
    id: "kids", nameAr: "الأولاد", nameEn: "Kids", icon: "🍼", color: "#fb7185",
    group: "spending", kinds: SPENDING,
    guide: "مصاريف الأولاد غير التعليم: حضانة، بامبرز ولبن، لبسهم ولعبهم، مصروفهم، تمارينهم. تمرين الطفل هنا، المدرسة والدروس في education وعلاجه في health.",
    subs: [
      sub("nursery", "حضانة", "Nursery", "حضانة"),
      sub("baby_supplies", "مستلزمات البيبي", "Diapers & formula", "بامبرز، لبن أطفال، ببرونة، مستلزمات البيبي"),
      sub("clothes_toys", "لبس ولعب", "Clothes & toys", "لبس العيال، لبس العيد للأولاد، لعب"),
      sub("pocket_money", "مصروف الأولاد", "Pocket money", "مصروف الواد، مصروف البنت، مصروف العيال، الواد مصروف، البنت مصروف، مصروف المدرسة اليومي"),
      sub("activities", "تمارين وأنشطة", "Activities", "تمرين ابني، سباحة بنتي، أكاديمية كورة للأطفال"),
      other,
    ],
  },
  {
    id: "education", nameAr: "تعليم", nameEn: "Education", icon: "📚", color: "#6366f1",
    group: "spending", kinds: SPENDING,
    guide: "مصاريف وأقساط المدرسة والجامعة، الدروس والسناتر، الكورسات، الكتب، وباص وزي ورحلات المدرسة. قسط المدرسة هنا مش في الأقساط.",
    subs: [
      sub("school_fees", "مصاريف مدرسة", "School fees", "مصاريف المدرسة، قسط المدرسة"),
      sub("university", "جامعة", "University", "مصاريف الجامعة أو الكلية، الترم"),
      sub("tutoring", "دروس وسناتر", "Tutoring", "درس خصوصي، سنتر، المستر، حق الدرس"),
      sub("courses", "كورسات وتدريب", "Courses", "كورس، دورة تدريبية، شهادة كورس"),
      sub("books_supplies", "كتب وأدوات", "Books & supplies", "كتب، كتب خارجية، ملازم، أدوات مدرسية"),
      sub("school_extras", "باص وزي ورحلات", "Bus, uniform & trips", "باص المدرسة، زي المدرسة، رحلة المدرسة"),
      other,
    ],
  },
  {
    id: "entertainment", nameAr: "ترفيه وخروجات", nameEn: "Entertainment", icon: "🎮", color: "#f59e0b",
    group: "spending", kinds: SPENDING,
    guide: "خروجات وسينما وألعاب وجيم ونادي وهوايات. الأكل في الخروجة في dining، والسفر والمصيف في travel.",
    subs: [
      sub("outing", "خروجات", "Outings", "خروجة، فسحة، ملاهي، تذاكر دخول"),
      sub("cinema_events", "سينما وحفلات", "Cinema & events", "سينما، فيلم، حفلة، مسرح، ماتش"),
      sub("gaming", "ألعاب", "Gaming", "بلايستيشن، لعبة، شحن لعبة"),
      sub("sports_gym", "جيم ونادي ورياضة", "Gym, club & sports", "جيم، اشتراك النادي، ملعب، تمرين"),
      sub("hobbies", "هوايات", "Hobbies", "هواية، أدوات رسم، صيد"),
      other,
    ],
  },
  {
    id: "travel", nameAr: "سفر ومصايف", nameEn: "Travel", icon: "✈️", color: "#06b6d4",
    group: "spending", kinds: SPENDING,
    guide: "طيران وفنادق ومصايف ورحلات وحج وعمرة.",
    subs: [
      sub("flights", "طيران", "Flights", "تذكرة طيران"),
      sub("stay", "فنادق وإقامة", "Hotels & stay", "فندق، شاليه، إيجار مصيف"),
      sub("trips", "مصيف ورحلات", "Trips", "مصيف، رحلة، الساحل"),
      sub("hajj_umrah", "حج وعمرة", "Hajj & Umrah", "حج، عمرة"),
      other,
    ],
  },
  {
    id: "subscriptions", nameAr: "اشتراكات رقمية", nameEn: "Digital subscriptions", icon: "📱", color: "#14b8a6",
    group: "spending", kinds: SPENDING,
    guide: "اشتراكات الخدمات الرقمية الشخصية. برنامج مدفوع للشغل في work. اشتراك الجيم والنادي في entertainment، والنت والموبايل في bills.",
    subs: [
      sub("streaming", "مشاهدة", "Streaming", "نتفليكس، شاهد، واتش ات، يوتيوب بريميوم"),
      sub("music", "موسيقى", "Music", "أنغامي، سبوتيفاي"),
      sub("apps_software", "تطبيقات وبرامج", "Apps & software", "آي كلاود، جوجل ون، برنامج، تطبيق"),
      sub("ai_tools", "أدوات AI", "AI tools", "شات جي بي تي، كلود، جيميناي"),
      other,
    ],
  },
  {
    id: "smoking", nameAr: "تدخين", nameEn: "Smoking", icon: "🚬", color: "#6b7280",
    group: "spending", kinds: SPENDING,
    guide: "سجاير وفيب وشيشة ومستلزماتهم.",
    subs: [
      sub("cigarettes", "سجاير", "Cigarettes", "سجاير، علبة سجاير، خرطوشة سجاير"),
      sub("vape", "فيب", "Vape", "فيب، ليكويد، بود"),
      sub("shisha", "شيشة ومعسل", "Shisha", "شيشة، معسل، حجر شيشة"),
      other,
    ],
  },
  {
    id: "gifts_occasions", nameAr: "هدايا ومناسبات", nameEn: "Gifts & occasions", icon: "🎁", color: "#f43f5e",
    group: "spending", kinds: SPENDING,
    guide: "هدايا ونقطة وعيدية بتديها، ومصاريف مناسباتك أنت: جواز وخطوبة، عيد ميلاد، سبوع، عزا. الزكاة والصدقة في charity.",
    subs: [
      sub("gifts", "هدايا", "Gifts", "هدية، بوكيه ورد"),
      sub("social_duty", "نقطة وواجب", "Social duty", "نقطة في فرح، نقطة مولود، واجب عزا"),
      sub("eidiya", "عيدية", "Eidiya", "عيدية"),
      sub("marriage", "جواز وخطوبة", "Marriage", "شبكة، مهر، فرح، قاعة، المأذون، كتب الكتاب، جهاز العروسة"),
      sub("family_events", "مناسبات عائلية", "Family events", "عيد ميلاد، تورتة، سبوع، عقيقة، مصاريف عزا"),
      other,
    ],
  },
  {
    id: "charity", nameAr: "زكاة وصدقات", nameEn: "Zakat & charity", icon: "🤲", color: "#059669",
    group: "spending", kinds: SPENDING,
    guide: "زكاة وصدقة وتبرعات وأضحية وكفالة.",
    subs: [
      sub("zakat", "زكاة", "Zakat", "زكاة المال، زكاة الفطر"),
      sub("sadaqa", "صدقة وتبرعات", "Charity & donations", "صدقة، تبرع، مستشفى 57357، الجامع"),
      sub("udhiya", "أضحية", "Udhiya", "أضحية، خروف العيد، صك أضحية"),
      sub("sponsorship", "كفالة", "Sponsorship", "كفالة يتيم، كفالة أسرة"),
      other,
    ],
  },
  {
    id: "family_support", nameAr: "دعم الأهل", nameEn: "Family support", icon: "👨‍👩‍👧", color: "#e11d48",
    group: "spending", kinds: SPENDING,
    guide: "فلوس بتديها لحد من أهلك من غير ما تقول اتصرفت في إيه: مصروف البيت للزوجة، فلوس لأمك أو أبوك أو أخوك. لو الغرض متقال (دوا أمي، مدرسة ابني) يبقى فئة الغرض.",
    subs: [
      sub("household_allowance", "مصروف البيت", "Household allowance", "مصروف البيت، مصروف الشهر للمدام"),
      sub("parents", "الوالدين", "Parents", "اديت ماما، بعت لبابا، حولت لأمي"),
      sub("relatives", "إخوات وقرايب", "Siblings & relatives", "اديت أخويا، بعت لأختي، خالتي"),
      other,
    ],
  },
  {
    id: "financial_fees", nameAr: "أقساط ورسوم مالية", nameEn: "Instalments & fees", icon: "🧾", color: "#7c3aed",
    group: "spending", kinds: SPENDING,
    guide: "قسط مش متقال هو قسط إيه، وفوايد القروض والكروت، ورسوم البنك والتحويل، وغرامات التأخير، والتأمين غير الصحي وغير العربية. أي قسط معروف هو قسط إيه بيروح لفئة الحاجة نفسها.",
    subs: [
      sub("installment", "قسط غير محدد", "Instalment (unspecified)", "دفعت القسط، قسط فاليو، قسط كونتكت، من غير ما يتقال قسط إيه"),
      sub("interest", "فوايد", "Interest", "فوايد القرض، فوايد الكارت"),
      sub("bank_fees", "رسوم بنكية وتحويلات", "Bank & transfer fees", "رسوم البنك، مصاريف التحويل، رسوم انستاباي، عمولة السحب"),
      sub("late_fees", "غرامات تأخير", "Late fees", "غرامة تأخير"),
      sub("insurance", "تأمين", "Insurance", "تأمين على الحياة، بوليصة"),
      other,
    ],
  },
  {
    id: "government", nameAr: "حكومة وضرايب", nameEn: "Government & taxes", icon: "🏛️", color: "#78716c",
    group: "spending", kinds: SPENDING,
    guide: "أوراق ومستندات حكومية، ضرايب، تأمينات اجتماعية، وغرامات غير مخالفات المرور.",
    subs: [
      sub("documents", "أوراق ومستندات", "Documents", "بطاقة، جواز سفر، شهادة ميلاد، توثيق، الشهر العقاري"),
      sub("taxes", "ضرايب", "Taxes", "ضرايب، ضريبة عقارية، إقرار"),
      sub("social_insurance", "تأمينات", "Social insurance", "تأمينات اجتماعية"),
      sub("fines", "غرامات", "Fines", "غرامة حكومية، غرامة إدارية"),
      other,
    ],
  },
  {
    id: "work", nameAr: "مصاريف شغل", nameEn: "Work expenses", icon: "💼", color: "#64748b",
    group: "spending", kinds: SPENDING,
    guide: "اللي بتصرفه على شغلك أو مشروعك: مستلزمات، إيجار المحل أو المكتب، بضاعة وخامات، مرتبات العمالة، استضافة وبرامج.",
    subs: [
      sub("supplies_tools", "مستلزمات وأدوات", "Supplies & tools", "عدة، أدوات مكتب، حبر"),
      sub("workplace_rent", "إيجار محل أو مكتب", "Workplace rent", "إيجار المحل، إيجار المكتب، مساحة عمل"),
      sub("goods_materials", "بضاعة وخامات", "Goods & materials", "بضاعة، خامات، توريد"),
      sub("marketing", "إعلانات وتسويق", "Marketing", "إعلان ممول، حملة إعلانات، تسويق المحل"),
      sub("shipping", "شحن بضاعة", "Business shipping", "شركة شحن البضاعة، توصيل طلبات العملاء، مندوب شحن للمحل"),
      sub("wages", "مرتبات وعمالة", "Wages", "مرتب الصبي، يومية العمال، أجرة صنايعي للشغل"),
      sub("software_hosting", "استضافة وبرامج", "Hosting & software", "تخزين سحابي لملفات الشغل، اشتراك برامج للمكتب، استضافة، دومين، سيرفر، API"),
      other,
    ],
  },
  {
    id: "pets", nameAr: "حيوانات أليفة", nameEn: "Pets", icon: "🐾", color: "#a855f7",
    group: "spending", kinds: SPENDING,
    guide: "أكل وعلاج ومستلزمات الحيوانات الأليفة.",
    subs: [
      sub("food", "أكل", "Food", "أكل القطة أو الكلب، دراي فود"),
      sub("vet", "بيطري", "Vet", "دكتور بيطري، تطعيم"),
      sub("supplies", "مستلزمات", "Supplies", "رمل، طوق، قفص"),
      other,
    ],
  },
  {
    id: "misc", nameAr: "حاجات تانية", nameEn: "Other spending", icon: "📦", color: "#94a3b8",
    group: "spending", kinds: SPENDING,
    guide: "آخر اختيار: مصروف واضح إنه حصل ومالوش مكان في أي فئة تانية.",
    subs: [sub("tips", "بقشيش", "Tips", "بقشيش، إكرامية"), other],
  },

  // ─── Movements: money that changed place, neither spent nor earned ───
  {
    id: "debts", nameAr: "سلف وديون", nameEn: "Loans & debts", icon: "🤝", color: "#b45309",
    group: "movement", kinds: ["loan"],
    guide: "سلفة لحد أو من حد، ورجوعها، وقرض من بنك أو شركة وأقساطه. flow=out لما الفلوس تطلع منك (سلّفت، سددت، دفعت قسط القرض) و in لما تدخلك (استلفت، رجعولك، أخدت قرض).",
    subs: [
      sub("people", "مع أشخاص", "With people", "سلفت، استلفت، رجعلي، رديت له، اللي عليه"),
      sub("bank_loan", "قرض بنك أو شركة", "Bank loan", "قرض، قسط القرض، قسط البنك"),
      other,
    ],
  },
  {
    id: "gam3eya", nameAr: "جمعيات", nameEn: "Gam3eya", icon: "🔄", color: "#0d9488",
    group: "movement", kinds: ["gam3eya"],
    guide: "الجمعية: flow=out لما تدفع القسط، in لما تقبضها.",
    subs: [other],
  },
  {
    id: "own_money", nameAr: "بين حساباتي", nameEn: "Between my accounts", icon: "🏧", color: "#0284c7",
    group: "movement", kinds: ["own_transfer", "cash_transfer", "card_payment"],
    guide: "فلوسك بتتنقل من مكان لمكان عندك: سحب أو إيداع كاش (kind=cash_transfer)، تحويل بين حساباتك ومحافظك أو تحويش (own_transfer)، سداد كارت الائتمان (card_payment).",
    subs: [
      sub("cash", "سحب وإيداع كاش", "Cash in & out", "سحبت من الماكينة، سحب ATM، إيداع كاش، حطيت الكاش في محفظة جيبي"),
      sub("between_accounts", "تحويل بين حساباتي", "Between accounts", "شحنت المحفظة، حولت من حسابي لحسابي"),
      sub("card_payment", "سداد كارت ائتمان", "Card payment", "سددت الكريدت، سددت الفيزا المشتريات"),
      sub("savings", "تحويش وادخار", "Savings", "حطيت في التحويشة، حوشت، ادخرت"),
      other,
    ],
  },
  {
    id: "people_transfer", nameAr: "تحويلات شخصية", nameEn: "Personal transfers", icon: "💸", color: "#10b981",
    group: "movement", kinds: ["personal_transfer"],
    guide: "فلوس راحت لشخص أو جت منه، مش من أهلك، ومش متقال هي إيه (مش سلفة ولا هدية ولا تمن حاجة). لو السبب متقال استخدم فئته.",
    subs: [other],
  },
  {
    id: "investment", nameAr: "استثمار", nameEn: "Investment", icon: "📊", color: "#ca8a04",
    group: "movement", kinds: ["investment"],
    guide: "شراء أو بيع أصل للاستثمار: دهب، أسهم، شهادات، عقار للاستثمار، عملات رقمية. flow=out للشراء و in للبيع. أرباحه دخل في returns.",
    subs: [
      sub("gold", "دهب", "Gold", "دهب، سبيكة، جنيه دهب"),
      sub("stocks_funds", "أسهم وصناديق", "Stocks & funds", "أسهم، بورصة، ثاندر، صندوق"),
      sub("certificates", "شهادات وودائع", "Certificates", "شهادة بنك، شهادة ادخار، وديعة، أذون خزانة"),
      sub("real_estate", "عقارات", "Real estate", "أرض، شقة للاستثمار"),
      sub("crypto", "عملات رقمية", "Crypto", "بيتكوين، USDT"),
      other,
    ],
  },

  // ─── Income: where money came from ───
  {
    id: "salary", nameAr: "مرتب", nameEn: "Salary", icon: "💵", color: "#22c55e",
    group: "income", kinds: INCOME,
    guide: "دخل الوظيفة: المرتب والحوافز والأوفر تايم والبدلات والمعاش.",
    subs: [
      sub("base", "مرتب", "Salary", "المرتب نزل، قبضت مرتبي، الراتب"),
      sub("bonus", "حوافز ومكافآت", "Bonus", "حافز، مكافأة، بونص، أرباح سنوية من الشغل"),
      sub("overtime", "أوفر تايم", "Overtime", "أوفر تايم، سهر"),
      sub("allowance", "بدلات", "Allowances", "بدل انتقال، بدل وجبة"),
      sub("pension", "معاش", "Pension", "المعاش"),
      other,
    ],
  },
  {
    id: "business_income", nameAr: "دخل الشغل الحر والمشروع", nameEn: "Freelance & business", icon: "💻", color: "#06b6d4",
    group: "income", kinds: INCOME,
    guide: "دخل من شغل حر أو مشروع أو سبوبة أو عمولة أو مبيعات.",
    subs: [
      sub("projects", "شغل وعملاء", "Projects & clients", "عميل دفع، مشروع، فري لانس"),
      sub("commission", "عمولات", "Commission", "عمولة، سمسرة"),
      sub("side_gig", "سبوبة", "Side gig", "سبوبة، شغلانة، شغل جانبي"),
      sub("sales", "مبيعات", "Sales", "إيراد المحل، بعت بضاعة"),
      other,
    ],
  },
  {
    id: "returns", nameAr: "عوائد وإيجارات", nameEn: "Returns & rent", icon: "📈", color: "#84cc16",
    group: "income", kinds: INCOME,
    guide: "أرباح استثمار، عائد شهادة أو وديعة، وإيجار داخل لك.",
    subs: [
      sub("profits", "أرباح استثمار", "Investment profits", "كسبت في البورصة، أرباح أسهم"),
      sub("interest", "عوائد شهادات وفوايد", "Interest", "عائد الشهادة، فوايد الوديعة"),
      sub("rent_income", "إيجار داخل", "Rent received", "قبضت إيجار الشقة أو المحل اللي مأجره"),
      other,
    ],
  },
  {
    id: "gifts_received", nameAr: "هدايا وفلوس من الأهل", nameEn: "Gifts received", icon: "🧧", color: "#16a34a",
    group: "income", kinds: INCOME,
    guide: "فلوس جاتلك هدية: عيدية، نقطة، هدية، أو مساعدة من أهلك.",
    subs: [
      sub("eidiya", "عيدية", "Eidiya", "خدت عيدية"),
      sub("nokta", "نقطة", "Nokta", "قبضت نقطة الفرح، جالي نقوط، استلمت نقطة المولود"),
      sub("cash_gift", "هدية", "Cash gift", "جالي هدية فلوس"),
      sub("family_help", "مساعدة من الأهل", "Family help", "بابا اداني، أخويا بعتلي، مصروف من أهلي"),
      other,
    ],
  },
  {
    id: "other_income", nameAr: "دخل تاني", nameEn: "Other income", icon: "💰", color: "#15803d",
    group: "income", kinds: INCOME,
    guide: "أي دخل تاني: بيع حاجة، كاش باك وجوايز، دعم حكومي، واسترداد فلوس حاجة مش متسمية.",
    subs: [
      sub("sold_item", "بيع حاجة", "Sold item", "بعت الموبايل القديم، بعت العربية"),
      sub("cashback_prizes", "كاش باك وجوايز", "Cashback & prizes", "كاش باك، جايزة، كسبت مسابقة"),
      sub("government_support", "دعم حكومي", "Government support", "تكافل وكرامة، منحة"),
      sub("refund", "استرداد", "Refund", "رجعولي فلوسي، استرداد"),
      other,
    ],
  },
];

const BY_ID = new Map(TAXONOMY.map((category) => [category.id, category]));

export function taxonomyCategory(id: string | null | undefined): TaxonomyCategory | undefined {
  return id ? BY_ID.get(id) : undefined;
}

export function taxonomySub(categoryId: string | null | undefined, subId: string | null | undefined): TaxonomySub | undefined {
  return taxonomyCategory(categoryId)?.subs.find((item) => item.id === subId);
}

/** True when an event of this ledger kind may be filed under the category. */
export function categoryAllowsKind(categoryId: string, kind: MovementKind): boolean {
  return taxonomyCategory(categoryId)?.kinds.includes(kind) ?? false;
}

/** The category an event of a movement kind belongs to; undefined for spending, refund and income. */
export function categoryOfMovementKind(kind: MovementKind): TaxonomyCategory | undefined {
  return TAXONOMY.find((category) => category.group === "movement" && category.kinds.includes(kind));
}

export const TAXONOMY_CATEGORY_IDS: readonly string[] = TAXONOMY.map((category) => category.id);
