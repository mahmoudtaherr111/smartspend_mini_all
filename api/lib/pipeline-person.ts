/**
 * Who a transaction was paid to or received from, and whether that person decides its
 * category. Split out of `smart-pipeline.ts`: purpose comes first, so a person takes the
 * category only when the sentence names no other purpose
 * (docs/decisions/0008-money-movements-and-taxonomy.md).
 */
import { resolveGovernedTaxonomy } from "./direction-governed-taxonomy";
import { matchArabicPhrase } from "./fuzzy-match";
import { resolvePersonForTransaction } from "./person-resolver";
import { PERSON_CATEGORIES, type ParsedTransaction } from "./rule-engine";
import { normalizeArabicCompact as normalizeArabicString } from "./unified-normalizer";

export type KnownPersonContext = {
  name: string;
  relationship?: string;
  category?: string;
  subCategory?: string;
};

export function hasLoanIntent(text: string): boolean {
  return /(?:سلف|سلفة|سلفه|دين|ديون|قرض|استلف|استلفت)/.test(text);
}

export function isDirectedPersonPayment(text: string, candidateName?: string | null): boolean {
  const compactText = normalizeArabicString(text);
  const compactName = candidateName ? normalizeArabicString(candidateName) : "";
  const hasDirectedVerb = /[وف]?(?:اديت|أديت|إديت|عطيت|أعطيت|اعطيت|حولت|بعت|سلفت|أرسلت|ارسلت|رسلت|دفعت|خدت|اخدت|أخدت|أخذت|اخذت|استلمت|قبضت|استلفت|جالي|جاني|رجعلي|رجعولي|إداني|اداني|بعتلي|وصلني)/.test(
    compactText,
  );
  const hasLamName =
    compactName.length >= 2 &&
    (compactText.includes(`ل${compactName}`) ||
      compactText.includes(`لل${compactName}`) ||
      compactText.includes(`من${compactName}`) ||
      compactText.includes(`مع${compactName}`));

  return hasDirectedVerb || hasLamName;
}

export function shouldResolvePerson(
  transactionText: string,
  candidateName: string | null | undefined,
  category?: string | null,
  knownPeople?: KnownPersonContext[],
): boolean {
  if (!candidateName) return false;
  if (PERSON_CATEGORIES.includes(String(category || ""))) {
    return true;
  }
  
  if (knownPeople && knownPeople.some(p => p.name && (p.name === candidateName || matchArabicPhrase(candidateName, p.name) || matchArabicPhrase(p.name, candidateName)))) {
    return true;
  }

  return isDirectedPersonPayment(transactionText, candidateName);
}

export function applyPersonResolution(
  item: ParsedTransaction,
  candidateName: string | null | undefined,
  transactionText: string,
  originalText: string,
  knownPeople: KnownPersonContext[],
): {
  item: ParsedTransaction;
  needsClarification: boolean;
  clarificationQuestion?: string;
} {
  if (!shouldResolvePerson(transactionText, candidateName, item.category, knownPeople)) {
    return { item, needsClarification: false };
  }

  const resolution = resolvePersonForTransaction({
    candidateName,
    transactionText,
    originalText,
    knownPeople,
    aiRelationship: item.person_relationship,
  });

  if (!resolution.name) {
    return { item, needsClarification: false };
  }

  const next: ParsedTransaction = {
    ...item,
    person_mentioned: resolution.name,
    person_relationship: resolution.relationship || item.person_relationship,
  };

  // The category says what the money was for; the person is recorded beside it
  // (person_mentioned, which the save links to a contact). "دفعت مصاريف مدرسة ابني"
  // is تعليم for ابني, not العائلة — filing it under the person made the education total
  // read zero. Only money handed to someone with no purpose ("اديت ماما 1000") takes
  // the person's category (docs/decisions/0008-money-movements-and-taxonomy.md).
  const isLoan = item.category === "تحويل" && item.subCategory === "دين/سلفة";
  const governedHere = resolveGovernedTaxonomy(transactionText);
  const hasPurpose = !isLoan && hasStatedPurpose(item) && !(governedHere && governedHere.id === "debt");

  if (resolution.needsClarification) {
    if (isLoan || hasLoanIntent(transactionText)) {
      // Who owes whom is what a loan is for, so an unknown person is asked about — but
      // the category stays the loan, and the verb already said which way it moved.
      return {
        item: {
          ...next,
          category: "تحويل",
          subCategory: "دين/سلفة",
          type: "transfer",
          needsReview: true,
        },
        needsClarification: true,
        clarificationQuestion: resolution.clarificationQuestion,
      };
    }
    if (hasPurpose) {
      // The purpose is known; the person is extra detail that can be added later. It is
      // no reason to stop and ask before saving.
      return { item: next, needsClarification: false };
    }
    return {
      item: {
        ...next,
        category: resolution.category && resolution.category !== "متنوعات" ? resolution.category : next.category,
        subCategory: next.category === "تحويل" ? "أشخاص" : next.subCategory,
        confidence: Math.min(next.confidence, 60),
        needsReview: true,
      },
      needsClarification: true,
      clarificationQuestion: resolution.clarificationQuestion,
    };
  }

  if (resolution.category && resolution.subCategory) {
    // A brand that shares the name of someone the user pays directly is not a purpose:
    // "اديت كريم 100" to a friend called Karim is not a Careem ride.
    const purposeIsTheName =
      isDirectedPersonPayment(transactionText, resolution.name) &&
      (item.evidence?.matchKind === "merchant_registry" || item.evidence?.matchKind === "merchant_disambiguated");
    const takesPersonCategory =
      !isLoan &&
      PERSON_CATEGORIES.includes(resolution.category) &&
      (!hasPurpose || purposeIsTheName) &&
      (!governedHere || governedHere.id === "debt");
    if (takesPersonCategory) {
      next.category = resolution.category;
      next.subCategory = resolution.subCategory;
      if (next.type !== "income") next.type = "expense";
    }
    // Money handed to someone the user already told us about, with no other purpose, is
    // filed by what the user taught: that record is the evidence, not whatever word the
    // lexicon happened to match. The giving verb used to carry a category of its own
    // (اديت → متنوعات), and that accident was what kept a known friend from the model.
    const categoryFromKnownPerson = takesPersonCategory && resolution.isKnown;
    next.evidence = next.evidence
      ? {
          ...next.evidence,
          ...(categoryFromKnownPerson ? { matchKind: "known_person" as const, categoryIsFallback: false } : {}),
          personResolved: resolution.isKnown ? "known" : "unknown",
        }
      : next.evidence;
    next.ambiguityFlags = [
      ...(next.ambiguityFlags || []),
      resolution.isKnown ? "person_resolved_known" : "person_resolved_unknown",
    ];
  }

  return { item: next, needsClarification: false };
}

/**
 * Whether the item already names what the money was for, from real evidence rather than
 * a fallback: a category that is neither a catch-all nor a person, reached by a lexicon,
 * merchant, pattern or user-taught match.
 */
export function hasStatedPurpose(item: ParsedTransaction): boolean {
  const generic = ["تحويل", "متنوعات", "أخرى", "غير محدد", "عام", ""];
  if (generic.includes(item.category || "") || PERSON_CATEGORIES.includes(item.category || "")) return false;
  const weakKinds = ["fuzzy", "intent_only", "fallback", "embedding"];
  const kind = item.evidence?.matchKind;
  return !kind || !weakKinds.includes(kind);
}
