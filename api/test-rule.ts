import { runRuleEngine } from "./lib/rule-engine";
import { normalizeV2 } from "./lib/normalizer-v2";

const input = "200 جنيه أكل";
const normalized = normalizeV2(input).forRules;
const result = runRuleEngine(normalized, [], undefined);

console.log(JSON.stringify(result, null, 2));
