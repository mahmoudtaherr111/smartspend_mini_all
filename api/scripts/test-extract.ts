import { extractPeople } from "../lib/entity-extractor";
import { runSmartPipeline } from "../lib/smart-pipeline";

const knownPeople: any[] = [
  { name: "مروان", relationship: "أخ", category: "العائلة", subCategory: "مروان أخوك" },
  { name: "سارة", relationship: "صديقة", category: "أصدقاء", subCategory: "سارة صاحبتك" },
  { name: "عماد", relationship: "موظف", category: "موظفين", subCategory: "عماد موظفك" },
];

console.log("extractPeople خالد: ", extractPeople("حولت ولخالد 200", knownPeople.map(p => p.name)));
console.log("extractPeople محمود: ", extractPeople("حولت ولمحمود 100", knownPeople.map(p => p.name)));

async function test() {
   const r = await runSmartPipeline({
      text: "حولت لمروان 500 ولسارة 300 ولخالد 200 ولمحمود 100",
      userDict: [],
      userProfileContext: { knownPeople },
      pipelineSettings: {}
   });
   console.log("RESULT: ", JSON.stringify(r.items, null, 2));
}

test().catch(console.error);
