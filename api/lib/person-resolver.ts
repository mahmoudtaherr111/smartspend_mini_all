import { normalizeRelationship, getRelationshipSuffix } from "./relationship-normalizer";
import { matchArabicPhrase, normalizeArabic, levenshtein } from "./fuzzy-match";
import { isKareemPersonContext } from "./egyptian-names-dictionary";
import { extractPeople } from "./entity-extractor";

export interface KnownPersonForResolver {
  name: string;
  relationship?: string;
  category?: string;
  subCategory?: string;
  isSilenced?: boolean;
}

export interface PersonResolution {
  name: string | null;
  relationship: string | null;
  category: string | null;
  subCategory: string | null;
  isKnown: boolean;
  shouldLearn: boolean;
  needsClarification: boolean;
  clarificationQuestion?: string;
}

const PERSON_CATEGORIES = new Set(["العائلة", "أصدقاء", "موظفين"]);

export const NON_PERSON_TERMS = new Set([
  // وظائف ومقدمي خدمات
  "السباك", "سباك", "السايس", "سايس", "السواق", "سواق", "السائق", "سائق", "البواب", "بواب",
  "الكهربائي", "كهربائي", "النقاش", "نقاش", "النجار", "نجار", "الدكتور", "دكتور", "شغال", "شغالة", "شغاله", "الشغالة", "الشغاله",
  // أماكن ومحلات
  "الصيدلية", "صيدلية", "المطعم", "مطعم", "السوبر", "ماركت", "سوبرماركت", "المحل", "الشغل", "البيت", "القهوة", "القهوه", "قهوة", "قهوه", "كافيه", "الكافيه", "المكتب", "الفرن", "فرن", "مخبز", "المخبز",
  // سلع وخدمات وأشياء مادية
  "فلوس", "جنيه", "الف", "ألف", "نت", "النت", "كهربا", "الكهربا", "كهرباء", "الكهرباء",
  "مياه", "المياه", "ميه", "المية", "غاز", "الغاز", "بنزين", "البنزين", "بنزينة", "البنزينة",
  "علاج", "العلاج", "دوا", "الدوا", "دواء", "الدواء", "هدية", "هديه", "الهدية", "الهديه",
  "عيد", "العيد", "ميلاد", "الميلاد", "سبوبة", "سبوبه", "فريلانس", "تذكرة", "التذكرة",
  "فواتير", "الفاتورة", "فاتورة", "شحن", "رصيد", "مصاريف", "المصاريف", "رسوم", "خضار", "خضرة", "خضار", "فاكهة", "فاكهه", "دليفري",
  "ميكروباص", "أتوبيس", "اتوبيس", "مترو", "تاكسي", "تكسي", "مواصلات", "المواصلات",
  // أطعمة وأشربة
  "لحمة", "لحم", "لبن", "لوز", "لفلف", "لقمة", "لبنة", "شاورما", "شورما", "حمص", "فلافل", "كبدة", "مشروب", "مشاريب",
  // أفعال رياضية وهوايات
  "كورة", "كوره", "تنس", "سباحة", "جيم",
  // حروف وجمل زمنية وعلاقات
  "لحظة", "لاحقاً", "لما", "به", "بي", "في", "على", "علي", "علاقة", "التوضيح",
  // ضمائر
  "انا", "انت", "هو", "هي", "احنا", "هما", "هم", "هن", "نفسي",
  "منه", "منها", "منهم", "معاه", "معاها", "معاهم", "ليها", "ليهم", "لينا", "فيها", "فيهم", "بيها", "بيهم",
  // كلمات عامة وأفعال شائعة
  "اديت", "أديت", "خدت", "اخدت", "أخدت", "استلمت", "قبضت", "بعت", "بعتت", "حولت", "صرفت", "جبت", "دفعت", "عطيت", "أعطيت", "عطي", "أعطي",
  "لعبت", "لبست", "عشان", "عشانك", "علشان", "بتاع", "بتاعتي", "بتاعتك", "بتاعته", "بتاعتنا",
  "جالي", "جاني", "رجعلي", "رجعولي", "وصلني", "وصلتلي",
  // كلمات خدمية وبنكية
  "تحويل", "فوري", "انستاباي", "انستا", "باي", "شحن", "كاش", "فيزا", "محفظة", "محفظه",
  // مصطلحات مالية
  "سلف", "سلفة", "سلفه", "دين", "ديون", "قرض", "جمعية", "جمعيه", "الجمعية", "الجمعيه", "المقاول", "مقاول", "قسط", "اقساط", "أقساط", "ايجار", "إيجار", "الايجار", "الإيجار",
  "مرتب", "المرتب", "راتب", "الراتب", "معاش", "المعاش", "بونص", "البونص", "مكافأة", "مكافاه", "المكافأة", "كاشباك", "الكاشباك",
  // مصطلحات خيرية ودينية لا تعتبر أشخاص
  "صدقة", "صدقه", "زكاة", "زكاه", "تبرع", "لله", "مسجد", "جامع", "فقير", "فقراء", "الفقراء", "محتاجين", "المحتاجين"
]);

const RELATION_ALIASES: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: "أخ", aliases: ["اخويا", "أخويا", "اخوي", "اخو", "اخ", "أخ"] },
  { canonical: "أخت", aliases: ["اختي", "أختي", "اخت", "أخت"] },
  { canonical: "أب", aliases: ["ابويا", "أبويا", "بابا", "والدي", "اب"] },
  { canonical: "أم", aliases: ["امي", "أمي", "ماما", "والدتي", "ام"] },
  { canonical: "ابن", aliases: ["ابني", "ابن", "ولدي"] },
  { canonical: "ابنة", aliases: ["بنتي", "بنت"] },
  { canonical: "زوج", aliases: ["جوزي", "زوجي", "جوز"] },
  { canonical: "زوجة", aliases: ["مراتي", "زوجتي", "مرات"] },
  { canonical: "صديق", aliases: ["صاحبي", "صديقي", "صاحب", "صديق"] },
  { canonical: "صديقة", aliases: ["صاحبتي", "صحبتي", "صديقتي", "صاحبة", "صديقة"] },
  { canonical: "زميل", aliases: ["زميلي", "زميل"] },
  { canonical: "زميلة", aliases: ["زميلتي", "زميلة"] },
  { canonical: "مدير", aliases: ["مديري", "المدير", "مدير"] },
  { canonical: "موظف", aliases: ["موظف عندي", "موظفي", "موظف", "عامل عندي", "عامل"] },
  { canonical: "حارس", aliases: ["البواب", "بواب", "حارس"] },
  { canonical: "سائق", aliases: ["السواق", "سواق", "السائق", "سائق"] },
  { canonical: "قريب", aliases: ["قريبي", "قريب", "قريبتي", "قرايبي"] },
];

function compactArabic(value: string): string {
  return normalizeArabic(String(value || ""))
    .replace(/[^\u0600-\u06FFa-zA-Z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function cleanPersonName(value: string | null | undefined, text?: string): string | null {
  const cleaned = compactArabic(String(value || ""))
    .replace(/^[وفب]\s+/, "")  // Strip conjunction/preposition prefix "و X" or "ف X"
    .replace(/^[وف](?=[\u0600-\u06FF]{2,}$)/, "") // Strip "و" directly attached to name like "وكريم"
    .replace(/^(?:ل|لل|الى|إلى)\s*/u, "")
    .replace(/^ل(?=[\u0600-\u06FF]{2,}$)/u, "")
    .trim();

  if (!cleaned || cleaned.length < 2) return null;
  if (/^[\d\u0660-\u0669\u06F0-\u06F9]+$/.test(cleaned.replace(/[\s.,]/g, ""))) return null;
  
  if (NON_PERSON_TERMS.has(cleaned)) {
    // Exception: Allow "علي" and "على" if they were originally prefixed with a preposition (e.g., "لعلي", "من علي")
    const original = String(value || "").trim();
    const hasPrepositionPrefix = 
      original.startsWith("ل") || 
      original.startsWith("من") || 
      original.startsWith("مع") ||
      original.startsWith("ب");
    if ((cleaned === "علي" || cleaned === "على") && hasPrepositionPrefix) {
      return cleaned;
    }
    if (text && (cleaned === "علي" || cleaned === "على")) {
      const reg = new RegExp(`(?:^|\\s)(?:ل|لل|من|مع|ب)${cleaned}(?:\\s|$)`);
      if (reg.test(text)) {
        return cleaned;
      }
    }
    return null;
  }
  return cleaned;
}

function contextAroundName(text: string, name: string): string {
  // Exclude explicit clarification blocks that do not mention the target name
  // This prevents generic clarifications from being applied to all unknown people
  // by inferRelationshipFromText.
  let safeText = text;
  const parenRegex = /\([^)]+\)/g;
  let match;
  while ((match = parenRegex.exec(text)) !== null) {
    if (!match[0].includes(name)) {
      safeText = safeText.replace(match[0], " ");
    }
  }

  const normalizedText = compactArabic(safeText);
  const normalizedName = compactArabic(name);
  const clarificationIndex = normalizedText.indexOf("التوضيح");
  const clarificationTail =
    clarificationIndex >= 0 ? normalizedText.slice(clarificationIndex) : "";

  if (clarificationTail) {
    const clarificationNameIndex = clarificationTail.indexOf(normalizedName);
    if (clarificationNameIndex >= 0) {
      const separators = [" و", "،", ",", ";"];
      const segmentStart = separators.reduce((start, sep) => {
        const idx = clarificationTail.lastIndexOf(sep, clarificationNameIndex);
        return idx >= 0 ? Math.max(start, idx + sep.length) : start;
      }, 0);
      return clarificationTail
        .slice(
          Math.max(segmentStart, clarificationNameIndex - 10),
          clarificationNameIndex + normalizedName.length + 34,
        )
        .trim();
    }
  }

  const index = normalizedText.indexOf(normalizedName);
  if (index < 0) return `${normalizedText} ${clarificationTail}`.trim();
  return `${normalizedText.slice(Math.max(0, index - 60), index + normalizedName.length + 60)} ${clarificationTail}`.trim();
}

export function inferRelationshipFromText(text: string, name?: string | null): string | null {
  const target = name ? contextAroundName(text, name) : compactArabic(text);

  for (const entry of RELATION_ALIASES) {
    for (const alias of entry.aliases) {
      if (matchArabicPhrase(target, alias)) {
        return entry.canonical;
      }
    }
  }

  return null;
}

function findKnownPerson(
  name: string,
  knownPeople: KnownPersonForResolver[],
): KnownPersonForResolver | null {
  // First pass: exact phrase match
  for (const person of knownPeople) {
    if (!person?.name) continue;
    if (matchArabicPhrase(name, person.name) || matchArabicPhrase(person.name, name)) {
      return person;
    }

    const first = person.name.split(/\s+/)[0];
    if (first && first.length >= 2 && matchArabicPhrase(name, first)) {
      return person;
    }
  }

  // Second pass: fuzzy match (Levenshtein distance for typos)
  // Stricter thresholds to prevent false positives on short names:
  //   length < 4  → exact match only (dist = 0) — prevents "عمر" matching "عمرو"
  //   length 4-5  → dist ≤ 1
  //   length ≥ 6  → dist ≤ 2
  const normTarget = normalizeArabic(name).toLowerCase();
  for (const person of knownPeople) {
    if (!person?.name) continue;
    const normPersonName = normalizeArabic(person.name).toLowerCase();
    
    const dist = levenshtein(normTarget, normPersonName);
    const maxAllowedDist = normPersonName.length >= 6 ? 2 : normPersonName.length >= 4 ? 1 : 0;
    if (dist <= maxAllowedDist) {
      return person;
    }

    // Check first name distance with same strictness
    const first = person.name.split(/\s+/)[0];
    if (first && first.length >= 3) {
      const normFirst = normalizeArabic(first).toLowerCase();
      const firstDist = levenshtein(normTarget, normFirst);
      const firstMaxDist = normFirst.length >= 6 ? 2 : normFirst.length >= 4 ? 1 : 0;
      if (firstDist <= firstMaxDist) {
        return person;
      }
    }
  }

  return null;
}

export function buildPersonSubCategory(name: string, relationship: string): string {
  const normalized = normalizeRelationship(relationship);
  const suffix = getRelationshipSuffix(normalized.normalized, name) || relationship;
  return `${name} ${suffix}`.trim();
}

export function isGenericPersonDescription(name: string): boolean {
  const norm = normalizeArabic(name)
    .replace(/[^\u0600-\u06FF\s]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  const genericWords = new Set([
    "واحد", "واحده", "واحدة", "حد", "شخص", "راجل", "ست", "ناس", "الناس", "حدين", "شخصين", "شخصان",
    "صاحب", "صاحبي", "صاحبتي", "صحبتي", "صديق", "صديقي", "صديقة", "صديقتي", "صحاب", "اصدقاء", "أصدقاء",
    "اخ", "أخ", "اخويا", "أخويا", "اخت", "أخت", "اختي", "أختي", "اخوات", "إخوة", "اخوه", "أخوة",
    "اب", "أب", "ابويا", "أبويا", "بابا", "ام", "أم", "امي", "أمي", "ماما", "اهل", "أهل", "عيلة", "عائلة",
    "ابن", "بنت", "بنتي", "ابني", "اولاد", "أولاد", "ابناء", "أبناء", "بنات", "زوج", "زوجة", "جوزي", "مراتي",
    "سواق", "السواق", "بواب", "البواب", "شغال", "شغالة", "شغاله", "دكتور", "الدكتور", "صنايعي",
    "موظف", "موظفين", "عامل", "عمال", "مدير", "مديري", "زميل", "زميلي", "زميلتي", "زملاء",
    "عندي", "عنده", "عن", "بتاع", "بتاعتي", "بتاعته"
  ]);

  const words = norm.split(/\s+/);
  return words.every(w => genericWords.has(w));
}

export function pickPersonCandidate(
  aiExtractedPerson: string | null | undefined,
  transactionText: string,
  knownNames: string[],
): string | null {
  const all = pickAllPersonCandidates(aiExtractedPerson, transactionText, knownNames);
  return all.length > 0 ? all[0] : null;
}

export function pickAllPersonCandidates(
  aiExtractedPerson: string | null | undefined,
  transactionText: string,
  knownNames: string[],
): string[] {
  const candidates: string[] = [];
  // If AI provided a specific person, prioritize it
  if (aiExtractedPerson && typeof aiExtractedPerson === "string") {
    const cleanAi = cleanPersonName(aiExtractedPerson, transactionText);
    // Even if it's not in knownNames, trust the AI if it extracted *something*
    // but maybe validate it looks like a name
    if (cleanAi && cleanAi.length >= 2 && !/^[\d\u0660-\u0669\u06F0-\u06F9]+$/.test(cleanAi.replace(/[\s.,]/g, ""))) {
      candidates.push(cleanAi);
    }
  }

  // Fallback to extraction from text
  const extracted = extractPeople(transactionText, knownNames).map((name) =>
    cleanPersonName(name, transactionText),
  );
  
  for (const e of extracted) {
     if (e && !candidates.includes(e)) {
        candidates.push(e);
     }
  }

  // Final fallback: Directed verb regex
  if (candidates.length === 0) {
    const directedMatch = transactionText.match(
      /(?:^|\s)[وف]?(?:اديت|أديت|إديت|عطيت|أعطيت|اعطيت|حولت|بعت|سلفت|دفعتل|دفعت\s+ل|خدت|اخدت|أخدت|أخذت|اخذت|استلمت|قبضت|استلفت|جالي|جاني|رجعلي|رجعولي|إداني|اداني|بعتلي|وصلني)\s+(?:ل|لـ|لل|من)?\s*([\u0600-\u06FF]{2,})/u,
    );
    if (directedMatch?.[1]) {
      const cleanedMatch = cleanPersonName(directedMatch[1], transactionText);
      if (cleanedMatch && !candidates.includes(cleanedMatch)) {
         candidates.push(cleanedMatch);
      }
    }
  }

  return candidates;
}

export function resolvePersonForTransaction(input: {
  candidateName?: string | null;
  transactionText: string;
  originalText: string;
  knownPeople: KnownPersonForResolver[];
  aiRelationship?: string | null;
}): PersonResolution {
  const name = cleanPersonName(input.candidateName, input.transactionText);
  if (!name) {
    return {
      name: null,
      relationship: null,
      category: null,
      subCategory: null,
      isKnown: false,
      shouldLearn: false,
      needsClarification: false,
    };
  }

  // Context-aware brand resolution for "كريم" (Careem vs. Karim the person)
  if (name === "كريم" || name === "كرييم") {
    if (!isKareemPersonContext(input.transactionText)) {
      return {
        name: null,
        relationship: null,
        category: null,
        subCategory: null,
        isKnown: false,
        shouldLearn: false,
        needsClarification: false,
      };
    }
  }

  // Bypass clarification for generic relationship descriptions (e.g. "واحد صاحبي")
  // Do NOT auto-assign to a specific contact even if only one matches the relationship.
  // "واحد صاحبي" means "a friend" (indefinite) — could be anyone, not necessarily
  // the one registered contact.
  if (isGenericPersonDescription(name)) {
    const explicitRelationship =
      inferRelationshipFromText(input.transactionText, name) ||
      inferRelationshipFromText(input.originalText, name) ||
      name;

    const normalized = normalizeRelationship(explicitRelationship);
    
    const matchingContacts = input.knownPeople.filter(p => 
      p.relationship && normalizeRelationship(p.relationship).normalized === normalized.normalized
    );

    if (matchingContacts.length > 1) {
      const names = matchingContacts.map(p => p.name).join(" ولا ");
      return {
        name: null,
        relationship: null,
        category: null,
        subCategory: null,
        isKnown: false,
        shouldLearn: false,
        needsClarification: true,
        clarificationQuestion: `تقصد مين؟ ${names}؟`,
      };
    }

    return {
      name: null,
      relationship: normalized.normalized,
      category: normalized.category,
      subCategory: normalized.normalized === "شخص معروف" ? "تحويلات شخصية" : normalized.normalized,
      isKnown: false,
      shouldLearn: false,
      needsClarification: false,
    };
  }

  const known = findKnownPerson(name, input.knownPeople);
  
  // Look for inline relationship next to the name, e.g. "محمود (صاحبي)"
  const looseName = name.replace(/[اأإآ]/g, "[اأإآ]").replace(/[يى]/g, "[يى]").replace(/[هة]/g, "[هة]");
  const inlineRegex = new RegExp(`(?:^|\\s)(?:و|ف|ب|ل|لل|من|مع)?\\s*(${looseName})\\s*\\(([^)]+)\\)`);
  const inlineMatch = input.originalText.match(inlineRegex);
  
  if (inlineMatch && inlineMatch[2]) {
    const inlineRel = inlineMatch[2].trim();
    const normalized = normalizeRelationship(inlineRel);
    return {
      name: name,
      relationship: normalized.normalized,
      category: normalized.category,
      subCategory: buildPersonSubCategory(name, normalized.normalized),
      isKnown: false,
      shouldLearn: true,
      needsClarification: false,
    };
  }

  // Look for explicit relationship in parentheses at the end of the text
  const explicitContexts = extractExplicitPeopleContext(input.originalText);
  let explicitMatch = explicitContexts.find(p => p.name === name || matchArabicPhrase(p.name, name));

  let explicitRelationship: string | null | undefined = explicitMatch?.relationship;

  // Fallback to inference if no explicit relationship was found
  if (!explicitRelationship) {
    explicitRelationship = inferRelationshipFromText(input.transactionText, name) ||
    inferRelationshipFromText(input.originalText, name);
  }
  
  if (!explicitRelationship && input.aiRelationship) {
    // Only trust AI relationship if it actually appears in the text, to prevent random guessing bypassing clarification
    const normalizedAiRel = compactArabic(input.aiRelationship);
    if (compactArabic(input.originalText).includes(normalizedAiRel)) {
       explicitRelationship = input.aiRelationship;
    }
  }

  if (known) {
    const relationship =
      explicitRelationship || known.relationship || known.subCategory || "شخص معروف";
    const normalized = normalizeRelationship(relationship);
    
    // EVOLUTION: Known person's stored category ALWAYS wins.
    // Previously, we'd fall back to normalized.category if known.category
    // wasn't in PERSON_CATEGORIES — causing "عماد" to go to "عائلة"
    // when his stored category was "أصدقاء".
    const category = known.category && PERSON_CATEGORIES.has(known.category)
      ? known.category
      : (PERSON_CATEGORIES.has(normalized.category) ? normalized.category : "أصدقاء");
    
    const subCategory =
      known.subCategory && known.subCategory.includes(known.name)
        ? known.subCategory
        : buildPersonSubCategory(known.name, relationship);

    return {
      name: known.name,
      relationship,
      category,
      subCategory,
      isKnown: true,
      shouldLearn: false,
      needsClarification: false,
    };
  }

  if (explicitRelationship) {
    const normalized = normalizeRelationship(explicitRelationship);
    return {
      name,
      relationship: normalized.normalized,
      category: normalized.category,
      subCategory: buildPersonSubCategory(name, normalized.normalized),
      isKnown: false,
      shouldLearn: true,
      needsClarification: false,
    };
  }

  // If the name ITSELF is a recognized relationship (e.g. "عمي")
  const selfNormalized = normalizeRelationship(name);
  if (["العائلة", "أصدقاء", "موظفين"].includes(selfNormalized.category)) {
    return {
      name,
      relationship: selfNormalized.normalized,
      category: selfNormalized.category,
      subCategory: buildPersonSubCategory(name, selfNormalized.normalized),
      isKnown: false,
      shouldLearn: true, // we implicitly learned they have this relation
      needsClarification: false,
    };
  }

  // Check if this person is silenced (user previously skipped clarification)
  const silencedMatch = input.knownPeople.find(p =>
    p.isSilenced === true && (
      matchArabicPhrase(name, p.name) || matchArabicPhrase(p.name, name) ||
      normalizeArabic(name).toLowerCase() === normalizeArabic(p.name).toLowerCase()
    )
  );

  if (silencedMatch) {
    return {
      name: silencedMatch.name,
      relationship: "جهة اتصال عامة",
      category: "تحويل",
      subCategory: "تحويلات شخصية",
      isKnown: true,
      shouldLearn: false,
      needsClarification: false,
    };
  }

  return {
    name,
    relationship: null,
    category: null,
    subCategory: null,
    isKnown: false,
    shouldLearn: false,
    needsClarification: true,
    clarificationQuestion: `مين ${name}؟ (أخوك، صديقك، موظف عندك...)`,
  };
}

export function extractExplicitPeopleContext(text: string): KnownPersonForResolver[] {
  const matches = Array.from(text.matchAll(/\(([^)]+)\)/g));
  if (matches.length === 0) return [];

  const results: KnownPersonForResolver[] = [];

  const relationRootWords = new Set([
    "اخ", "اخو", "اخويا", "أخويا", "أخ", "اخت", "أخت", "اختي", "أختي",
    "صاحب", "صاحبه", "صاحبة", "صاحبتي", "صحبتي", "صاحبك", "صحاب", "صاحبي",
    "صديق", "صديقه", "صديقة", "صديقتي", "صديقي",
    "زميل", "زميله", "زميلة", "زميلتي", "زميلي",
    "ام", "أم", "امي", "أمي", "ماما", "والده", "والدة", "والدتي", "والدته",
    "اب", "أب", "ابو", "أبو", "ابويا", "أبويا", "والد", "والدي", "والده", "بابا",
    "ابن", "ابني", "بنت", "بنتي", "ولد", "ولدي",
    "زوج", "زوجي", "جوز", "جوزي", "زوجة", "زوجتي", "مرات", "مراتي",
    "عم", "عمي", "عمه", "عمة", "عمتي", "خال", "خالي", "خاله", "خالة", "خالتي", "جد", "جدي", "جده", "جدة", "جدتي",
    "مدير", "مديري", "موظف", "موظفي", "عامل", "عامله", "عاملة",
    "حارس", "بواب", "البواب", "سواق", "السواق", "قريب", "قريبي", "قرايب", "قريبتي"
  ]);

  const relationModifiers = new Set([
    "عندي", "عنده", "عن", "من", "في", "مع", "بتاع", "بتاعتي", "صاحبي", "صاحبتي", "صاحبه", "صاحبة", "صاحبه", "صاحبتك"
  ]);

  for (const match of matches) {
    const insideParen = match[1].trim();
    const words = insideParen.split(/\s+/).filter(Boolean);
    let i = 0;
    let currentNameWords: string[] = [];
    
    while (i < words.length) {
      const rawWord = words[i];
      const word = rawWord.replace(/[،,؛;]/g, "").trim();
      const isConnector = ["و", "،", ",", "؛", ";"].includes(rawWord) || rawWord === "و";
      
      if (!word || isConnector) {
        i++;
        continue;
      }
      
      const cleanWord = normalizeArabic(word).toLowerCase();
      const isRelationRoot = relationRootWords.has(cleanWord) || relationRootWords.has(word);
      
      if (isRelationRoot) {
        let name = currentNameWords.join(" ").trim();
        name = name.replace(/^[و،,؛;]\s*/, "").replace(/[و،,؛;]\s*$/, "").trim();
        
        if (name) {
          let relationshipWords: string[] = [word];
          i++;
          while (i < words.length) {
            const rawNextWord = words[i];
            const nextWord = rawNextWord.replace(/[،,؛;]/g, "").trim();
            const isNextConnector = ["و", "،", ",", "؛", ";"].includes(rawNextWord) || rawNextWord === "و";
            
            if (!nextWord || isNextConnector) {
              break;
            }
            
            const nextClean = normalizeArabic(nextWord).toLowerCase();
            const isNextRelation = relationRootWords.has(nextClean) || relationRootWords.has(nextWord);
            const isNextModifier = relationModifiers.has(nextClean) || relationModifiers.has(nextWord);
            
            if (isNextRelation || isNextModifier) {
              relationshipWords.push(nextWord);
              i++;
            } else {
              break;
            }
          }
          
          const relationship = relationshipWords.join(" ").trim();
          const normalized = normalizeRelationship(relationship);
          
          results.push({
            name: name,
            relationship: normalized.normalized,
            category: normalized.category,
            subCategory: buildPersonSubCategory(name, normalized.normalized)
          });
          
          currentNameWords = [];
        } else {
          i++;
        }
      } else {
        currentNameWords.push(word);
        i++;
      }
    }
  }

  return results;
}

export function extractExplicitPersonContext(text: string): KnownPersonForResolver | null {
  const people = extractExplicitPeopleContext(text);
  return people.length > 0 ? people[0] : null;
}
