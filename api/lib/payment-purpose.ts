import { CATEGORIES } from "./category-registry";

/** Merchant descriptors are evidence of purpose, not proof of a renewal or a purchased SKU. */
export function paymentPurpose(merchant: string | null, source: string) {
  const descriptor = (merchant || "").normalize("NFKC").trim();
  const billingContext = /\b(?:renewal|renewed)\b|تجديد|تجدد/i.test(source)
    ? ("renewal" as const)
    : /\brecurring\b|دفع متكرر|خصم دوري/i.test(source)
      ? ("recurring" as const)
      : ("unspecified" as const);
  const suffix = "(?:[\\s*/-]+(?:[A-Z]{2}|[0-9-]+))?\\.?$";
  const subscription =
    new RegExp(
      "^(?:netflix(?:\\.com)?|spotify|shahid(?:\\.net)?|watch\\s*it|نتفلي?كس|سبوتيفاي|شاهد)" +
        suffix,
      "i",
    ).test(descriptor) ||
    new RegExp(
      "^(?:claude(?:\\.ai)?|anthropic\\s*\\*?\\s*claude|openai\\s*\\*?\\s*chatgpt|chatgpt|amazon\\s*prime|youtube\\s*premium)" +
        suffix,
      "i",
    ).test(descriptor);
  if (!subscription)
    return { category: null, subCategory: null, billingContext };
  const category = CATEGORIES.find((c) => c.id === "subscriptions");
  const sub = /^netflix|^نتفلي?كس/i.test(descriptor)
    ? category?.subcategories.find((s) => s.id === "netflix")
    : /^spotify|^سبوتيفاي/i.test(descriptor)
      ? category?.subcategories.find((s) => s.id === "spotify")
      : undefined;
  return {
    category: category?.name_ar || null,
    subCategory: sub?.name_ar || "عام",
    billingContext,
  };
}
