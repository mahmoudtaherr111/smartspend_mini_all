/**
 * SmartSpend Comprehensive Classification Testing Script
 * Runs 100 systematic cases against the real runSmartPipeline (Rule Engine + Gemini AI)
 */
import { runSmartPipeline } from "./api/lib/smart-pipeline";

interface ComprehensiveTestCase {
  id: number;
  category: "number_formats" | "slang_phrasing" | "names_ambiguity" | "volume_edge_cases";
  sentence: string;
  expectedMinItems: number;
  expectedType?: "income" | "expense" | "transfer";
  description: string;
}

const TEST_CASES: ComprehensiveTestCase[] = [
  // ==================== 1. NUMBER FORMATS (25 cases) ====================
  { id: 1, category: "number_formats", sentence: "دفعت ٥٠٠ جنيه للعيادة", expectedMinItems: 1, description: "East Arabic numerals (٥٠٠)" },
  { id: 2, category: "number_formats", sentence: "حولت ٢٥٠٠ جنيه كاش", expectedMinItems: 1, description: "East Arabic numerals (٢٥٠٠)" },
  { id: 3, category: "number_formats", sentence: "اشتريت قميص بـ 1500", expectedMinItems: 1, description: "Standard digits (1500)" },
  { id: 4, category: "number_formats", sentence: "أديت السواق ألفين ونص", expectedMinItems: 1, description: "Slang text compound number (ألفين ونص)" },
  { id: 5, category: "number_formats", sentence: "دفعت خمسلاف جنيه مصاريف مدرسة", expectedMinItems: 1, description: "Slang run-together spelling (خمسلاف)" },
  { id: 6, category: "number_formats", sentence: "جبت مية بجنيه ونص", expectedMinItems: 1, description: "Fractional slang (جنيه ونص)" },
  { id: 7, category: "number_formats", sentence: "لقيت ربع جنيه في الأرض", expectedMinItems: 1, expectedType: "income", description: "Fractional slang (ربع جنيه)" },
  { id: 8, category: "number_formats", sentence: "حولت 1,250.50 ج.م انستاباي", expectedMinItems: 1, description: "Formatted digits with comma and decimal point" },
  { id: 9, category: "number_formats", sentence: "حاسبت بـ 1.500 جنيه في المطعم", expectedMinItems: 1, description: "Formatted digits with dot separator (1.500)" },
  { id: 10, category: "number_formats", sentence: "جالي بونص خمسة آلاف وسبعمائة وعشرة جنيه", expectedMinItems: 1, expectedType: "income", description: "Classical Arabic text number" },
  { id: 11, category: "number_formats", sentence: "دفعت 50.75 جنيه دمغة", expectedMinItems: 1, description: "Decimal cents (50.75)" },
  { id: 12, category: "number_formats", sentence: "اشتريت شقة بـ مليون جنيه", expectedMinItems: 1, description: "Million with text combination (مليون جنيه)" },
  { id: 13, category: "number_formats", sentence: "دخلت جمعية بـ تلاتة مليون وربع", expectedMinItems: 1, description: "Million slang with fraction (تلاتة مليون وربع)" },
  { id: 14, category: "number_formats", sentence: "جبت لبان بقرش", expectedMinItems: 1, description: "Obsolete currency unit (بقرش)" },
  { id: 15, category: "number_formats", sentence: "حولت مليون و200 ألف جنيه استثمار", expectedMinItems: 1, description: "Complex combined million and thousand text" },
  { id: 16, category: "number_formats", sentence: "حاسبت بـ ميتين وخمسين جنيه", expectedMinItems: 1, description: "Common Egyptian text representation (ميتين وخمسين)" },
  { id: 17, category: "number_formats", sentence: "اشتريت بـ تمنمية جنيه هدوم", expectedMinItems: 1, description: "Egyptian slang number 800 (تمنمية)" },
  { id: 18, category: "number_formats", sentence: "دبحت عجل بـ تسعتاشر ألف جنيه", expectedMinItems: 1, description: "Egyptian slang number 19000 (تسعتاشر ألف)" },
  { id: 19, category: "number_formats", sentence: "دفعت خمستاشر جنيه للسايس", expectedMinItems: 1, description: "Egyptian slang number 15 (خمستاشر)" },
  { id: 20, category: "number_formats", sentence: "جبت عشا بـ ستين جنيه", expectedMinItems: 1, description: "Egyptian text 60 (ستين)" },
  { id: 21, category: "number_formats", sentence: "دفعنا 1200000 دولار في التصدير", expectedMinItems: 1, description: "Large digit currency (1.2M)" },
  { id: 22, category: "number_formats", sentence: "جالي 300$ فريلانس", expectedMinItems: 1, expectedType: "income", description: "Dollar symbol suffix (300$)" },
  { id: 23, category: "number_formats", sentence: "قبضت مية يورو", expectedMinItems: 1, expectedType: "income", description: "Textual Euro currency (مية يورو)" },
  { id: 24, category: "number_formats", sentence: "حاسبت بـ 450.00 جنيه", expectedMinItems: 1, description: "Trailing zeros decimal (.00)" },
  { id: 25, category: "number_formats", sentence: "دفعت 10 جنيهات", expectedMinItems: 1, description: "Plural form of currency (جنيهات)" },

  // ==================== 2. SLANG & PHRASING STYLES (25 cases) ====================
  { id: 26, category: "slang_phrasing", sentence: "طيرت خمسين جنيه في القهوة", expectedMinItems: 1, description: "Slang verb for spend (طيرت)" },
  { id: 27, category: "slang_phrasing", sentence: "ضيعت 100 جنيه في التجمع", expectedMinItems: 1, description: "Slang verb for spend (ضيعت)" },
  { id: 28, category: "slang_phrasing", sentence: "حطيت بنزين بـ 400 في البنزينة", expectedMinItems: 1, description: "Slang phrasing for car fueling" },
  { id: 29, category: "slang_phrasing", sentence: "حاسبت على الدليفري بـ 120", expectedMinItems: 1, description: "Common delivery phrase" },
  { id: 30, category: "slang_phrasing", sentence: "جالي تحويل 500 جنيه على انستاباي", expectedMinItems: 1, expectedType: "income", description: "Slang income phrase with Instapay" },
  { id: 31, category: "slang_phrasing", sentence: "قبضت الجمعية 4000 جنيه النهاردة", expectedMinItems: 1, expectedType: "income", description: "Egyptian rotating savings association (جمعية)" },
  { id: 32, category: "slang_phrasing", sentence: "السواق خد مني 50 جنيه زيادة", expectedMinItems: 1, description: "Indirect spending expression (السواق خد مني)" },
  { id: 33, category: "slang_phrasing", sentence: "فاتورة الغاز سحبت 200 جنيه من الفيزا", expectedMinItems: 1, description: "Indirect billing expression" },
  { id: 34, category: "slang_phrasing", sentence: "كسبت 1000 جنيه في مسابقة", expectedMinItems: 1, expectedType: "income", description: "Income verb (كسبت)" },
  { id: 35, category: "slang_phrasing", sentence: "رجعلي 300 جنيه باقي الحساب من المطعم", expectedMinItems: 1, expectedType: "income", description: "Refund expression (رجعلي)" },
  { id: 36, category: "slang_phrasing", sentence: "حاسبت للحلاق 150 جنيه وتيبس 20 جنيه للولد", expectedMinItems: 2, description: "Compound barber tip phrase" },
  { id: 37, category: "slang_phrasing", sentence: "اشتريت باقة نت بـ 250 جنيه فودافون", expectedMinItems: 1, description: "Mobile internet bundle slang" },
  { id: 38, category: "slang_phrasing", sentence: "شحنت رصيد بـ 100 جنيه كارت فكة", expectedMinItems: 1, description: "Mobile recharge card slang" },
  { id: 39, category: "slang_phrasing", sentence: "سلفت أحمد صاحبي 1000 جنيه", expectedMinItems: 1, description: "Lending slang (سلفت)" },
  { id: 40, category: "slang_phrasing", sentence: "استلفت 500 جنيه من مروان", expectedMinItems: 1, expectedType: "income", description: "Borrowing slang (استلفت)" },
  { id: 41, category: "slang_phrasing", sentence: "رجعت سلفة 1000 جنيه لعلي", expectedMinItems: 1, description: "Paying back loan slang" },
  { id: 42, category: "slang_phrasing", sentence: "دبحت عجل بـ 25000 صدقة لله", expectedMinItems: 1, description: "Religious slaughter charity slang" },
  { id: 43, category: "slang_phrasing", sentence: "دفعت قسط فاليو 600 جنيه", expectedMinItems: 1, description: "Installment app slang (فاليو)" },
  { id: 44, category: "slang_phrasing", sentence: "شيلت 5000 جنيه تحت البلاطة للزنقة", expectedMinItems: 1, description: "Saving/hoarding slang (تحت البلاطة)" },
  { id: 45, category: "slang_phrasing", sentence: "فكيت 200 جنيه فكة", expectedMinItems: 1, description: "Exchanging money slang (فكيت)" },
  { id: 46, category: "slang_phrasing", sentence: "دفعت اشتراك النت الارضي 350 جنيه", expectedMinItems: 1, description: "Internet subscription" },
  { id: 47, category: "slang_phrasing", sentence: "جبت مصاريف البيت بـ 800 جنيه خضار ولحمة", expectedMinItems: 1, description: "General household groceries slang" },
  { id: 48, category: "slang_phrasing", sentence: "صرفت 50 جنيه مواصلات النهاردة", expectedMinItems: 1, description: "Daily transit slang" },
  { id: 49, category: "slang_phrasing", sentence: "جالي كاشباك 30 جنيه من المحفظة", expectedMinItems: 1, expectedType: "income", description: "Cashback slang (كاشباك)" },
  { id: 50, category: "slang_phrasing", sentence: "دفعنا 1500 مصاريف ولادة في المستشفى", expectedMinItems: 1, description: "Medical emergency hospital slang" },

  // ==================== 3. NAMES & AMBIGUITY (25 cases) ====================
  { id: 51, category: "names_ambiguity", sentence: "منه خدت 200 جنيه", expectedMinItems: 1, expectedType: "income", description: "Linguistic name vs. pronoun (منه - taken from her/him or Menna)" },
  { id: 52, category: "names_ambiguity", sentence: "خدت منه 150 جنيه", expectedMinItems: 1, expectedType: "income", description: "Linguistic pronoun (منه - from him)" },
  { id: 53, category: "names_ambiguity", sentence: "خدت منها 300 جنيه", expectedMinItems: 1, expectedType: "income", description: "Linguistic pronoun (منها - from her)" },
  { id: 54, category: "names_ambiguity", sentence: "حولت لعلي 500 جنيه", expectedMinItems: 1, description: "Name Ali (حولت لعلي)" },
  { id: 55, category: "names_ambiguity", sentence: "الضريبة زادت علي 200 جنيه", expectedMinItems: 1, description: "Preposition Ali (زادت علي - on me)" },
  { id: 56, category: "names_ambiguity", sentence: "حولت لكريم 300 جنيه انستاباي", expectedMinItems: 1, description: "Name Karim (حولت لكريم)" },
  { id: 57, category: "names_ambiguity", sentence: "طلبت مشوار من كريم بـ 80 جنيه", expectedMinItems: 1, description: "Merchant Careem app (مشوار من كريم)" },
  { id: 58, category: "names_ambiguity", sentence: "حولت لفوري 200 جنيه", expectedMinItems: 1, description: "Name Fawry (حولت لفوري)" },
  { id: 59, category: "names_ambiguity", sentence: "دفعت فوري 100 جنيه شحن موبايل", expectedMinItems: 1, description: "Service Fawry payment (دفعت فوري)" },
  { id: 60, category: "names_ambiguity", sentence: "سافرت مع مها بـ 400 جنيه", expectedMinItems: 1, description: "Name Maha (مع مها)" },
  { id: 61, category: "names_ambiguity", sentence: "سحبت من مروان 500 جنيه", expectedMinItems: 1, expectedType: "income", description: "Pre-registered name Marwan (مروان)" },
  { id: 62, category: "names_ambiguity", sentence: "دفعت 500 جنيه لمحمود", expectedMinItems: 1, description: "Pre-registered name Mahmoud (محمود)" },
  { id: 63, category: "names_ambiguity", sentence: "أديت السايس 10 جنيه", expectedMinItems: 1, description: "Service provider title (السايس)" },
  { id: 64, category: "names_ambiguity", sentence: "البواب خد 150 جنيه إيجار جراج", expectedMinItems: 1, description: "Service provider title (البواب)" },
  { id: 65, category: "names_ambiguity", sentence: "السباك جه صلح الحنفية وخد 200 جنيه", expectedMinItems: 1, description: "Service provider title (السباك)" },
  { id: 66, category: "names_ambiguity", sentence: "أديت شغالتي 400 جنيه يوميتها", expectedMinItems: 1, description: "Service provider title (شغالتي)" },
  { id: 67, category: "names_ambiguity", sentence: "أديت أخويا 500 جنيه", expectedMinItems: 1, description: "Generic relation term (أخويا)" },
  { id: 68, category: "names_ambiguity", sentence: "حولت 1000 جنيه لأمي", expectedMinItems: 1, description: "Generic relation term (لأمي)" },
  { id: 69, category: "names_ambiguity", sentence: "حولت 300 جنيه لصاحبي", expectedMinItems: 1, description: "Generic relation term (صاحبي)" },
  { id: 70, category: "names_ambiguity", sentence: "أديت 200 جنيه لمديري في الشغل", expectedMinItems: 1, description: "Corporate title relation (مديري)" },
  { id: 71, category: "names_ambiguity", sentence: "حولت 150 جنيه لزميلتي في المكتب", expectedMinItems: 1, description: "Corporate title relation (زميلتي)" },
  { id: 72, category: "names_ambiguity", sentence: "دفعت 300 جنيه لزياد", expectedMinItems: 1, description: "Unknown male name (زياد)" },
  { id: 73, category: "names_ambiguity", sentence: "حولت 1000 جنيه لرامز", expectedMinItems: 1, description: "Unknown male name (رامز)" },
  { id: 74, category: "names_ambiguity", sentence: "أديت 400 جنيه ليوستينا", expectedMinItems: 1, description: "Unknown female Coptic name (يوستينا)" },
  { id: 75, category: "names_ambiguity", sentence: "حولت 200 جنيه لمينا", expectedMinItems: 1, description: "Unknown male Coptic name (مينا)" },

  // ==================== 4. VOLUME & EDGE CASES (25 cases) ====================
  { id: 76, category: "volume_edge_cases", sentence: "روحت السوبرماركت", expectedMinItems: 0, description: "Zero amount phrasing (should not save or prompt clarify)" },
  { id: 77, category: "volume_edge_cases", sentence: "حولت 750000 جنيه لصفوت", expectedMinItems: 1, description: "Very large numeric amount (750k)" },
  { id: 78, category: "volume_edge_cases", sentence: "دفعت إيجار الشقة 2500 وجبت كهربا بـ 300 وللبواب 200", expectedMinItems: 3, description: "Multiple items, different categories (Housing + Utilities + Provider)" },
  { id: 79, category: "volume_edge_cases", sentence: "أديت 5000 لمصطفى و 3000 لمدحت ودعاء بـ 1500 وكمان جبت أكل بـ 200", expectedMinItems: 4, description: "Highly complex bulk (4 segments: 3 people + 1 food)" },
  { id: 80, category: "volume_edge_cases", sentence: "حولت 1000 لعلي ومروان", expectedMinItems: 2, description: "Shared amount between two people (should split 500 each)" },
  { id: 81, category: "volume_edge_cases", sentence: "جبت لبان بنص جنيه", expectedMinItems: 1, description: "Micro-amount (0.50 EGP)" },
  { id: 82, category: "volume_edge_cases", sentence: "صرفت ٥ قروش في الشارع", expectedMinItems: 1, description: "Historical micro-amount (5 piastres)" },
  { id: 83, category: "volume_edge_cases", sentence: "طيرت خمسين باكو في السفر", expectedMinItems: 1, description: "Slang unit representing thousand (باكو = 1000 EGP)" },
  { id: 84, category: "volume_edge_cases", sentence: "جالي أرنب من الورث", expectedMinItems: 1, expectedType: "income", description: "Slang unit representing million (أرنب = 1,000,000 EGP)" },
  { id: 85, category: "volume_edge_cases", sentence: "حاسبت بـ باكو ونص في الصيدلية", expectedMinItems: 1, description: "Slang unit compound (باكو ونص = 1500 EGP)" },
  { id: 86, category: "volume_edge_cases", sentence: "اشتريت دواء بـ 0 جنيه", expectedMinItems: 0, description: "Zero boundary check (0 EGP)" },
  { id: 87, category: "volume_edge_cases", sentence: "صرفت -50 جنيه في النادي", expectedMinItems: 0, description: "Negative boundary check (-50 EGP)" },
  { id: 88, category: "volume_edge_cases", sentence: "حولت 500 جنيه لمروان وجبت دواء بـ 300 وصرفت 150 مواصلات وقبضت الجمعية 4000 ودخلت جمعية بـ 2000 وصرفت 100 قهوة", expectedMinItems: 6, description: "Massive bulk narrative (6 segments mixed income/expense)" },
  { id: 89, category: "volume_edge_cases", sentence: "النهاردة الصبح حاسبت على الفطور بـ 60 جنيه وبعدين روحت الشغل في اوبر بـ 90 وجبت شاحن بـ 120 وحولت 300 لمدحت صديقي", expectedMinItems: 4, description: "Logical narrative sequence (4 segments)" },
  { id: 90, category: "volume_edge_cases", sentence: "صرفت 50 جنيه فودافون كاش و 100 انستاباي و 200 فيزا و 300 كاش", expectedMinItems: 4, description: "Identical amounts/different payment methods" },
  { id: 91, category: "volume_edge_cases", sentence: "جبت شيبسي بـ 10 بيبسي بـ 15 شوكولاتة بـ 20 بسكوت بـ 5", expectedMinItems: 4, description: "Zero verbs, dense noun-amount list" },
  { id: 92, category: "volume_edge_cases", sentence: "حولت 10000000000000000 جنيه لأحمد", expectedMinItems: 0, description: "Overflow amount boundary check (quadrillions)" },
  { id: 93, category: "volume_edge_cases", sentence: "صرفت 100 جنيه في السوبر ماركت و 100 جنيه في السوبر ماركت و 100 جنيه في السوبر ماركت", expectedMinItems: 3, description: "Repetitive duplicates bulk" },
  { id: 94, category: "volume_edge_cases", sentence: "دبحت خروف بـ 15000 وصرفت 2000 جزار ووزعت 5000 لحمة صدقة", expectedMinItems: 3, description: "Socio-religious ritual expense bulk" },
  { id: 95, category: "volume_edge_cases", sentence: "حولت 450 جنيه لأبانوب و 550 لجرجس", expectedMinItems: 2, description: "Coptic known names bulk" },
  { id: 96, category: "volume_edge_cases", sentence: "أديت شغالتي أم أحمد 200 جنيه", expectedMinItems: 1, description: "Compound title name (أم أحمد)" },
  { id: 97, category: "volume_edge_cases", sentence: "دفعت 600 جنيه إيجار الشغل و 300 لبواب العمارة و 100 لسايس الجراج", expectedMinItems: 3, description: "Three service provider entities in sequence" },
  { id: 98, category: "volume_edge_cases", sentence: "كسبت 500 جنيه من فريلانس ودفعت منها 100 جنيه كهربا", expectedMinItems: 2, description: "Linked transaction where income pays expense" },
  { id: 99, category: "volume_edge_cases", sentence: "حاسبت بـ 200 جنيه أكل في مطعم الشبراوي", expectedMinItems: 1, description: "Category resolution with direct merchant name" },
  { id: 100, category: "volume_edge_cases", sentence: "اشتريت شاحن موبايل بـ 120 وجبت سلك بـ 50", expectedMinItems: 2, description: "Two distinct items with standard digits" }
];

const KNOWN_PEOPLE = [
  { name: "مروان", category: "العائلة", subCategory: "أخ", relationship: "أخ" },
  { name: "محمود", category: "أصدقاء", subCategory: "صاحب", relationship: "صديق" },
];

async function main() {
  console.log("🚀 Starting 100 Comprehensive Classification Tests...");
  console.log(`Using GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? "CONFIGURED (AI enabled)" : "NOT CONFIGURED (AI disabled!)"}`);
  console.log("=".repeat(80));

  const results: any[] = [];
  let passedCount = 0;

  for (const tc of TEST_CASES) {
    console.log(`Testing [${tc.id}/100] Category: ${tc.category}`);
    console.log(`   Input: "${tc.sentence}"`);

    try {
      const start = Date.now();
      const res = await runSmartPipeline({
        text: tc.sentence,
        userId: 1,
        userType: "user",
        userPlan: "free",
        userDict: [],
        apiKey: process.env.GEMINI_API_KEY || "",
        groqApiKey: "",
        modelName: "gemini-2.5-flash",
        maxTokens: 2000,
        monthlyContext: { totalIncome: 5000, totalExpense: 2000 },
        userProfileContext: { knownPeople: KNOWN_PEOPLE },
        provider: "gemini"
      });
      const timeMs = Date.now() - start;

      const items = res.items || [];
      const isOkCount = items.length >= tc.expectedMinItems;
      const isOkType = !tc.expectedType || items.every((item: any) => item.type === tc.expectedType);
      const passed = isOkCount && isOkType;

      if (passed) passedCount++;

      const itemDetails = items.map((i: any) => ({
        amount: i.amount,
        type: i.type,
        category: i.category,
        subCategory: i.subCategory,
        person: i.person_mentioned || null,
        rel: i.person_relationship || null,
        confidence: i.confidence
      }));

      console.log(`   → Parsed By: ${res.parsedBy} | Time: ${timeMs}ms | Items Extracted: ${items.length}`);
      if (items.length > 0) {
        console.log(`   → Items: ${JSON.stringify(itemDetails)}`);
      } else {
        console.log(`   → Items: None`);
      }
      if (res.decision === "clarify") {
        console.log(`   💬 Clarification Triggered: "${res.clarificationQuestion}"`);
      }
      console.log(`   Result: ${passed ? "✅ PASSED" : "❌ FAILED"}`);
      console.log("-".repeat(50));

      results.push({
        id: tc.id,
        category: tc.category,
        sentence: tc.sentence,
        expectedMinItems: tc.expectedMinItems,
        actualCount: items.length,
        passed,
        parsedBy: res.parsedBy,
        decision: res.decision,
        clarificationQuestion: res.clarificationQuestion || null,
        items: itemDetails,
        timeMs
      });
    } catch (e: any) {
      console.error(`   ❌ ERROR running test: ${e.message}`);
      console.log("-".repeat(50));
      results.push({
        id: tc.id,
        category: tc.category,
        sentence: tc.sentence,
        expectedMinItems: tc.expectedMinItems,
        actualCount: 0,
        passed: false,
        error: e.message
      });
    }
  }

  console.log("=".repeat(80));
  console.log(`📊 FINAL METRICS: ${passedCount}/100 passed (${Math.round((passedCount/100)*100)}%)`);
  
  // Categorized breakdown
  const categories = ["number_formats", "slang_phrasing", "names_ambiguity", "volume_edge_cases"] as const;
  for (const cat of categories) {
    const catTests = results.filter(r => r.category === cat);
    const catPassed = catTests.filter(r => r.passed).length;
    console.log(`   - ${cat.toUpperCase()}: ${catPassed}/${catTests.length} passed (${Math.round((catPassed/catTests.length)*100)}%)`);
  }

  // Save report JSON for reference
  const fs = await import("fs");
  const reportPath = "./scratch/comprehensive_test_results.json";
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    passedCount,
    successRate: passedCount / 100,
    results
  }, null, 2));
  console.log(`\n💾 Detailed JSON results saved to: ${reportPath}`);
}

main().catch(console.error);
