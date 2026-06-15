import { runSmartPipeline } from "../lib/smart-pipeline";

const knownPeople = [
  { name: "مدحت", relationship: "صديق", category: "أصدقاء", subCategory: "مدحت صاحبك" },
];

async function test() {
   const r = await runSmartPipeline({
      text: "صرفت 1500 جنيه أكل في مطعم وبعدها أديت 350 جنيه لمدحت",
      userDict: [],
      userProfileContext: { knownPeople },
      pipelineSettings: {}
   });
   console.log("RESULT: ", JSON.stringify(r.items.map(i => ({ amount: i.amount, cat: i.category, sub: i.subCategory, parse: i.parsedBy })), null, 2));
}

test().catch(console.error);
