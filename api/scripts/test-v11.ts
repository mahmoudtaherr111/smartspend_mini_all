import { runSmartPipeline } from "../lib/smart-pipeline";

async function test() {
   const r = await runSmartPipeline({
      text: "جبت أكل وركبت اوبر بـ 500",
      userDict: [],
      userProfileContext: { knownPeople: [] },
      pipelineSettings: {}
   });
   console.log("RESULT: ", JSON.stringify(r.items.map(i => ({ amount: i.amount, cat: i.category, sub: i.subCategory, parse: i.parsedBy })), null, 2));
}

test().catch(console.error);
