/**
 * Test script: 32 Egyptian Arabic transaction sentences (Rule Engine only - no AI)
 * Uses runSmartPipeline directly without AI calls
 */
import { runSmartPipeline } from "./api/lib/smart-pipeline";

interface TestCase {
  id: number;
  sentence: string;
  expectedMin: number; // min items expected
  notes: string;
}

const TEST_CASES: TestCase[] = [
  { id: 1, sentence: "أنا صرفت 1500 جنيه أكل في مطعم وبعدها أديت 350 جنيه لمدحت (صديق)", expectedMin: 2, notes: "مطعم + صديق" },
  { id: 2, sentence: "حولت 500 جنيه لمروان أخويا و 200 لعلي صاحبي", expectedMin: 2, notes: "أخ + صديق" },
  { id: 3, sentence: "جالي 2000 جنيه من فريلانس ودفعت 500 جنيه فاتورة النت", expectedMin: 2, notes: "دخل + فاتورة" },
  { id: 4, sentence: "روحت البنزينة حطيت بنزين بـ 400 واديت السايس 10 جنيه", expectedMin: 2, notes: "بنزين + سايس" },
  { id: 5, sentence: "روحت للحلاق عملت دقني بـ 150 وطلبت اوبر بـ 80", expectedMin: 2, notes: "حلاق + أوبر" },
  { id: 6, sentence: "اشتريت شاحن موبايل بـ 120 وجبت سلك بـ 50", expectedMin: 2, notes: "إلكترونيات" },
  { id: 7, sentence: "دفعت اشتراك الجيم 300 جنيه وجبت مية بـ 10", expectedMin: 2, notes: "جيم + مية" },
  { id: 8, sentence: "بعت 1000 جنيه لعلي وقبضت جمعية 5000", expectedMin: 2, notes: "بعت + جمعية" },
  { id: 9, sentence: "نزلت السوبرماركت جبت جبنة بـ 40 ولبن بـ 30 وعيش بـ 10", expectedMin: 3, notes: "3 عناصر بقالة" },
  { id: 10, sentence: "حاسبت على الغدا كشري بـ 90 بيبسي بـ 15", expectedMin: 2, notes: "كشري + بيبسي" },
  { id: 11, sentence: "السباك جه عمل الحنفية وخد 150 جنيه مصنعية", expectedMin: 1, notes: "سباك سكن" },
  { id: 12, sentence: "اشتريت هدوم من زارا بـ 1800 جنيه", expectedMin: 1, notes: "ملابس زارا" },
  { id: 13, sentence: "خرجت مع صحابي روحنا السينما بـ 200 وجبنا فشار بـ 100", expectedMin: 2, notes: "سينما + فشار" },
  { id: 14, sentence: "روحت للدكتور كشف بـ 400 وجبت دوا بـ 300", expectedMin: 2, notes: "دكتور + دوا" },
  { id: 15, sentence: "دفعت 2500 جنيه إيجار الشقة و 300 للبواب", expectedMin: 2, notes: "إيجار + بواب" },
  { id: 16, sentence: "جبت خضار وفاكهة من السوق بـ 200 جنيه", expectedMin: 1, notes: "خضار" },
  { id: 17, sentence: "شحنت الرصيد فودافون بـ 100 وجبت كارت فكة بـ 25", expectedMin: 2, notes: "شحن + كارت" },
  { id: 18, sentence: "دفعت فاتورة الكهربا 600 والغاز 100", expectedMin: 2, notes: "كهربا + غاز" },
  { id: 19, sentence: "اشتريت ليكويد بـ 350 وبودات بـ 150 للفيب", expectedMin: 2, notes: "ليكويد + بودات" },
  { id: 20, sentence: "تبرعت بـ 200 جنيه للجامع صدقة", expectedMin: 1, notes: "صدقة" },
  { id: 21, sentence: "سحبت 1000 جنيه من الـ ATM واديتهم لأمي", expectedMin: 2, notes: "ATM + أمي" },
  { id: 22, sentence: "شلت 5000 جنيه استثمار في دهب", expectedMin: 1, notes: "شلت ذهب" },
  { id: 23, sentence: "جبت شاحن وسماعة بلوتوث بـ 450", expectedMin: 1, notes: "إلكترونيات" },
  { id: 24, sentence: "دفعت مصاريف المدرسة للولاد 4000 جنيه", expectedMin: 1, notes: "مدرسة" },
  { id: 25, sentence: "عزمت صحابي على العشا ودفعنا 1200 جنيه", expectedMin: 1, notes: "عشا" },
  { id: 26, sentence: "اشتريت كوتشي من نايكي بـ 2200 جنيه", expectedMin: 1, notes: "كوتشي نايكي" },
  { id: 27, sentence: "روحت للترزي أخد 120 جنيه تصليح بنطلون", expectedMin: 1, notes: "ترزي" },
  { id: 28, sentence: "اشتريت باقة نت إضافية بـ 150 جنيه", expectedMin: 1, notes: "باقة نت" },
  { id: 29, sentence: "جالي كاشباك 50 جنيه من فودافون كاش", expectedMin: 1, notes: "كاشباك دخل" },
  { id: 30, sentence: "دفعت قسط الموبايل 800 جنيه فاليو", expectedMin: 1, notes: "قسط فاليو" },
  { id: 31, sentence: "رجعت 500 جنيه لأحمد صاحبي كان مسلفهملي", expectedMin: 1, notes: "إرجاع سلفة" },
  { id: 32, sentence: "أخدت سلفة 2000 جنيه من الشغل", expectedMin: 1, notes: "سلفة" },
];

const KNOWN_PEOPLE = [
  { name: "مروان", category: "العائلة", subCategory: "أخ", relationship: "أخ" },
  { name: "أحمد", category: "أصدقاء", subCategory: "صاحب", relationship: "صديق" },
  { name: "علي", category: "أصدقاء", subCategory: "صاحب", relationship: "صديق" },
];

async function main() {
  console.log("🚀 Testing 32 Egyptian Arabic sentences (Rule Engine + no-AI fallback)\n");
  console.log("=".repeat(80));

  let passed = 0;
  const failedList: number[] = [];
  const allResults: string[] = [];

  for (const tc of TEST_CASES) {
    try {
      const result = await runSmartPipeline({
        text: tc.sentence,
        userId: 1,
        userType: "user",
        userPlan: "free",
        userDict: [],
        apiKey: "", // No AI - rule engine only
        groqApiKey: "",
        modelName: "",
        maxTokens: 0,
        monthlyContext: { totalIncome: 5000, totalExpense: 2000 },
        userProfileContext: { knownPeople: KNOWN_PEOPLE },
        provider: "gemini"
      });

      const items = result.items || [];
      const ok = items.length >= tc.expectedMin;
      
      const icon = ok ? "✅" : "❌";
      const cats = items.map((i: any) => `${i.category}[${i.amount}ج,${i.confidence}%]`).join(" + ");
      const status = ok ? "" : ` ⚠️ expected≥${tc.expectedMin} got ${items.length}`;
      
      console.log(`${icon} [${tc.id}] ${tc.notes}`);
      console.log(`   "${tc.sentence.substring(0, 60)}..."`);
      console.log(`   → ${cats || "(لا شيء)"}${status}`);
      console.log();
      
      if (ok) { passed++; } else { failedList.push(tc.id); }
      allResults.push(`| ${tc.id} | ${icon} | ${items.length}/${tc.expectedMin} | ${cats || "لا شيء"} | ${tc.notes} |`);
      
    } catch (err: any) {
      console.log(`❌ [${tc.id}] ERROR: ${err?.message}`);
      failedList.push(tc.id);
      allResults.push(`| ${tc.id} | ❌ | - | ERROR: ${err?.message?.substring(0,50)} | ${tc.notes} |`);
    }
  }

  console.log("=".repeat(80));
  console.log(`\n📊 RESULTS: ${passed}/${TEST_CASES.length} passed (${Math.round(passed/TEST_CASES.length*100)}%)`);
  if (failedList.length > 0) console.log(`❌ Failed IDs: ${failedList.join(", ")}`);
  
  console.log("\n## Summary Table\n");
  console.log("| # | نتيجة | عناصر | الفئات | ملاحظة |");
  console.log("|---|-------|-------|--------|--------|");
  allResults.forEach(r => console.log(r));
}

main().catch(console.error);
