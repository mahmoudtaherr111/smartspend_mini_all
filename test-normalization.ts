import { normalizeTransactionTaxonomy } from "./api/lib/category-registry";

const item = {
  category: "معاملات عائلية",
  subCategory: "سلوى (صحبتي)",
  description: "اديت سلوى 30 جنيه. (صحبتي)",
  type: "transfer",
};

const result = normalizeTransactionTaxonomy(item, "اديت سلوى 30 جنيه. (صحبتي)");
console.log("Original item:", item);
console.log("Normalized result:", result);
