import type { SmartUserProfile } from "./user-profile-service";
import {
  normalizeRelationship,
  getRelationshipSuffix,
} from "../lib/relationship-normalizer";

export interface KnownPerson {
  name: string;
  relationship: string; // ابن/ابنة, زوج/زوجة, والد/والدة, صديق, etc.
  category: string; // default expense category when transferring to them
  subCategory: string;
}

export interface PersonalContext {
  knownPeople: KnownPerson[];
  knownSubscriptions: string[];
  favoriteSpendingPlaces: string[];
  hasCar: boolean;
  carType: string | null;
  smokes: boolean;
  salaryDay: number | null;
}

/**
 * Build a personal context dictionary from the user's onboarding answers.
 * This is used by the classification engine and report personalization.
 */
export function buildPersonalContext(
  profile: SmartUserProfile,
): PersonalContext {
  const lifestyle = profile.lifestyleInfo as Record<string, any>;
  const knownPeople: KnownPerson[] = [];

  // Children names
  const childrenNames: string[] = Array.isArray(lifestyle.childrenNames)
    ? lifestyle.childrenNames
    : [];
  for (const name of childrenNames) {
    if (name && typeof name === "string" && name.trim()) {
      knownPeople.push({
        name: name.trim(),
        relationship: "ابن/ابنة",
        category: "تحويلات",
        subCategory: "مصاريف الأولاد",
      });
    }
  }

  // Partner name
  const partnerName = lifestyle.partnerName;
  if (partnerName && typeof partnerName === "string" && partnerName.trim()) {
    knownPeople.push({
      name: partnerName.trim(),
      relationship: "زوج/زوجة",
      category: "تحويلات",
      subCategory: "شريك الحياة",
    });
  }

  // Regular contacts (non-family)
  const contacts: string[] = Array.isArray(lifestyle.regularContacts)
    ? lifestyle.regularContacts
    : [];
  for (const name of contacts) {
    if (name && typeof name === "string" && name.trim()) {
      knownPeople.push({
        name: name.trim(),
        relationship: "شخص معروف",
        category: "تحويلات",
        subCategory: "تحويلات شخصية",
      });
    }
  }

  // Supports others (from earlier question: parents, siblings, etc.)
  const supportsOthers: string[] = Array.isArray(lifestyle.supportsOthers)
    ? lifestyle.supportsOthers
    : [];
  const supportsMap: Record<string, { rel: string; sub: string }> = {
    parents: { rel: "والد/والدة", sub: "دعم الأهل" },
    siblings: { rel: "أخ/أخت", sub: "دعم الإخوة" },
    partner: { rel: "شريك/شريكة", sub: "شريك الحياة" },
    extended: { rel: "أقارب", sub: "دعم الأقارب" },
  };

  // Siblings names (new question)
  const siblingsNames: string[] = Array.isArray(lifestyle.siblingsNames)
    ? lifestyle.siblingsNames
    : [];
  for (const name of siblingsNames) {
    if (name && typeof name === "string" && name.trim()) {
      knownPeople.push({
        name: name.trim(),
        relationship: "أخ/أخت",
        category: "تحويلات",
        subCategory: "دعم الإخوة",
      });
    }
  }

  // Parents names (new question)
  const parentsNames: string[] = Array.isArray(lifestyle.parentsNames)
    ? lifestyle.parentsNames
    : [];
  for (const name of parentsNames) {
    if (name && typeof name === "string" && name.trim()) {
      knownPeople.push({
        name: name.trim(),
        relationship: "والد/والدة",
        category: "تحويلات",
        subCategory: "دعم الأهل",
      });
    }
  }

  // Pet names (for fun context)
  const petNames: string[] = Array.isArray(lifestyle.petNames)
    ? lifestyle.petNames
    : [];
  for (const name of petNames) {
    if (name && typeof name === "string" && name.trim()) {
      knownPeople.push({
        name: name.trim(),
        relationship: "حيوان أليف",
        category: "متنوعات",
        subCategory: "مصاريف الحيوانات",
      });
    }
  }

  // Dynamic Contacts (added from chat)
  const dynamicContacts = Array.isArray(lifestyle.dynamicContacts)
    ? lifestyle.dynamicContacts
    : [];
  for (const contact of dynamicContacts) {
    if (contact && typeof contact === "object" && contact.name) {
      const rawRel =
        contact.rawRelationship || contact.relationship || "شخص معروف";
      const rel = typeof rawRel === "string" ? rawRel.trim() : "شخص معروف";
      const normalized = normalizeRelationship(rel);
      const name = contact.name.trim();
      const subCat = rel && rel !== "شخص معروف" ? `${name} ${rel}` : name;

      knownPeople.push({
        name,
        relationship: rel,
        category: normalized.category,
        subCategory: subCat,
      });
    }
  }

  const subscriptions: string[] = Array.isArray(lifestyle.subscriptions)
    ? lifestyle.subscriptions
    : [];
  const places: string[] = Array.isArray(lifestyle.favoriteSpendingPlaces)
    ? lifestyle.favoriteSpendingPlaces
    : [];

  return {
    knownPeople,
    knownSubscriptions: subscriptions,
    favoriteSpendingPlaces: places,
    hasCar: Boolean(lifestyle.carOwnership),
    carType: lifestyle.carType || null,
    smokes: Boolean(lifestyle.smoking),
    salaryDay: Number((profile.financialInfo as any).salaryDay) || null,
  };
}

/**
 * Build a structured prompt text from personal context.
 * This is injected into the AI system prompt for classification and reports.
 */
export function buildPersonalContextPrompt(ctx: PersonalContext): string {
  if (ctx.knownPeople.length === 0 && ctx.knownSubscriptions.length === 0) {
    return "";
  }

  const lines: string[] = [
    "═══ السياق الشخصي للمستخدم (استخدمه لفهم الجمل بشكل أدق) ═══",
  ];

  if (ctx.knownPeople.length > 0) {
    lines.push("أشخاص يعرفهم المستخدم:");
    for (const person of ctx.knownPeople) {
      const suffix = getRelationshipSuffix(person.relationship);
      const possibleSubCategories =
        person.subCategory !== suffix
          ? `"${person.category} > ${person.subCategory}" أو "${person.category} > ${suffix}"`
          : `"${person.category} > ${person.subCategory}"`;
      lines.push(
        `  - ${person.name} (${person.relationship}) → إذا ذُكر اسمه، صنّف كـ ${possibleSubCategories}`,
      );
    }
    lines.push(
      `تعليمة: إذا قال المستخدم "بعتت فلوس لـ[اسم]" أو "أديت [اسم]" واسم الشخص من القائمة أعلاه، اذكر العلاقة في الوصف. مثلاً: "تحويل لـ ${getRelationshipSuffix("ابن") || "ابنك"} محمد" بدلاً من "تحويل".`,
    );
  }

  if (ctx.knownSubscriptions.length > 0) {
    const subMap: Record<string, string> = {
      netflix: "Netflix",
      shahid: "شاهد VIP",
      spotify: "Spotify",
      youtube_premium: "YouTube Premium",
      gym: "جيم/نادي",
      internet: "إنترنت منزلي",
      phone_plan: "باقة موبايل",
      insurance: "تأمين",
    };
    const named = ctx.knownSubscriptions.map((s) => subMap[s] || s).join("، ");
    lines.push(`اشتراكات ثابتة معروفة: ${named}`);
  }

  if (ctx.hasCar) {
    lines.push(
      `لديه سيارة${ctx.carType ? ` (${ctx.carType})` : ""} — أي ذكر لبنزين/صيانة/غسيل عربية يصنف تلقائياً كـ "مواصلات > سيارة خاصة"`,
    );
  }

  if (ctx.smokes) {
    lines.push(`المستخدم مدخن — أي ذكر لسجاير/دخان/تبغ يصنف كـ "صحة > تدخين"`);
  }

  // Salary day context
  if (ctx.salaryDay && ctx.salaryDay > 0) {
    lines.push(`مرتب المستخدم بينزل يوم ${ctx.salaryDay} من كل شهر.`);
    lines.push(
      `تعليمة: لو المستخدم ذكر "المرتب" أو "القبض" أو "الراتب"، صنّفه كـ "دخل" وتاريخه يوم ${ctx.salaryDay} من الشهر الحالي.`,
    );
  }

  return lines.join("\n");
}

/**
 * Build a summary of known people for report personalization.
 * Used in the monthly AI report to provide a personal touch.
 */
export function buildFamilyReportContext(ctx: PersonalContext): string {
  const children = ctx.knownPeople.filter((p) => p.relationship === "ابن/ابنة");
  const partner = ctx.knownPeople.find((p) => p.relationship === "زوج/زوجة");
  const contacts = ctx.knownPeople.filter(
    (p) => p.relationship === "شخص معروف",
  );

  const lines: string[] = [];

  if (children.length > 0) {
    lines.push(`أسماء الأطفال: ${children.map((c) => c.name).join("، ")}`);
  }
  if (partner) {
    lines.push(`شريك الحياة: ${partner.name}`);
  }
  if (contacts.length > 0) {
    lines.push(
      `أشخاص يحول لهم بانتظام: ${contacts.map((c) => c.name).join("، ")}`,
    );
  }

  if (lines.length === 0) return "";

  return [
    "═══ العلاقات الشخصية ═══",
    ...lines,
    "",
    "تعليمات التخصيص الشخصي: عند تحليل التحويلات، اذكر أسماء الأشخاص المعروفين.",
    'مثلاً: "أديت ولادك (محمد وزياد) 2000 ج.م الشهر ده" بدلاً من "صرفت 2000 ج.م على تحويلات".',
  ].join("\n");
}
