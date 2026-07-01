/**
 * Real User Simulation — not unit tests, actual pipeline runs
 * with full output inspection.
 */
import { runSmartPipeline, type PipelineInput } from "./smart-pipeline";

const baseInput: PipelineInput = {
  text: "",
  userId: 999,
  userType: "local",
  userPlan: "free",
  userDict: [],
  apiKey: "",
  apiKey2: "",
  modelName: "gemini-2.5-flash",
  maxTokens: 128,
  fireworksApiKey: "",
  pipelineSettings: {},
};

const knownPeople = [
  { name: "مروان", relationship: "أخ", category: "العائلة", subCategory: "مروان أخوك" },
  { name: "سارة", relationship: "صديقة", category: "أصدقاء", subCategory: "سارة صاحبتك" },
];

async function simulate(label: string, text: string, opts: Partial<PipelineInput> = {}) {
  console.log(`\n${"─".repeat(70)}`);
  console.log(`INPUT: "${text}"`);
  const r = await runSmartPipeline({
    ...baseInput,
    text,
    userProfileContext: { knownPeople },
    ...opts,
  });
  console.log(`DECISION: ${r.decision} | CONFIDENCE: ${r.overallConfidence}% | PARSED_BY: ${r.parsedBy} | TOKENS: ${r.tokensUsed} | TIME: ${r.processingTimeMs}ms`);
  for (const item of r.items) {
    console.log(`  → ${item.type} | ${item.amount} EGP | ${item.category}/${item.subCategory} | conf=${item.confidence}% | ${item.description || ""} | person=${item.person_mentioned || "—"}`);
  }
  if (r.clarificationQuestion) {
    console.log(`  ❓ ${r.clarificationQuestion}`);
  }
  if (r.items.length === 0) {
    console.log(`  ⚠️ NO ITEMS RETURNED`);
  }
  return r;
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  REAL USER SIMULATION — SmartSpend Classification Pipeline");
  console.log("═══════════════════════════════════════════════════════════");

  // ═══ Group 1: Simple everyday (should be auto_save, rule_engine) ═══
  await simulate("Simple", "بنزين 200");
  await simulate("Simple", "كهربا 450");
  await simulate("Simple", "قهوة 35");
  await simulate("Simple", "سجاير 65");
  await simulate("Simple", "كشف دكتور 400");
  await simulate("Simple", "مدرسة 1200");

  // ═══ Group 2: Income/Transfer/Investment ═══
  await simulate("Income", "قبضت المرتب 15000");
  await simulate("Transfer", "تحويل انستاباي 1000");
  await simulate("Investment", "اشتريت ذهب ب 6000");
  await simulate("Freelance", "جالي من سبوبة 1800");
  await simulate("Cashback", "كاش باك 70");

  // ═══ Group 3: Multi-transaction ═══
  await simulate("Multi", "فطرت ب 50 وركبت اوبر 80 ودفعت النت 360");
  await simulate("Multi", "عيش 20 ومترو 10 وهدوم 900 وسجاير 65");

  // ═══ Group 4: Colloquial/Egyptian slang ═══
  await simulate("Slang", "شحنت رصيد 100");
  await simulate("Slang", "فكيت 200 من ATM");
  await simulate("Slang", "شربت قهوة 35");
  await simulate("Slang", "اشتريت هدوم 900");

  // ═══ Group 5: Ambiguous words ═══
  await simulate("Ambiguous", "عربية فول 30");
  await simulate("Ambiguous", "تذكرة سينما 150");
  await simulate("Ambiguous", "غسلت العربية 80");

  // ═══ Group 6: Persons ═══
  await simulate("Person known", "اديت مروان 500");
  await simulate("Person unknown", "اديت باسم 400");
  await simulate("Person multi", "حولت لمروان 500 ولسارة 300");

  // ═══ Group 7: Edge cases ═══
  await simulate("No amount", "ذهبت إلى المتجر");
  await simulate("Large amount", "اشتريت شقة 5000000");
  await simulate("Tiny amount", "عصير 5");
  await simulate("Empty", "");

  // ═══ Group 8: Typo tolerance ═══
  await simulate("Typo", "كهارب 200");
  await simulate("Typo", "بنزين 200"); // exact for comparison

  // ═══ Group 9: Franco-Arab ═══
  await simulate("Franco", "dafa3t el kahraba 200");

  // ═══ Group 10: Long narrative ═══
  await simulate("Long", "روحت قعدت مع العيال في كافيه ودفعت 350 جنيه وحاسبنا على التاكسي 50 جنيه وسلفت أحمد صاحبي 1000");

  console.log(`\n${"═".repeat(70)}`);
  console.log("  SIMULATION COMPLETE");
  console.log(`${"═".repeat(70)}`);
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
