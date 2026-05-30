import { normalizeTransactionTaxonomyList } from "./api/lib/category-registry";
import { verifyClassifiedItems } from "./api/lib/post-classifier-verifier";
import type { ParsedTransaction } from "./api/lib/rule-engine";

const rawItem = {
  amount: 80,
  main_category: "معاملات عائلية",
  sub_category: "أحمد (صاحبي)",
  item_name: "بعت لأحمد 80 جنيه. (أحمد صاحبي)",
  type: "expense",
  confidence: 95,
};

const parsedItem: ParsedTransaction = {
  amount: rawItem.amount,
  category: rawItem.main_category,
  subCategory: rawItem.sub_category,
  description: rawItem.item_name,
  type: "expense",
  confidence: rawItem.confidence,
  needsReview: false,
  segmentId: "test-id",
};

const normalizedItems = normalizeTransactionTaxonomyList(
  [parsedItem],
  rawItem.item_name,
);
console.log("Normalized Items:", normalizedItems);

const verifiedResult = verifyClassifiedItems(
  normalizedItems,
  rawItem.item_name,
);
console.log("Verified Result:", verifiedResult.items);
