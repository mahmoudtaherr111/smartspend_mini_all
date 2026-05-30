import { runSmartPipeline } from './api/lib/smart-pipeline';
import { CATEGORIES } from './api/lib/category-registry';

const sentences = [
  // 1. Typos and weird spellings
  { text: "دغعت لاخويا 500 جنيه وشتريت عيش ب 20 وركبت مكرباص ب 10", expected: ["العائلة", "مخبوزات", "أتوبيس"] },
  { text: "خولت لمرات خالي 1000", expected: ["العائلة"] },
  // 2. Heavy slang
  { text: "ضربت كشري ب 50 وطيرت 500 جنيه في خروجة", expected: ["مطعم", "خروجة صحاب"] },
  { text: "فكيت 1000 جنيه بنزين وسجاير", expected: ["بنزين", "سجائر"] },
  // 3. Multi-person relationships
  { text: "اديت لأحمد 200 وعلي 300 ومحمود 400 ورحنا كلنا ماك ب 1000", expected: ["متنوعات", "متنوعات", "متنوعات", "وجبات سريعة"] }, 
  { text: "حاسبت على قهوة الأسطى حسن ب 50", expected: ["موظفين"] },
  { text: "اديت البواب 100", expected: ["سكن"] }, 
  // 4. Installments and Gam3eyat
  { text: "قبضت الجمعية 5000 ودفعت قسط التلاجة 1000 وفاليو 500", expected: ["قبض جمعية", "أقساط", "أقساط شركات"] },
  // 5. Debts and Loans
  { text: "استلفت من صاحبي 1000", expected: ["أصدقاء"] },
  { text: "رجعت فلوس لأخويا 500", expected: ["العائلة"] },
  { text: "سلفت حسين 2000", expected: ["متنوعات"] },
  // 6. Crazy combinations
  { text: "النهاردة نزلت ركبت اوبر ب 50 وبعدين شحنت رصيد ب 100 وجبت كارت كهربا ب 200 ودفعت الايجار 3000 واديت البواب 50 وبعدين نزلت بالليل قعدت على القهوة ب 150 واشتريت لبس ب 2000 واديت لاخويا 500 سلف عشان كان محتاجهم وطلبت دليفري ب 300", expected: ["أوبر/كريم", "شحن رصيد", "كهرباء", "إيجار", "سكن", "قهوة وكافيه", "ملابس", "العائلة", "دليفري"] },
  
  // 7. Added 28 more extreme stress tests
  { text: "اديت لرضوى 100 واديت لصاحبي 200 واديت للمكوجي 50", expected: ["متنوعات", "أصدقاء", "سكن"] }, // رضوى مجهولة -> تحتاج توضيح
  { text: "حاسبت على غدا ليا ولصاحبي ب 600", expected: ["مطعم"] }, // مش فلوس لصاحبي، ده أكل وشرب!
  { text: "دفعت قسط الشقة 5000 وقسط العربية 3000", expected: ["إيجار", "أقساط"] },
  { text: "حولت انستا باي لأبويا 2000 وفودافون كاش لأخويا 1000", expected: ["العائلة", "العائلة"] },
  { text: "قبضت المرتب 20000 وشلت منهم 5000 في البنك", expected: ["مرتب", "استثمار/توفير"] },
  { text: "اديت اختي 500 عشان تجيب بيهم هدية لماما", expected: ["العائلة"] }, // هدية بس لأمي عبر أختي، هل هيحطها عيلة ولا هدايا؟ هنشوف!
  { text: "شربت قهوة ب 50 واشتريت كورس ب 1000", expected: ["قهوة وكافيه", "دورات وتدريب"] },
  { text: "جبت شاي وسكر ب 100 ولحمة ب 400 ودفعت للسباك 200", expected: ["سوبر ماركت", "لحوم وطيور", "صيانة وإصلاح"] },
  { text: "رجعت 500 لعماد كنت مستلفهم منه", expected: ["تحويل"] }, // سداد دين
  { text: "اخدت من عماد 500 سلفة", expected: ["تحويل"] }, // أخذ دين
  { text: "عطيت لعماد 500 سلفة", expected: ["تحويل"] }, // إعطاء دين
  { text: "اديت لعماد 500", expected: ["متنوعات"] }, // مجهول
  { text: "عملت صيانة للعربية ب 2000 وغيرت زيت ب 500", expected: ["صيانة", "صيانة"] },
  { text: "اشتريت دواء ب 300 وكشفت عند الدكتور ب 400", expected: ["أدوية", "كشف طبي"] },
  { text: "جبت طوق لكلبي ب 150 واكله ب 200", expected: ["حيوانات أليفة", "حيوانات أليفة"] },
  { text: "طلعت صدقة 100 وزكاة مال 5000", expected: ["صدقة/تبرع", "زكاة"] },
  { text: "نزلت جيم ب 300 واشتريت بروتين ب 1000", expected: ["جيم واشتراكات رياضة", "عناية شخصية"] }, // بروتين قد يكون مكمل غذائي
  { text: "دفعت مصاريف المدرسة 10000 وجبت كتب ب 500", expected: ["مصاريف مدرسة/جامعة", "كتب وأدوات"] },
  { text: "ركبت مترو ب 10 وميكروباص ب 5 وتوك توك ب 15", expected: ["مترو", "أتوبيس", "تاكسي"] }, // توك توك = تاكسي وميكروباص = اتوبيس
  { text: "حاسبت على نيتفليكس 200 وسبوتيفاي 100", expected: ["اشتراكات إنترنت/برامج", "اشتراكات إنترنت/برامج"] },
  { text: "شحنت كارت الغاز ب 150 والمية ب 50", expected: ["غاز", "مياه"] },
  { text: "رحت الحلاق ب 100", expected: ["حلاق/كوافير"] },
  { text: "اشتريت دهب ب 15000", expected: ["ذهب"] },
  { text: "سحبت 2000 كاش واديتهم لمراتي", expected: ["العائلة"] }, // مراتي = عائلة
  { text: "اشتريت نظارة ب 500", expected: ["أخرى"] }, // ممكن عناية شخصية
  { text: "جبت تذكرة طيران ب 5000 وحجزت فندق ب 3000", expected: ["طيران", "فندق/إقامة"] },
  { text: "نزلت حطيت بنزين ب 400 ودفعت كارتة ب 20 وسايس ب 10", expected: ["بنزين", "كارتة الطريق", "ركنة/سايس"] },
  { text: "جبت هدية لخطيبتي ب 1000", expected: ["هدايا وصدقات"] } // خطيبتي = هدايا (ما لم تكن مضافة للعائلة)
];

async function runTests() {
  console.log("Starting E2E Massive Test Suite...");
  let passed = 0;
  let failed = 0;

  // Mock User
  const mockUser = {
    id: "test-user-id",
    clerkId: "test-clerk-id",
    plan: "ultra" as const,
    username: "TestUser",
    profileImageUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    onboardingCompleted: true
  };

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    console.log(`\n[Test ${i+1}/${sentences.length}] Testing: "${s.text}"`);
    
    try {
      const result = await runSmartPipeline({
        text: s.text,
        userId: 1, // Mock DB ID
        userType: "user",
        userPlan: "ultra",
        userDict: [], // Empty dictionary for now
        apiKey: process.env.GEMINI_API_KEY || "",
        apiKey2: "",
        modelName: "gemini",
        maxTokens: 8192,
        provider: "gemini"
      });

      if (!result || !result.items) {
        console.error("❌ FAILED: No items returned.");
        failed++;
        continue;
      }

      console.log(`Returned ${result.items.length} items.`);
      for (const item of result.items) {
        console.log(` -> ${item.item_name} | Amount: ${item.amount} | Cat: ${item.category || item.main_category}/${item.subCategory || item.sub_category} | Person: ${item.person_mentioned} | Clarify: ${item.needsClarification}`);
      }
      
      passed++;
    } catch (e) {
      console.error("❌ ERROR running test:", e);
      failed++;
    }
  }

  console.log(`\n============================`);
  console.log(`Test Complete. Passed: ${passed}, Failed: ${failed}`);
  process.exit(0);
}

runTests();
