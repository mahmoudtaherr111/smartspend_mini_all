/**
 * A verb carries direction, not category — and a word we already know is not a typo.
 *
 * The fuzzy layer used to be allowed to "correct" correctly spelled words. `دفعت` sits
 * two edits from `بعت` (sold), so it came back as تحويل and the whole transaction
 * flipped from expense to transfer; `جنيه` — the currency unit itself — came back as
 * أكل وشرب. This cost 10 of the 10 direction errors in the live benchmark, all of them
 * the same expense→transfer flip, because the model now only edits the category and can
 * no longer overrule a direction the local path got wrong.
 *
 * The second guard here is the disambiguation call at the single-word dictionary site.
 * Every other lookup site (merchant, trigram, bigram, subcategory) already asked the
 * context; that one did not, so `كارت` always meant a bank card even when it was
 * plainly phone credit.
 */
import { describe, it, expect } from "vitest";
import { runRuleEngine } from "./rule-engine";
import { isKnownLexeme, CATEGORY_DICTIONARY } from "./egyptian-dictionary";
import { fuzzyFindCategory, normalizeArabic } from "./fuzzy-match";

async function classify(text: string) {
  const result = await runRuleEngine(text, [], "", "");
  return result.items;
}

describe("known words are never treated as typos", () => {
  it("recognises the verbs and units that carry no category", () => {
    for (const word of ["دفعت", "جنيه", "حجزت", "طلبت", "سددت", "اشتريت", "صرفت"]) {
      expect(isKnownLexeme(word)).toBe(true);
    }
  });

  it("still treats an actual misspelling as a typo", () => {
    // The guard must not disable typo correction — only stop it from rewriting words
    // the lexicon already knows.
    expect(isKnownLexeme("كهارب")).toBe(false);
    expect(fuzzyFindCategory(normalizeArabic("كهارب"), CATEGORY_DICTIONARY, 2)).toBeTruthy();
  });

  it("keeps a bare payment verb an expense instead of a transfer", async () => {
    const items = await classify("دفعت 100 و100 و100 و100");
    expect(items).toHaveLength(4);
    for (const item of items) {
      expect(item.type).toBe("expense");
      expect(item.category).toBe("متنوعات");
    }
  });

  it("does not let the currency word decide the category", async () => {
    const [item] = await classify("دفعت 50.75 جنيه دمغة");
    expect(item.type).toBe("expense");
    expect(item.category).toBe("خدمات حكومية");
  });
});

describe("a multi-meaning single word asks the context", () => {
  it("reads a bought كارت as phone credit, not a bank transfer", async () => {
    const items = await classify("شحنت ٧٥ جنيه رصيد وجبت كارت بـ ٢٥");
    expect(items).toHaveLength(2);
    for (const item of items) {
      expect(item.type).toBe("expense");
      expect(item.category).toBe("فواتير");
      expect(item.subCategory).toBe("شحن رصيد");
    }
  });

  it("leaves the card-as-instrument sense alone", async () => {
    // "بالكارت" is how the payment was made, not what was bought.
    const [item] = await classify("دفعت بالكارت 500 فيزا");
    expect(item.category).toBe("تحويل");
  });
});
