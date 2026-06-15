import { runSmartPipeline } from "../lib/smart-pipeline";

const knownPeople = [
  { name: "مروان", relationship: "أخ", category: "العائلة", subCategory: "مروان أخوك" },
  { name: "سارة", relationship: "صديقة", category: "أصدقاء", subCategory: "سارة صاحبتك" },
  { name: "عماد", relationship: "موظف", category: "موظفين", subCategory: "عماد موظفك" },
];

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
