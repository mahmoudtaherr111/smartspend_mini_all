import { runRuleEngine } from "./api/lib/rule-engine";

console.log(
  JSON.stringify(
    runRuleEngine("اديت سلوى 30 جنيه (صحبتي)", [], undefined, 30),
    null,
    2,
  ),
);
