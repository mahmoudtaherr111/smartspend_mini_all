import { runRuleEngine } from "../lib/rule-engine";

async function test() {
  console.log(JSON.stringify(await runRuleEngine("جبت أكل ومواصلات بـ 500", [], undefined), null, 2));
}

test().catch(console.error);
