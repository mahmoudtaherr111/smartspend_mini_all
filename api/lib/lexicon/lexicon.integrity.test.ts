import { describe, expect, it } from "vitest";
import { CATEGORIES, getSubcategoriesFor } from "../category-registry";
import { normalizeArabic } from "../unified-normalizer";
import { DICTIONARY_CONFLICTS } from "./dictionary";
import { lexiconEntries } from "./index";

/**
 * The lexicon is data, and these are its schema checks. Adding a word is one line in a
 * data file; if that line names a category the taxonomy does not have, files a word the
 * other sources file elsewhere, or teaches a verb a category, this fails and says which.
 */
const entries = lexiconEntries();
const categoryNames = new Set(CATEGORIES.map((category) => category.name_ar));
/** Their subcategory is a person's name, not a taxonomy value. */
const PERSON_CATEGORIES = new Set(["العائلة", "أصدقاء", "موظفين"]);

/**
 * Verbs say which way money moved, never what it was for, so none of them names a
 * category. "اديت" used to file under متنوعات and "قبضت" under مرتب; "حولت لماما 1000
 * للبيت" is spending on family, and "قبضت الجمعية" is savings coming back.
 */
const DIRECTION_VERBS = [
  "دفعت", "صرفت", "اشتريت", "سددت", "حاسبت", "اديت", "أديت", "إديت", "ديت", "عطيت", "اعطيت",
  "حولت", "بعت", "بعتت", "ارسلت", "رسلت", "شلت", "فكيت", "قبضت", "استلمت", "شحنت",
  "طيرت", "بعزقت", "فرتكت", "عزمت", "رميت", "سلفت", "استلفت",
].map((verb) => normalizeArabic(verb));

describe("the lexicon", () => {
  it("files every entry under a category the taxonomy has", () => {
    const unknown = entries
      .filter((entry) => !categoryNames.has(entry.category))
      .map((entry) => `${entry.source}: ${entry.phrase} → ${entry.category}`);
    expect(unknown).toEqual([]);
  });

  it("files every subcategory under the category that owns it", () => {
    const unknown = entries
      .filter((entry) =>
        entry.subCategory &&
        entry.subCategory !== "عام" &&
        !PERSON_CATEGORIES.has(entry.category) &&
        categoryNames.has(entry.category) &&
        !getSubcategoriesFor(entry.category).some((sub) => sub.name_ar === entry.subCategory))
      .map((entry) => `${entry.source}: ${entry.phrase} → ${entry.category}/${entry.subCategory}`);
    expect(unknown).toEqual([]);
  });

  it("never gives one word two categories inside the dictionary", () => {
    // The first category used to win in silence: مخالفة read as transport, never as the
    // government paperwork it is filed under a few sections later.
    expect(DICTIONARY_CONFLICTS).toEqual([]);
  });

  it("never gives one word two categories across its sources", () => {
    const categoriesOf = new Map<string, Set<string>>();
    const seenIn = new Map<string, string[]>();
    for (const entry of entries) {
      const key = normalizeArabic(entry.phrase).toLowerCase().trim();
      if (!categoriesOf.has(key)) {
        categoriesOf.set(key, new Set());
        seenIn.set(key, []);
      }
      categoriesOf.get(key)!.add(entry.category);
      seenIn.get(key)!.push(`${entry.source}:${entry.category}`);
    }
    const conflicts = [...categoriesOf.entries()]
      .filter(([, categories]) => categories.size > 1)
      .map(([key]) => `${key}: ${seenIn.get(key)!.join(", ")}`);
    expect(conflicts).toEqual([]);
  });

  it("gives no direction verb a category", () => {
    const verbs = entries
      .filter((entry) => entry.source === "dictionary")
      .filter((entry) => DIRECTION_VERBS.includes(normalizeArabic(entry.phrase)))
      .map((entry) => `${entry.phrase} → ${entry.category}`);
    expect(verbs).toEqual([]);
  });
});
