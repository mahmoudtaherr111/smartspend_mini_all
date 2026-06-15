import { CATEGORY_DICTIONARY } from "../lib/egyptian-dictionary";
import { normalizeArabic } from "../lib/fuzzy-match";

const SUB_CATEGORY_MAP: Record<string, { category: string; subCategory: string }> = {
  اكل: { category: "أكل وشرب", subCategory: "عام" },
  أكل: { category: "أكل وشرب", subCategory: "عام" },
};

const allContext = "جبت أكل ومواصلات بـ";
const rawWordsForCheck = allContext.split(/\s+/).filter((w) => w.length >= 2);
const distinctCats = new Set<string>();
for (const word of rawWordsForCheck) {
  const norm = normalizeArabic(word).toLowerCase();
  const hitSub = SUB_CATEGORY_MAP[word] || SUB_CATEGORY_MAP[norm];
  if (hitSub) distinctCats.add(hitSub.category);
  const hitDict = CATEGORY_DICTIONARY[word] || CATEGORY_DICTIONARY[norm];
  if (hitDict) distinctCats.add(hitDict);
}
distinctCats.delete("متنوعات");

console.log("Distinct Cats:", Array.from(distinctCats));
