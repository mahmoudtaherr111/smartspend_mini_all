import { runRuleEngine } from "./api/lib/rule-engine.js";
import { decomposeHeuristic } from "./api/lib/narrative-decomposer.js";
import { extractAmounts } from "./api/lib/entity-extractor.js";

async function main() {
  const text = "انا خدت من أحمد 200 جنيه واديت صلاح 1000 جنيه واديت صبري 250 جنيه وأكلت شاورما ب300 جنيه";
  const norm = text;
  const amounts = extractAmounts(norm);
  const decomp = decomposeHeuristic(norm);
  console.log("Decomp:", JSON.stringify(decomp, null, 2));

  const items = [];
  for (const seg of decomp.segments) {
    const res = await runRuleEngine({
       text,
       normalizedText: norm,
       amount: seg.amount || 0,
       entities: { amountCount: amounts.length, people: [], merchants: [] },
       segmentText: seg.text,
       isDecomposed: true,
       segmentDirection: seg.direction,
       knownNames: []
    });
    items.push(res);
  }
  console.log("Rules:", JSON.stringify(items, null, 2));
}
main();
