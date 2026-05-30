import { runRuleEngine } from "./api/lib/rule-engine.js";
import { decomposeHeuristic } from "./api/lib/narrative-decomposer.js";

async function run() {
  const text = "اديت 500 جنيه لجلال (صاحبي)";
  const result = runRuleEngine(text, "free");
  console.log("Rule Engine Result:", JSON.stringify(result, null, 2));
}
run();
