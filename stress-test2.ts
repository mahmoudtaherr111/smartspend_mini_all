import { runRuleEngine } from "./api/lib/rule-engine";

const scenarios = [
  "جبت لمراتي فستان ب 1500",
  "اشتريت جزمه لولدي ب 500",
  "حاسبت على غدا انا وصاحبي احمد ب 300",
  "حولت 1000 لاخويا محمد عشان يدفع قسط عربيته",
  "سددت 500 من الدين اللي عليا لمحمود",
  "دفعت 2000 في كورس الانجليزي",
  "جبت هدية لامي بمناسبة عيد الام ب 1000",
  "روحت الحلاق وحلقت ب 150",
  "صلحت شاشة الموبايل ب 800",
  "اخدت من مديري 1000 مكافاة",
  "دفعت 50 سايس ركنه",
  "طلبت سباك عشان الحنفية ب 150",
];

const results = scenarios.map((text) => {
  return {
    text,
    result: runRuleEngine(text, undefined, undefined, 100, []),
  };
});

console.log(JSON.stringify(results, null, 2));
