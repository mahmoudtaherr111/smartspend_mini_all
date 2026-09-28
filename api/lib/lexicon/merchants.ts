/**
 * Brands and merchant names, the names that are also everyday words or people, the payment
 * rails, and the context rules that settle an ambiguous word. Part of the one lexicon
 * (`api/lib/lexicon/index.ts`).
 */
/**
 * Strategy 2: Merchant & Brand Registry (0 tokens, 100% confidence)
 * ─────────────────────────────────────────────────────────────────
 * Maps well-known Egyptian and global brand names to exact categories.
 * When a merchant name is detected, the category is determined instantly
 * with absolute certainty, completely bypassing the AI.
 */
export const MERCHANT_REGISTRY: Record<
  string,
  { category: string; subCategory: string }
> = {
  // ── Pharmacies & Health ──
  العزبي: { category: "صحة", subCategory: "صيدلية" },
  "صيدلية العزبي": { category: "صحة", subCategory: "صيدلية" },
  "صيدليات العزبي": { category: "صحة", subCategory: "صيدلية" },
  رشدي: { category: "صحة", subCategory: "صيدلية" },
  "صيدلية رشدي": { category: "صحة", subCategory: "صيدلية" },
  سيف: { category: "صحة", subCategory: "صيدلية" },
  "صيدلية سيف": { category: "صحة", subCategory: "صيدلية" },
  // ── Gas Stations & Fuel ──
  وطنية: { category: "مواصلات", subCategory: "بنزين" },
  "بنزينة وطنية": { category: "مواصلات", subCategory: "بنزين" },
  توتال: { category: "مواصلات", subCategory: "بنزين" },
  موبيل: { category: "مواصلات", subCategory: "بنزين" },
  شيل: { category: "مواصلات", subCategory: "بنزين" },
  بنزينه: { category: "مواصلات", subCategory: "بنزين" },
  المحطه: { category: "مواصلات", subCategory: "بنزين" },
  "امارات مصر": { category: "مواصلات", subCategory: "بنزين" },
  كووبرتف: { category: "مواصلات", subCategory: "بنزين" },
  // ── Supermarkets & Grocery ──
  كارفور: { category: "أكل وشرب", subCategory: "بقالة" },
  سبينيس: { category: "أكل وشرب", subCategory: "بقالة" },
  "مترو ماركت": { category: "أكل وشرب", subCategory: "بقالة" },
  "فتح الله": { category: "أكل وشرب", subCategory: "بقالة" },
  كازيون: { category: "أكل وشرب", subCategory: "بقالة" },
  "هايبر وان": { category: "أكل وشرب", subCategory: "بقالة" },
  "اولاد رجب": { category: "أكل وشرب", subCategory: "بقالة" },
  بيم: { category: "أكل وشرب", subCategory: "بقالة" },
  "خير زمان": { category: "أكل وشرب", subCategory: "بقالة" },
  // ── Fast Food & Restaurants ──
  ماك: { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  ماكدونالدز: { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  كنتاكي: { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  هارديز: { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  "برجر كينج": { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  "بيتزا هت": { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  بافلو: { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  الشبراوي: { category: "أكل وشرب", subCategory: "مطعم" },
  "ابو طارق": { category: "أكل وشرب", subCategory: "مطعم" },
  "كشري التحرير": { category: "أكل وشرب", subCategory: "مطعم" },
  "بيتزا كينج": { category: "أكل وشرب", subCategory: "وجبات سريعة" },
  "صبحي كابر": { category: "أكل وشرب", subCategory: "مطعم" },
  // ── E-Commerce & Shopping ──
  امازون: { category: "تسوق", subCategory: "عام" },
  أمازون: { category: "تسوق", subCategory: "عام" },
  نون: { category: "تسوق", subCategory: "عام" },
  جوميا: { category: "تسوق", subCategory: "عام" },
  "شي ان": { category: "تسوق", subCategory: "ملابس" },
  "شي إن": { category: "تسوق", subCategory: "ملابس" },
  زارا: { category: "تسوق", subCategory: "ملابس" },
  "اتش اند ام": { category: "تسوق", subCategory: "ملابس" },
  ديفاكتو: { category: "تسوق", subCategory: "ملابس" },
  اديداس: { category: "تسوق", subCategory: "ملابس" },
  نايكي: { category: "تسوق", subCategory: "ملابس" },
  // ── Telecom ──
  فودافون: { category: "فواتير", subCategory: "شحن رصيد" },
  اورنج: { category: "فواتير", subCategory: "شحن رصيد" },
  اتصالات: { category: "فواتير", subCategory: "شحن رصيد" },
  وي: { category: "فواتير", subCategory: "إنترنت" },
  // ── Subscriptions ──
  نتفلكس: { category: "اشتراكات", subCategory: "منصات مشاهدة" },
  سبوتيفاي: { category: "اشتراكات", subCategory: "موسيقى" },
  شاهد: { category: "اشتراكات", subCategory: "منصات مشاهدة" },
  "يوتيوب بريميوم": { category: "اشتراكات", subCategory: "منصات مشاهدة" },
  // ── Transport Apps ──
  اوبر: { category: "مواصلات", subCategory: "أوبر/كريم" },
  كريم: { category: "مواصلات", subCategory: "أوبر/كريم" },
  سويفل: { category: "مواصلات", subCategory: "أتوبيس" },
  اندرايفر: { category: "مواصلات", subCategory: "أوبر/كريم" },
  ديدي: { category: "مواصلات", subCategory: "أوبر/كريم" },
  // ── BNPL / Fintech ──
  فاليو: { category: "أقساط وفوايد", subCategory: "أقساط" },
  سهوله: { category: "أقساط وفوايد", subCategory: "أقساط" },
  خزنه: { category: "أقساط وفوايد", subCategory: "أقساط" },
  فوري: { category: "فواتير", subCategory: "عام" },
  انستاباي: { category: "تحويل", subCategory: "انستاباي" },
  "فودافون كاش": { category: "تحويل", subCategory: "فودافون كاش" },
  "اورنج كاش": { category: "تحويل", subCategory: "فودافون كاش" },
  "أورنج كاش": { category: "تحويل", subCategory: "فودافون كاش" },
  "اتصالات كاش": { category: "تحويل", subCategory: "فودافون كاش" },
  // ── Cafes ──
  ستاربكس: { category: "أكل وشرب", subCategory: "قهوة وكافيه" },
  سيلانترو: { category: "أكل وشرب", subCategory: "قهوة وكافيه" },
  كوستا: { category: "أكل وشرب", subCategory: "قهوة وكافيه" },
  ميكاتو: { category: "أكل وشرب", subCategory: "قهوة وكافيه" },
  ريدبول: { category: "أكل وشرب", subCategory: "مشروبات" },
  "ريد بول": { category: "أكل وشرب", subCategory: "مشروبات" },
  // ── Education ──
  المنصوره: { category: "تعليم", subCategory: "جامعة" },
  يوديمي: { category: "تعليم", subCategory: "كورسات" },
  كورسيرا: { category: "تعليم", subCategory: "كورسات" },
};

/**
 * Merchant names that are also a person's name or an everyday word ("كريم" the ride or a
 * face cream, "سيف" the pharmacy or a friend, "شيل" the fuel station or "carry"). A hit
 * on one is never trusted to save on its own.
 */
export const AMBIGUOUS_MERCHANTS = new Set([
  "كريم", "سيف", "شيل", "بيم", "موبيل", "وطنية", "رشدي", "نون", "شاهد", "فوري", "ماك", "توتال", "المحطه",
]);

/** The subcategories that name how money moved (a card, a wallet, a bank), not what for. */
export const PAYMENT_RAIL_SUBCATEGORIES = new Set(["تحويل بنكي", "انستاباي", "فودافون كاش", "تحويل كاش"]);

export const DISAMBIGUATION_RULES: Record<string, Array<{
  contextPattern: RegExp;
  category: string;
  subCategory: string;
}>> = {
  "عربية": [
    { contextPattern: /فول|كبد[ةه]|خضار|بطاطس|طعمي[ةه]|بيض|لبن/, category: "أكل وشرب", subCategory: "مطعم" },
    { contextPattern: /اشتريت|جبت|جديد|مستعمل/, category: "تسوق", subCategory: "أجهزة إلكترونية" },
    { contextPattern: /طفل|اطفال|أطفال|بيبي|حضان[ةه]|عربان[ةه]/, category: "أطفال", subCategory: "عام" },
  ],
  "عربيه": [
    { contextPattern: /فول|كبد[ةه]|خضار|بطاطس|طعمي[ةه]|بيض|لبن/, category: "أكل وشرب", subCategory: "مطعم" },
    { contextPattern: /اشتريت|جبت|جديد|مستعمل/, category: "تسوق", subCategory: "أجهزة إلكترونية" },
    { contextPattern: /طفل|اطفال|أطفال|بيبي|حضان[ةه]|عربان[ةه]/, category: "أطفال", subCategory: "عام" },
  ],
  "نور": [
    { contextPattern: /^(?!.*(?:كهربا|نور\s+القطع|قطع\s+النور|سداد|فاتورة|عداد|شركة|فواتير|دفع)).*(?:(?:سلفت|اديت|أديت|حولت|بعت|سلفت|عطيت|سلكت|صفيت|صفّيت|طلعت|بعتت|رديت|وديت|رجعت|فكيت|خدت|اخدت).*(?:نور)|(?:نور).*(?:سلفت|اديت|أديت|حولت|بعت|سلفت|عطيت|سلكت|صفيت|صفّيت|طلعت|بعتت|رديت|وديت|رجعت|فكيت|خدت|اخدت))/, category: "تحويل", subCategory: "أشخاص" },
  ],
  "سيف": [
    { contextPattern: /^(?!.*(?:صيدلي[ةه]|صيدليات|دوا|علاج|روشت[ةه]|روشته)).*(?:(?:سلفت|اديت|أديت|حولت|بعت|سلفت|عطيت|سلكت|صفيت|صفّيت|طلعت|بعتت|رديت|وديت|رجعت|فكيت|خدت|اخدت).*(?:سيف)|(?:سيف).*(?:سلفت|اديت|أديت|حولت|بعت|سلفت|عطيت|سلكت|صفيت|صفّيت|طلعت|بعتت|رديت|وديت|رجعت|فكيت|خدت|اخدت))/, category: "تحويل", subCategory: "أشخاص" },
  ],
  // Brand names that are also everyday words: Careem the ride vs a face cream,
  // Shell the station vs a shawl.
  "كريم": [
    { contextPattern: /(?:^|\s)(?:لل|ل|ال)?(?:وش|شعر|بشره|جسم|ايد)(?:ي)?(?=\s|$)|مرطب|واقي|تفتيح|حلاق[ةه]|صيدلي[ةه]|كوافير/, category: "عناية شخصية", subCategory: "مستحضرات وعناية" },
  ],
  "شيل": [
    { contextPattern: /جاكيت|جاكت|طرح[ةه]|فستان|لبس|هدوم|شال/, category: "تسوق", subCategory: "ملابس" },
  ],
  "تذكرة": [
    { contextPattern: /سينما|فيلم/, category: "ترفيه", subCategory: "سينما" },
    { contextPattern: /طيران|طيار[ةه]|flight/i, category: "مواصلات", subCategory: "طيران" },
  ],
  "تذكره": [
    { contextPattern: /سينما|فيلم/, category: "ترفيه", subCategory: "سينما" },
    { contextPattern: /طيران|طيار[ةه]|flight/i, category: "مواصلات", subCategory: "طيران" },
  ],
  "شراب": [
    { contextPattern: /شربت|مشروب|عصير|عصاير/, category: "أكل وشرب", subCategory: "مشروبات" },
  ],
  // "أكل" is a category anchor in the subcategory map, so it answered before anything
  // more specific could: "جبت أكل للقطة" was filed as أكل وشرب because the generic food
  // word sits in an earlier layer than القطة does. The animal is the specific noun here.
  "اكل": [
    {
      // The prefix group is what keeps "نقطه" from reading as a cat: a word boundary
      // written as \b does not work between Arabic letters, since JS \w is ASCII-only.
      contextPattern:
        /(?:^|[^؀-ۿ])(?:ال|لل|ل|و|ب)*(?:قط[هة]|قطط|قطتي|كلب|كلاب|كلبي|هر[هة]|عصفور|عصافير|بيطري)/,
      category: "حيوانات أليفة",
      subCategory: "أكل",
    },
  ],
  // A bare "كارت" in the dialect is phone credit far more often than a bank card:
  // "جبت كارت بـ ٢٥" is a recharge card, while the payment sense is spoken as
  // "كارت فيزا" (caught by the bigram layer) or "بالكارت" (the instrument, not the thing
  // bought) — both excluded here so they keep their تحويل meaning.
  "كارت": [
    {
      contextPattern:
        /^(?!.*(?:بالكارت|بالفيزا|بالبطاق|فيزا|ماستر|ائتمان|بنكي))(?=.*(?:شحن|رصيد|موبايل|تليفون|فون|خط|فودافون|اورنج|اتصالات|باقه|جبت|اشتريت|شريت|خدت|طلبت)).*/,
      category: "فواتير",
      subCategory: "شحن رصيد",
    },
  ],
  "كفر": [
    { contextPattern: /عربي?[ةه]|كاوتش|إطار|اطار|تاير|tire/i, category: "مواصلات", subCategory: "صيانة عربية" },
  ],
  "المنصورة": [
    { contextPattern: /سافرت|روحت|خروج[ةه]|مصيف|رحل[ةه]/, category: "ترفيه", subCategory: "سفر" },
  ],
  "المنصوره": [
    { contextPattern: /سافرت|روحت|خروج[ةه]|مصيف|رحل[ةه]/, category: "ترفيه", subCategory: "سفر" },
  ],
  "مشروع": [
    { contextPattern: /ركبت|نزلت|موقف|سواق|ميكروباص|اجرة|أجرة/, category: "مواصلات", subCategory: "أتوبيس" },
    { contextPattern: /بزنس|شغل|استثمار|شراكة|ارباح|أرباح|افتتاح/, category: "استثمار", subCategory: "أسهم" },
  ],
  // Cash taken from a card is an ATM withdrawal, not a bank transfer.
  "فيزا": [
    { contextPattern: /سحبت|سحب|atm|مكن[ةه]|ماكين[ةه]/i, category: "تحويل", subCategory: "سحب ATM" },
  ],
  "حساب": [
    { contextPattern: /مطعم|كافيه|قهوة|اكل|شرب|سوبر|ماركت|دكان|محل/, category: "أكل وشرب", subCategory: "مطعم" },
    { contextPattern: /بنك|فيزا|كارت|تحويل|سحب|ايداع|إيداع/, category: "تحويل", subCategory: "تحويل بنكي" },
  ],
};
