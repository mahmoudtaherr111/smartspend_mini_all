/**
 * From a reading to what the ledger stores today.
 *
 * The engine reads into taxonomy v2 (`contracts/taxonomy.ts`): ids, with the nature of the
 * money (`kind`, `flow`) apart from its purpose. The ledger, the budgets, the statistics
 * and the apps still store and compare the names of `contracts/categories.ts`, and loan and
 * gam3eya standing is still read from those names. Until stored rows carry ids
 * (docs/decisions/0052-understanding-engine.md, "What comes next"), this file is the one
 * place that turns a v2 answer into a stored pair, a row type and a direction.
 *
 * The mapping is total: every (category, sub) of v2 lands on a pair that exists in
 * `CATEGORIES` (`bridge.test.ts` holds that). Where v1 is coarser, two v2 answers share a
 * stored pair; nothing is lost for later, because the v2 ids are kept with the reading and
 * on the saved row's metadata.
 */
import type { MovementKind } from "../../../contracts/ledger-movement";
import type { Flow } from "./contract";
import { foldForMatch } from "./numbers";

export interface StoredFiling {
  /** `name_ar` of a category in `contracts/categories.ts`. */
  category: string;
  /** `name_ar` of one of its subcategories. */
  subCategory: string;
}

export interface StoredShape extends StoredFiling {
  /** The row type the save procedures accept. */
  type: "expense" | "income" | "transfer" | "investment";
  /** Set for transfers and investments (which way the money moved) and for a refund (`incoming`). */
  direction?: "incoming" | "outgoing";
}

const f = (category: string, subCategory: string): StoredFiling => ({ category, subCategory });

/** `category/sub` → stored pair; `category/*` is the category's fallback. */
const FILING: Record<string, StoredFiling> = {
  "groceries/vegetables_fruits": f("أكل وشرب", "بقالة"),
  "groceries/meat_poultry_fish": f("أكل وشرب", "لحوم ودواجن"),
  "groceries/bakery": f("أكل وشرب", "مخبوزات"),
  "groceries/*": f("أكل وشرب", "بقالة"),

  "dining/restaurant": f("أكل وشرب", "مطعم"),
  "dining/fast_food": f("أكل وشرب", "وجبات سريعة"),
  "dining/cafe": f("أكل وشرب", "قهوة وكافيه"),
  "dining/delivery": f("أكل وشرب", "دليفري"),
  "dining/sweets_snacks": f("أكل وشرب", "سناكس"),
  "dining/*": f("أكل وشرب", "عام"),

  "transport/ride_apps": f("مواصلات", "أوبر/كريم"),
  "transport/metro": f("مواصلات", "مترو"),
  "transport/microbus_bus": f("مواصلات", "ميكروباص"),
  "transport/train_intercity": f("مواصلات", "قطر"),
  "transport/*": f("مواصلات", "عام"),

  "car/fuel": f("مواصلات", "بنزين"),
  "car/maintenance": f("مواصلات", "صيانة عربية"),
  "car/wash_parking_tolls": f("مواصلات", "ركنة"),
  "car/license_fines": f("خدمات حكومية", "رخصة"),
  "car/car_insurance": f("فواتير", "تأمين"),
  "car/car_purchase": f("أقساط وفوايد", "أقساط"),
  "car/*": f("مواصلات", "صيانة عربية"),

  "bills/electricity": f("فواتير", "كهرباء"),
  "bills/water": f("فواتير", "مياه"),
  "bills/gas": f("فواتير", "غاز"),
  "bills/internet_landline": f("فواتير", "إنترنت"),
  "bills/mobile": f("فواتير", "شحن رصيد"),
  "bills/*": f("فواتير", "عام"),

  "housing/rent": f("سكن", "إيجار"),
  "housing/home_purchase": f("أقساط وفوايد", "أقساط"),
  "housing/maintenance": f("سكن", "صيانة"),
  "housing/furniture": f("سكن", "أثاث"),
  "housing/appliances": f("سكن", "أجهزة منزلية"),
  "housing/supplies": f("سكن", "منظفات"),
  "housing/home_services": f("سكن", "خدمات البيت"),
  "housing/building_fees": f("سكن", "صيانة"),
  "housing/*": f("سكن", "عام"),

  "shopping/clothes": f("تسوق", "ملابس"),
  "shopping/shoes_bags": f("تسوق", "أحذية"),
  "shopping/electronics": f("تسوق", "أجهزة إلكترونية"),
  "shopping/accessories": f("تسوق", "إكسسوارات"),
  "shopping/*": f("تسوق", "عام"),

  "personal_care/barber_salon": f("عناية شخصية", "حلاق وكوافير"),
  "personal_care/cosmetics": f("عناية شخصية", "مستحضرات وعناية"),
  "personal_care/*": f("عناية شخصية", "عام"),

  "health/doctor": f("صحة", "دكتور"),
  "health/pharmacy": f("صحة", "صيدلية"),
  "health/lab_scan": f("صحة", "تحاليل"),
  "health/hospital": f("صحة", "مستشفى"),
  "health/dental": f("صحة", "أسنان"),
  "health/optical": f("صحة", "نظارات"),
  "health/*": f("صحة", "عام"),

  "kids/nursery": f("أطفال", "حضانة"),
  "kids/baby_supplies": f("أطفال", "بامبرز ولبن أطفال"),
  "kids/clothes_toys": f("أطفال", "هدوم ولعب"),
  "kids/pocket_money": f("أطفال", "مصروف العيال"),
  "kids/*": f("أطفال", "عام"),

  "education/school_fees": f("تعليم", "مدرسة"),
  "education/university": f("تعليم", "جامعة"),
  "education/tutoring": f("تعليم", "دروس خصوصية"),
  "education/courses": f("تعليم", "كورسات"),
  "education/books_supplies": f("تعليم", "كتب"),
  "education/school_extras": f("تعليم", "مدرسة"),
  "education/*": f("تعليم", "عام"),

  "entertainment/outing": f("ترفيه", "خروجة"),
  "entertainment/cinema_events": f("ترفيه", "سينما"),
  "entertainment/gaming": f("ترفيه", "ألعاب"),
  "entertainment/sports_gym": f("ترفيه", "رياضة وجيم"),
  "entertainment/*": f("ترفيه", "عام"),

  "travel/flights": f("مواصلات", "طيران"),
  "travel/*": f("ترفيه", "سفر"),

  "subscriptions/streaming": f("اشتراكات", "منصات مشاهدة"),
  "subscriptions/music": f("اشتراكات", "موسيقى"),
  "subscriptions/apps_software": f("اشتراكات", "برمجيات"),
  "subscriptions/ai_tools": f("اشتراكات", "أدوات AI"),
  "subscriptions/*": f("اشتراكات", "عام"),

  "smoking/cigarettes": f("تدخين", "سجائر"),
  "smoking/vape": f("تدخين", "فيب/ليكود"),
  "smoking/shisha": f("تدخين", "شيشة/معسل"),
  "smoking/*": f("تدخين", "عام"),

  "gifts_occasions/social_duty": f("هدايا وصدقات", "نقطة وواجب"),
  "gifts_occasions/eidiya": f("هدايا وصدقات", "عيدية"),
  "gifts_occasions/marriage": f("هدايا وصدقات", "فرح/خطوبة"),
  "gifts_occasions/family_events": f("هدايا وصدقات", "عيد ميلاد"),
  "gifts_occasions/*": f("هدايا وصدقات", "عام"),

  "charity/zakat": f("هدايا وصدقات", "زكاة"),
  "charity/udhiya": f("هدايا وصدقات", "أضحية"),
  "charity/*": f("هدايا وصدقات", "صدقة/تبرع"),

  // «عام» on purpose: a person category whose subcategory is not «عام» has that subcategory
  // read as a person's name when the row is saved (`namedPersonOf`); the person travels in
  // `person_mentioned` instead.
  "family_support/*": f("العائلة", "عام"),

  "financial_fees/installment": f("أقساط وفوايد", "أقساط"),
  "financial_fees/interest": f("أقساط وفوايد", "فوايد قروض"),
  "financial_fees/bank_fees": f("أقساط وفوايد", "رسوم بنكية"),
  "financial_fees/insurance": f("فواتير", "تأمين"),
  "financial_fees/*": f("أقساط وفوايد", "عام"),

  "government/documents": f("خدمات حكومية", "توثيق"),
  "government/taxes": f("خدمات حكومية", "ضرائب"),
  "government/*": f("خدمات حكومية", "عام"),

  "work/supplies_tools": f("عمل", "مستلزمات مكتب"),
  "work/software_hosting": f("عمل", "استضافة"),
  "work/*": f("عمل", "عام"),

  "pets/food": f("حيوانات أليفة", "أكل"),
  "pets/vet": f("حيوانات أليفة", "طبيب بيطري"),
  "pets/*": f("حيوانات أليفة", "مستلزمات"),

  "misc/tips": f("متنوعات", "بقشيش"),
  "misc/*": f("متنوعات", "عام"),

  // Movements. Loan and gam3eya standing is read from exactly these pairs today.
  "debts/*": f("تحويل", "دين/سلفة"),
  "gam3eya/*": f("تحويل", "جمعية"),
  "own_money/cash": f("تحويل", "سحب ATM"),
  "own_money/savings": f("تحويل", "ادخار"),
  "own_money/*": f("تحويل", "تحويل بنكي"),
  "people_transfer/*": f("تحويل", "أشخاص"),

  "investment/gold": f("استثمار", "ذهب"),
  "investment/stocks_funds": f("استثمار", "أسهم"),
  "investment/certificates": f("استثمار", "شهادات"),
  "investment/real_estate": f("استثمار", "عقارات"),
  "investment/crypto": f("استثمار", "عملات رقمية"),
  // v1 has no general investment subcategory; certificates is the least wrong of its five.
  "investment/*": f("استثمار", "شهادات"),

  "salary/bonus": f("مرتب", "مكافأة/بونص"),
  "salary/overtime": f("مرتب", "أوفر تايم"),
  "salary/allowance": f("مرتب", "بدلات"),
  "salary/*": f("مرتب", "مرتب أساسي"),

  "business_income/commission": f("عمل حر", "عمولة"),
  "business_income/side_gig": f("عمل حر", "سبوبة"),
  "business_income/*": f("عمل حر", "مشروع"),

  "returns/interest": f("عوائد استثمار", "فوائد"),
  "returns/*": f("عوائد استثمار", "أرباح"),

  "gifts_received/eidiya": f("هدايا وعيديات", "عيدية"),
  "gifts_received/nokta": f("هدايا وعيديات", "نقطة"),
  "gifts_received/cash_gift": f("هدايا وعيديات", "هدية فلوس"),
  "gifts_received/family_help": f("هدايا وعيديات", "هدية فلوس"),
  "gifts_received/*": f("هدايا وعيديات", "عام"),

  "other_income/sold_item": f("دخل آخر", "بيع حاجة"),
  "other_income/cashback_prizes": f("عوائد استثمار", "كاش باك"),
  "other_income/refund": f("دخل آخر", "مرتجعات واسترداد"),
  "other_income/*": f("دخل آخر", "عام"),
};

/** The stored pair of a v2 answer. Unknown ids land on متنوعات/عام, which every screen can show. */
export function storedFiling(category: string, sub: string): StoredFiling {
  return FILING[`${category}/${sub}`] ?? FILING[`${category}/*`] ?? f("متنوعات", "عام");
}

const pairKey = (category: string, subCategory: string) => `${foldForMatch(category)}|${foldForMatch(subCategory)}`;

/**
 * Stored pair → the v2 answer it most likely was, built from `FILING` itself so the two
 * directions cannot drift. Where several v2 answers share a stored pair, the one with a real
 * subcategory wins over `other`, then the one whose category keeps its own fallback under the
 * same stored category (`أقساط وفوايد/أقساط` is `financial_fees/installment`, not the car's
 * purchase that happens to land there too), then the first in the table.
 */
const REVERSE: ReadonlyMap<string, { category: string; sub: string }> = (() => {
  const candidates = new Map<string, Array<{ category: string; sub: string; home: boolean; order: number }>>();
  Object.entries(FILING).forEach(([key, stored], order) => {
    const [category, rawSub] = key.split("/");
    const sub = rawSub === "*" ? "other" : rawSub;
    const home = FILING[`${category}/*`]?.category === stored.category;
    const list = candidates.get(pairKey(stored.category, stored.subCategory)) ?? [];
    list.push({ category, sub, home, order });
    candidates.set(pairKey(stored.category, stored.subCategory), list);
  });
  const best = new Map<string, { category: string; sub: string }>();
  for (const [key, list] of candidates) {
    const [first] = [...list].sort((a, b) =>
      Number(a.sub === "other") - Number(b.sub === "other") || Number(b.home) - Number(a.home) || a.order - b.order);
    best.set(key, { category: first.category, sub: first.sub });
  }
  return best;
})();

/**
 * The v2 answer of a pair stored today (a user's correction rule or dictionary word), or null
 * when the table does not know the pair: a free-text subcategory, or a person category whose
 * subcategory is a name. Compared on folded text, so «إيجار» and «ايجار» are one pair.
 */
export function v2OfStored(category: string, subCategory: string | null | undefined): { category: string; sub: string } | null {
  const found = REVERSE.get(pairKey(category ?? "", subCategory || "عام"));
  return found ? { ...found } : null;
}

/** The row type and direction the save procedures expect for a kind and a flow. */
export function storedType(kind: MovementKind, flow: Flow): Pick<StoredShape, "type" | "direction"> {
  const direction = flow === "in" ? "incoming" : "outgoing";
  switch (kind) {
    case "spending":
      return { type: "expense" };
    case "refund":
      // Money back into the category it left (decision 0010): an expense that came in.
      return { type: "expense", direction: "incoming" };
    case "income":
      return { type: "income" };
    case "investment":
      return { type: "investment", direction };
    default:
      return { type: "transfer", direction };
  }
}

export function storedShape(event: { category: string; sub: string; kind: MovementKind; flow: Flow }): StoredShape {
  // An unnamed refund is income under دخل آخر; a refund of a named thing nets its category.
  if (event.kind === "refund" && event.category === "other_income") {
    return { ...storedFiling(event.category, event.sub), type: "income" };
  }
  return { ...storedFiling(event.category, event.sub), ...storedType(event.kind, event.flow) };
}
