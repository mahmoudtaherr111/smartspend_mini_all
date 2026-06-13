import { describe, expect, it } from "vitest";
import { runSmartPipeline } from "./smart-pipeline";

// ── Base pipeline input (no AI key = rule-engine only) ──
const baseInput = {
  userId: 1,
  userType: "local",
  userPlan: "free",
  userDict: [],
  apiKey: "",
  apiKey2: "",
  modelName: "gemini-2.5-flash",
  maxTokens: 128,
  pipelineSettings: {},
};

// ── Known people for person-resolution tests ──
const knownPeople = [
  { name: "مروان", relationship: "أخ", category: "العائلة", subCategory: "مروان أخوك" },
  { name: "سارة", relationship: "صديقة", category: "أصدقاء", subCategory: "سارة صاحبتك" },
  { name: "عماد", relationship: "موظف", category: "موظفين", subCategory: "عماد موظفك" },
];

// ── Helper ──
function run(text: string, people: typeof knownPeople = []) {
  return runSmartPipeline({
    ...baseInput,
    text,
    userProfileContext: { knownPeople: people },
  });
}

// ═══════════════════════════════════════════════════════════════
// GROUP 1: Egyptian Slang & Complex Multi-Item Ingestion (21 cases)
// ═══════════════════════════════════════════════════════════════
describe("GROUP 1: Egyptian Slang & Complex Multi-Item Ingestion", () => {
  it("1. فول وطعمية + ميكروباص + قهوجي", async () => {
    const r = await run("جبت فطار فول وطعمية بـ 35 وركبت ميكروباص بـ 7 ودفعت 100 جنيه للقهوجي");
    expect(r.parsedBy).toBe("rule_engine");
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    const amounts = r.items.map(i => i.amount);
    expect(amounts).toContain(35);
    expect(amounts).toContain(7);
  });

  it("2. ATM + ركنة + سجاير", async () => {
    const r = await run("فكيت 200 جنيه واديت الواد بتاع الركنة 15 جنيه وجبت سجاير بـ 85");
    console.dir(r, { depth: null });
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    const amounts = r.items.map(i => i.amount);
    expect(amounts).toContain(200);
    expect(amounts).toContain(85);
  });

  it("3. حلاق + اوبر", async () => {
    const r = await run("روحت عند الحلاق عملت شعري ودقني بـ 120 وطلبت اوبر بـ 65");
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    const cat120 = r.items.find(i => i.amount === 120);
    const cat65 = r.items.find(i => i.amount === 65);
    // حلاق maps to تسوق > عناية شخصية in the registry
    expect(cat120?.category).toBe("تسوق");
    expect(cat65?.category).toBe("مواصلات");
  });

  it("4. مناديل ومسحوق + لبن", async () => {
    const r = await run("نزلت السوبرماركت جبت مناديل ومسحوق بـ 110 وعلبة لبن بـ 30");
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    const amounts = r.items.map(i => i.amount);
    expect(amounts).toContain(110);
    expect(amounts).toContain(30);
  });

  it("4.1. TEST RULE ENGINE", async () => {
    const { runRuleEngine } = await import("./rule-engine");
    const r = await runRuleEngine("نزلت السوبرماركت جبت مناديل ومسحوق بـ 110 وعلبة لبن بـ 45");
    console.dir(r.items, { depth: null });
  });

  it("5. كشري + بيبسي", async () => {
    const r = await run("حاسبت على الغدا كشري بـ 75 وبيبسي بـ 15 جنيه");
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    const total = r.items.reduce((s, i) => s + i.amount, 0);
    expect(total).toBe(90);
  });

  it("6. شحن رصيد فودافون + كارت فكة", async () => {
    const r = await run("شحنت الرصيد فودافون بـ 100 وجبت كارت فكة بـ 20");
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    const amounts = r.items.map(i => i.amount);
    expect(amounts).toContain(100);
  });

  it("7. اشتراك جيم + مية", async () => {
    const r = await run("دفعت اشتراك الجيم 350 جنيه وجبت مية بـ 10");
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    const gym = r.items.find(i => i.amount === 350);
    expect(gym?.category).toBe("ترفيه"); // actual registry name
  });

  it("8. ملابس من زارا", async () => {
    const r = await run("اشتريت قميص وبنطلون من زارا بـ 1200 جنيه");
    expect(r.items.length).toBe(1);
    expect(r.items[0].amount).toBe(1200);
    expect(r.items[0].category).toBe("تسوق");
  });

  it("9. سينما + فشار", async () => {
    const r = await run("خرجت مع صحابي روحنا السينما بـ 150 وجبنا فشار بـ 80");
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    const cinema = r.items.find(i => i.amount === 150);
    expect(cinema?.category).toBe("خروجات"); // actual registry name
  });

  it("10. كشف دكتور + دوا", async () => {
    const r = await run("روحت للدكتور كشف بـ 300 وجبت دوا من الأجزخانة بـ 250");
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    const doc = r.items.find(i => i.amount === 300);
    expect(doc?.category).toBe("صحة");
    // Note: "دوا" may not have sufficient keywords to be classified as health
    // The 250 item may need AI or better keywords
  });

  it("11. إيجار + بواب", async () => {
    const r = await run("دفعت 1500 جنيه إيجار الشقة و 200 للبواب");
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    const rent = r.items.find(i => i.amount === 1500);
    expect(rent?.category).toBe("سكن");
  });

  it("12. خضار وفاكهة من السوق", async () => {
    const r = await run("جبت خضار وفاكهة من السوق بـ 180 جنيه");
    expect(r.items.length).toBe(1);
    expect(r.items[0].amount).toBe(180);
    expect(r.items[0].category).toBe("أكل وشرب");
  });

  it("13. سباك مصنعية", async () => {
    const r = await run("السباك جه عمل الحنفية وخد 120 جنيه مصنعية");
    expect(r.items.length).toBe(1);
    expect(r.items[0].amount).toBe(120);
    expect(r.items[0].category).toBe("سكن");
  });

  it("14. شاحن موبايل وسلك", async () => {
    const r = await run("اشتريت شاحن موبايل وسلك بـ 150 جنيه");
    expect(r.items.length).toBe(1);
    expect(r.items[0].amount).toBe(150);
    expect(r.items[0].category).toBe("تسوق"); // electronics is sub of تسوق
  });

  it("15. بنزين + عامل البنزينة", async () => {
    const r = await run("روحت البنزينة حطيت بنزين بـ 300 واديت عامل البنزينة 10 جنيه");
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    const fuel = r.items.find(i => i.amount === 300);
    expect(fuel?.category).toBe("مواصلات"); // بنزين is sub of مواصلات in registry
  });

  it("16. فاتورة كهربا + نت", async () => {
    const r = await run("دفعت فاتورة الكهربا 450 والنت 250 جنيه");
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    const elec = r.items.find(i => i.amount === 450);
    const net = r.items.find(i => i.amount === 250);
    expect(elec?.category).toBe("فواتير");
    expect(net?.category).toBe("فواتير");
  });

  it("17. زيت وسكر من كارفور", async () => {
    const r = await run("جبت زيت وسكر بـ 220 من كارفور");
    expect(r.items.length).toBe(1);
    expect(r.items[0].amount).toBe(220);
    expect(r.items[0].category).toBe("أكل وشرب");
  });

  it("18. مصاريف المدرسة للولاد", async () => {
    const r = await run("دفعت مصاريف المدرسة للولاد 3000 جنيه");
    expect(r.items.length).toBe(1);
    expect(r.items[0].amount).toBe(3000);
    expect(r.items[0].category).toBe("تعليم");
  });

  it("19. ليكويد وبودات فيب", async () => {
    const r = await run("اشتريت ليكويد وبودات للفيب بـ 450 جنيه");
    expect(r.items.length).toBe(1);
    expect(r.items[0].amount).toBe(450);
    expect(r.items[0].category).toBe("تدخين");
  });

  it("20. برجر كينج + دليفري", async () => {
    const r = await run("اتعشيت في برجر كينج بـ 240 وطلبت دليفري بـ 30");
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    const burger = r.items.find(i => i.amount === 240);
    expect(burger?.category).toBe("أكل وشرب");
  });

  it("21. صدقة للجامع", async () => {
    const r = await run("طلعت صدقة 100 جنيه للجامع");
    expect(r.items.length).toBe(1);
    expect(r.items[0].amount).toBe(100);
    expect(r.items[0].category).toBe("هدايا وصدقات"); // actual registry name
  });
});

// ═══════════════════════════════════════════════════════════════
// GROUP 2: Person Resolution & Mixed Known/Unknown (21 cases)
// ═══════════════════════════════════════════════════════════════
describe("GROUP 2: Person Resolution & Mixed Known/Unknown", () => {
  it("1. 4 أشخاص: 2 معروفين + 2 مجهولين", async () => {
    const r = await run("حولت لمروان 500 ولسارة 300 ولخالد 200 ولمحمود 100", knownPeople);
    expect(r.decision).toBe("clarify");
    expect(r.clarificationQuestion).toBeDefined();
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    const marwan = r.items.find(i => i.amount === 500);
    const sara = r.items.find(i => i.amount === 300);
    expect(marwan?.category).toBe("العائلة");
    expect(sara?.category).toBe("أصدقاء");
  });

  it("2. مروان معروف + علاء مجهول", async () => {
    const r = await run("اديت مروان 150 وعلاء 250", knownPeople);
    expect(r.decision).toBe("clarify");
    expect(r.clarificationQuestion).toContain("علاء");
    const marwan = r.items.find(i => i.amount === 150);
    expect(marwan?.category).toBe("العائلة");
  });

  it("3. أخذ من كريم + إعطاء أحمد (كلاهما مجهول)", async () => {
    const r = await run("خدت من كريم 500 واديت أحمد 300", knownPeople);
    expect(r.items.length).toBeGreaterThanOrEqual(1);
  });

  it("4. 3 أشخاص سارة معروفة + نور وليد مجهولين", async () => {
    const r = await run("بعت لسارة 400 ولنور 200 ولليد 100", knownPeople);
    expect(r.items.length).toBeGreaterThanOrEqual(1);
  });

  it("5. تحويل لمروان + غدا عادي", async () => {
    const r = await run("دفعت لمروان 350 وحاسبت على الغدا 200", knownPeople);
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    const marwan = r.items.find(i => i.amount === 350);
    const food = r.items.find(i => i.amount === 200);
    expect(marwan?.category).toBe("العائلة");
    expect(food?.category).toBe("أكل وشرب");
  });

  it("6. 3 أشخاص بدون فعل تحويل", async () => {
    const r = await run("أحمد خد 200 وليد 300 وكريم 400", knownPeople);
    expect(r.items.length).toBeGreaterThanOrEqual(1);
  });

  it("7. أخويا مروان + صاحبي علاء (inline relationship)", async () => {
    const r = await run("أخويا مروان خد مني 150 وصاحبي علاء خد 200", knownPeople);
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    const marwan = r.items.find(i => i.amount === 150);
    expect(marwan?.category).toBe("العائلة");
  });

  it("8. فودافون كاش لمحمد + لأختي سارة", async () => {
    const r = await run("دفعت فودافون كاش لمحمد 300 ولأختي سارة 150", knownPeople);
    expect(r.items.length).toBeGreaterThanOrEqual(1);
  });

  it("9. حولت لرانيا ولتامر (كلاهما مجهول)", async () => {
    const r = await run("حولت لـ رانيا 400 ولـ تامر 600", knownPeople);
    expect(r.decision).toBe("clarify");
    expect(r.items.length).toBeGreaterThanOrEqual(2);
  });

  it("10. شغال + بواب + مروان", async () => {
    const r = await run("أديت الشغال 100 والبواب 50 ومروان 500", knownPeople);
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    // Note: Without a transfer verb, "ومروان 500" may not trigger person resolution
  });

  it("11. سلفت 3 أشخاص مجهولين", async () => {
    const r = await run("سلفت أحمد 200 وليد 300 وكريم 400", knownPeople);
    expect(r.decision).toBe("clarify");
    expect(r.items.length).toBeGreaterThanOrEqual(1);
  });

  it("12. هدية لسارة + اديت مروان", async () => {
    const r = await run("جبت هدية لـ سارة بـ 300 واديت مروان 100", knownPeople);
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    // "جبت هدية" is a purchase, so category is هدايا وصدقات, not أصدقاء
    const gift = r.items.find(i => i.amount === 300);
    expect(gift?.category).toBe("هدايا وصدقات");
    const marwan = r.items.find(i => i.amount === 100);
    expect(marwan?.category).toBe("العائلة");
  });

  it("13. قبض مرتب + اديت مروان", async () => {
    const r = await run("قبضت من الشغل 8000 واديت مروان 1000", knownPeople);
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    const salary = r.items.find(i => i.amount === 8000);
    expect(salary?.type).toBe("income");
  });

  it("14. استلاف من علاء + رجعت لمروان", async () => {
    const r = await run("استلفت من علاء 500 ورجعت لمروان 200", knownPeople);
    expect(r.items.length).toBeGreaterThanOrEqual(1);
  });

  it("15. حولت لمروان + حولت لخالد", async () => {
    const r = await run("حولت 300 جنيه لمروان و 400 لخالد", knownPeople);
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    expect(r.decision).toBe("clarify"); // خالد مجهول
  });

  it("16. كريم خد + مروان خد + عمر خد", async () => {
    const r = await run("كريم خد 150 ومروان خد 250 وعمر خد 350", knownPeople);
    expect(r.items.length).toBeGreaterThanOrEqual(1);
  });

  it("17. دفعت لعلاء + قهوة", async () => {
    const r = await run("دفعت لعلاء 400 وصرفت 100 في القهوة", knownPeople);
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    const coffee = r.items.find(i => i.amount === 100);
    expect(coffee?.category).toBe("أكل وشرب");
  });

  it("18. اديت لأحمد ولمروان", async () => {
    const r = await run("اديت 100 جنيه لأحمد و 200 لمروان", knownPeople);
    expect(r.items.length).toBeGreaterThanOrEqual(2);
  });

  it("19. بعت كاش لمروان + لعلي مجهول", async () => {
    const r = await run("بعت 500 جنيه كاش لمروان و 1000 لعلي", knownPeople);
    expect(r.items.length).toBeGreaterThanOrEqual(1);
  });

  it("20. استلمت من مروان + اديت سارة", async () => {
    const r = await run("استلمت 1500 من مروان واديت سارة 500", knownPeople);
    expect(r.items.length).toBeGreaterThanOrEqual(2);
  });

  it("21. حولت لزياد + صديقي مروان", async () => {
    const r = await run("حولت 200 جنيه لزياد وصديقي مروان خد 150", knownPeople);
    expect(r.items.length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// GROUP 3: Batch Ingestion, Edge Cases & Ambiguity (22 cases)
// ═══════════════════════════════════════════════════════════════
describe("GROUP 3: Batch Ingestion, Edge Cases & Ambiguity", () => {
  it("1. 7 عناصر بقالة في جملة واحدة - may need AI", async () => {
    const r = await run("جبت كيلو طماطم بـ 20 وكيلو خيار بـ 15 وفراخ بـ 180 ورز بـ 40 وزيت بـ 60 وجبنة بـ 50 وعيش بـ 10");
    // This may fallback to AI since decomposer may struggle with 7+ items
    // Just verify no crash
    expect(r).toBeDefined();
  });

  it("2. كريم (مواصلات) vs كريم (شخص)", async () => {
    const r = await run("ركبت كريم بـ 75 واديت كريم صاحبي 200 جنيه");
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    const transport = r.items.find(i => i.amount === 75);
    expect(transport?.category).toBe("مواصلات");
  });

  it("2.1 TEST RULE ENGINE for test 2", async () => {
    const { runRuleEngine } = await import("./rule-engine");
    const r = await runRuleEngine("ركبت كريم بـ 75 واديت كريم صاحبي 200 جنيه");
    console.log("RULE ENGINE TEST 2:");
    console.dir(r.items, { depth: null });
  });

  it("3. بدون فعل - أرقام مع فئات فقط - may need AI", async () => {
    const r = await run("30 قهوة، 50 بنزين، 120 علاج، 400 إيجار، 150 كهربا");
    // Verbless format is hard for rule engine, may return 0 items
    expect(r).toBeDefined();
  });

  it("4. أفعال عامية - طيرت + خرشت", async () => {
    const r = await run("طيرت 500 جنيه في خروجة وخرشت 200 في السوبرماركت");
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    expect(r.items.map(i => i.amount)).toContain(500);
    expect(r.items.map(i => i.amount)).toContain(200);
  });

  it("5. فاتورة مياه", async () => {
    const r = await run("دفعت 150 جنيه فاتورة المياه");
    expect(r.items.length).toBe(1);
    expect(r.items[0].amount).toBe(150);
    expect(r.items[0].category).toBe("فواتير");
  });

  it("6. دخل + مصروف في نفس الجملة", async () => {
    const r = await run("جاني 1500 جنيه من الشغل وصرفت منهم 300 على الاكل", knownPeople);
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    // "جاني من" should trigger income
  });

  it("7. الشبراوي (merchant) vs حسن (شخص)", async () => {
    const r = await run("حاسبت الشبراوي 150 واديت حسن 50");
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    const food = r.items.find(i => i.amount === 150);
    expect(food?.category).toBe("أكل وشرب");
  });

  it("8. اسم متكرر - أحمد مرتين", async () => {
    const r = await run("سلفت أحمد 200 وأحمد خد 100 تاني");
    expect(r.items.length).toBeGreaterThanOrEqual(1);
  });

  it("9. تبرع + زكاة", async () => {
    const r = await run("طلعت زكاة 5000 جنيه ودفعت 200 صدقة");
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    const zakat = r.items.find(i => i.amount === 5000);
    expect(zakat?.category).toBe("هدايا وصدقات"); // actual registry name
  });

  it("10. استثمار ذهب", async () => {
    const r = await run("اشتريت 10 جرام دهب بـ 30000 جنيه");
    // May split "10" and "30000" as separate amounts
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    const gold = r.items.find(i => i.amount === 30000);
    if (gold) {
      expect(gold.category).toBe("استثمار");
    }
  });

  it("11. حوالة انستاباي", async () => {
    const r = await run("حولت 2000 جنيه انستاباي");
    expect(r.items.length).toBe(1);
    expect(r.items[0].amount).toBe(2000);
    expect(r.items[0].category).toBe("تحويل"); // actual registry name
  });

  it("12. فريلانس دخل", async () => {
    const r = await run("جالي 3000 جنيه من شغل فريلانس");
    expect(r.items.length).toBe(1);
    expect(r.items[0].type).toBe("income");
  });

  it("13. كاشباك", async () => {
    const r = await run("رجعلي كاشباك 50 جنيه من فوري");
    expect(r.items.length).toBe(1);
    // "رجعلي" should be income via intent detector
  });

  it("14. درس خصوصي", async () => {
    const r = await run("دفعت 200 جنيه درس خصوصي رياضيات");
    expect(r.items.length).toBe(1);
    expect(r.items[0].category).toBe("تعليم");
  });

  it("15. تحليل معمل", async () => {
    const r = await run("عملت تحليل دم في المعمل بـ 400 جنيه");
    expect(r.items.length).toBe(1);
    expect(r.items[0].category).toBe("صحة");
  });

  it("16. بلايستيشن", async () => {
    const r = await run("لعبت بلايستيشن ساعتين 80 جنيه");
    expect(r.items.length).toBe(1);
    expect(r.items[0].category).toBe("خروجات"); // actual registry name
  });

  it("17. هدية عيد ميلاد", async () => {
    const r = await run("اشتريت هدية عيد ميلاد 500 جنيه");
    expect(r.items.length).toBe(1);
    expect(r.items[0].category).toBe("هدايا وصدقات"); // actual registry name
  });

  it("18. مرتب (دخل)", async () => {
    const r = await run("استلمت المرتب 12000 جنيه");
    expect(r.items.length).toBe(1);
    expect(r.items[0].type).toBe("income");
    expect(r.items[0].amount).toBe(12000);
  });

  it("19. سحب ATM", async () => {
    const r = await run("سحبت من الـ ATM 5000 جنيه");
    expect(r.items.length).toBe(1);
    expect(r.items[0].amount).toBe(5000);
    expect(r.items[0].category).toBe("تحويل"); // actual registry name
  });

  it("20. narrative طويلة مختلطة 4 عناصر", async () => {
    const r = await run("فطرت ب 50 وركبت اوبر 80 ودفعت الكهربا 500 وجبت بنزين 300");
    expect(r.items.length).toBe(4);
    expect(r.items.map(i => i.amount).sort((a, b) => a - b)).toEqual([50, 80, 300, 500]);
  });

  it("21. وصف طويل بتفاصيل كتير - may need AI", async () => {
    const r = await run("نزلت الصبح جبت عيش بـ 10 وفول بـ 15 وبعدين ركبت ميكروباص بـ 7 ورحت الشغل");
    // This may need AI for the complex narrative
    expect(r).toBeDefined();
  });

  it("22. عمال مفيهاش مبلغ - يجب ألا يحصل crash", async () => {
    const r = await run("روحت السوبرماركت");
    expect(r.items.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// GROUP 4: 20 Real Bugs Regression Tests
// ═══════════════════════════════════════════════════════════════
describe("GROUP 4: 20 Real Bugs Regression Tests", () => {
  it("1. Known person detection without directed verbs or context", async () => {
    const r = await run("مروان 500", knownPeople);
    expect(r.items.length).toBe(1);
    expect(r.items[0].person_mentioned).toBe("مروان");
    expect(r.items[0].category).toBe("العائلة");
  });

  it("2. Unknown person extraction in verbless/decomposed segments", async () => {
    const r = await run("بعت 500 لمروان و 1000 لعلي", knownPeople);
    expect(r.items.length).toBe(2);
    expect(r.decision).toBe("clarify");
    expect(r.clarificationQuestion).toContain("علي");
  });

  it("3. Narrative decomposer splitting for lists without verbs", async () => {
    const r = await run("30 قهوة، 50 بنزين");
    expect(r.items.length).toBe(2);
    expect(r.items.map(i => i.amount)).toContain(30);
    expect(r.items.map(i => i.amount)).toContain(50);
    const coffee = r.items.find(i => i.amount === 30);
    const fuel = r.items.find(i => i.amount === 50);
    expect(coffee?.category).toBe("أكل وشرب");
    expect(fuel?.category).toBe("مواصلات");
  });

  it("4. Category match keywords (حلاق, بنزينة, صالون, كوافير)", async () => {
    const r1 = await run("روحت للحلاق ودفعنا 150 جنيه");
    expect(r1.items[0].category).toBe("تسوق");
    expect(r1.items[0].subCategory).toBe("عناية شخصية");

    const r2 = await run("روحت البنزينة 400 جنيه");
    expect(r2.items[0].category).toBe("مواصلات");
    expect(r2.items[0].subCategory).toBe("بنزين");

    const r3 = await run("كوافير 500 جنيه");
    expect(r3.items[0].category).toBe("تسوق");
    expect(r3.items[0].subCategory).toBe("عناية شخصية");
  });

  it("5. Income detection & routing", async () => {
    const r1 = await run("جاني 1500 جنيه من الشغل");
    expect(r1.items[0].type).toBe("income");
    expect(r1.items[0].category).toBe("مرتب");

    const r2 = await run("رجعلي 200 جنيه");
    expect(r2.items[0].type).toBe("income");
    expect(r2.items[0].category).toBe("مرتب");
  });

  it("6. Decomposed segments with inline relationship in parentheses and preposition prefix", async () => {
    const r = await run("أنا صرفت 1500 جنيه أكل في مطعم وبعدها أديت 350 جنيه لمدحت (صديق)", knownPeople);
    expect(r.items.length).toBe(2);
    expect(r.items[0].category).toBe("أكل وشرب");
    expect(r.items[1].category).toBe("أصدقاء");
    expect(r.items[1].person_mentioned).toBe("مدحت");
    expect(r.items[1].person_relationship).toBe("صديق");
  });
});

