import { runRuleEngine } from "./lib/rule-engine";
import { normalizeV2 } from "./lib/normalizer-v2";

const inputs = ["150 جنيه علاج", "عملت شوبينج ب 5000", "ركبت ميكروباص ب 10"];
for (const input of inputs) {
  const normalized = normalizeV2(input).forRules;
  const result = runRuleEngine(normalized, [], undefined);
  console.log(`Input: ${input} -> Confidence: ${result.items[0]?.confidence} -> Category: ${result.items[0]?.category}`);
}
