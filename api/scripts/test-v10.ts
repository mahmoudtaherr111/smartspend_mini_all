import { fuzzyFindCategory } from "../lib/fuzzy-match";
import { CATEGORY_DICTIONARY } from "../lib/egyptian-dictionary";

const words = ["فرتكت", "500", "جنيه", "على", "كلام", "فاضي", "و", "ضيعت", "200"];
for (const word of words) {
  if (word.length >= 3) {
    const limit = word.length <= 4 ? 0 : (word.length <= 6 ? 1 : 2);
    const res = fuzzyFindCategory(word, CATEGORY_DICTIONARY, limit);
    if (res) {
       console.log(`Word: ${word}, Match: ${res}, Limit: ${limit}`);
    }
  }
}
