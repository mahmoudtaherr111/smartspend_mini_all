import { runRuleEngine } from "./api/lib/rule-engine.js";

const result = runRuleEngine("اشتريت النهاردة بخمسين جنيه قطعة شوكولاتة");
console.log(JSON.stringify(result, null, 2));
