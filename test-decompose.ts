import { runRuleEngine } from "./api/lib/rule-engine";

async function main() {
  const text = "نزلت السوبرماركت جبت مناديل ومسحوق بـ 110";
  const result = await runRuleEngine(text);
  console.dir(result, { depth: null });
}

main();
