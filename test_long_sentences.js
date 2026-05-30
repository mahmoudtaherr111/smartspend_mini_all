import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = "YOUR_GEMINI_API_KEY_HERE"; // From .env
const MODEL = "gemini-2.5-flash"; // Assuming this is available, if not fallback to gemini-1.5-flash

const genAI = new GoogleGenerativeAI(API_KEY);

const systemPrompt = `أنت مستخرج ومصنف مالي مصري. اقرأ النص كاملاً، واستخرج جميع العمليات المالية المذكورة فيه بلا استثناء (حتى لو كانت 20 عملية في الجملة)، ثم صنفها بدقة. تجاهل أي مبالغ أو عمليات نفاها المستخدم (مثل: كنت هشتري ومشتريتش).
المستخدم يتكلم بعامية مصرية يومية (مثل "ضربت كشري"، "قعدت ع القهوة").
قواعد صارمة:
1) خطوة التفكير الإلزامي (Chain of Thought): يجب عليك أولاً استخراج جميع الجمل والعمليات المالية المستقلة ووضعها كنصوص في مصفوفة "decomposed_sentences". هذه الخطوة تضمن عدم نسيان أي عملية.
2) للجمل المركبة: افصل كل مبلغ واستخرج عمليته بشكل مستقل تماماً واربطه بالكلمات المجاورة له فقط (مثال: "لعبت بـ 20 وأكلت بـ 100" -> عمليتين: ألعاب بـ 20، ومطعم بـ 100). إياك أن تخلط سياق مبلغ بمبلغ آخر.
3) إذا كانت العملية مرتبطة بشخص، صنفها بناءً على العلاقة بدقة كالتالي: للأصحاب والزملاء استخدم فئة "أصدقاء". للأقارب استخدم فئة "العائلة". للعمال والموظفين عندك استخدم فئة "موظفين". **هام جداً:** الفئة الفرعية (sub_category) يجب أن تكون اسم الشخص ووصفه (مثال: "موظفين/عمر الموظف" أو "أصدقاء/محمود صاحبي") ولا تستخدم كلمة "عام" أبداً. الدفع لموظف أو صديق يكون نوعه "expense" دائماً إلا إذا كان دين أو سلفة واضحة فيكون "transfer".
4) إذا أشار المستخدم إلى توضيح شخص (مثال "التوضيح: صاحبتي")، تأكد من تصنيف الشخص المذكور قبلها كصديق واستخراج العلاقة بدقة في person_relationship.
5) خلاف ذلك، استخدم الفئات من القائمة فقط.
6) type = income/expense/transfer/investment
7) item_name = وصف مختصر للعملية.
8) confidence 0-100.
9) alertMessage: يجب ألا يكون فارغاً. لو إسراف واضح اكتب تحذير قصير(≤15 كلمة)، لو عادي اكتب "ok".
10) needsClarification: اجعلها true لو النص غير مفهوم تماماً أو لم يُذكر الشخص بوضوح، واكتب السؤال في clarificationQuestion.
11) person_mentioned: استخرج أي اسم إنسان/شخص طبيعي تم ذكره في المعاملة.
12) person_relationship: لو تم ذكر صلة القرابة للشخص المستخرج أو في التوضيح، اكتبها هنا بصيغة مفردة (مثل: صديق، أخ، موظف).
13) is_valid_transaction: اجعلها true فقط لو كان النص يمثل معاملة مالية واضحة.
14) قم بإرجاع مصفوفة (Array) تحتوي على كائن JSON لكل عملية مالية موجودة في النص (items).

يجب أن يكون الإخراج بهذا الهيكل بالضبط:
{
  "decomposed_sentences": ["الجملة الأولى المستخرجة", "الجملة الثانية المستخرجة"],
  "items": [
    {
      "type": "expense",
      "amount": 500,
      "main_category": "أكل وشرب",
      "sub_category": "مطعم",
      "item_name": "باستا",
      "confidence": 95,
      "alertMessage": "ok",
      "needsClarification": false,
      "clarificationQuestion": null,
      "person_mentioned": null,
      "person_relationship": null,
      "is_valid_transaction": true
    },
    {
      "type": "income",
      "amount": 14000,
      "main_category": "مرتب",
      "sub_category": "عام",
      "item_name": "فلوس شغل",
      "confidence": 90,
      "alertMessage": "ok",
      "needsClarification": false,
      "clarificationQuestion": null,
      "person_mentioned": "علي",
      "person_relationship": "مديري",
      "is_valid_transaction": true
    }
  ]
}

القاموس:
جالي/قبضت/كسبت/استلمت/دخللي/خدت=income. حولت لـ حساب/سلفت/سلف/دين=transfer. اديت/دفعت/صرفت/اشتريت/ركبت/اكلت/ضربت/خرجت=expense. (ملاحظة: الدفع لموظف أو صديق يعتبر expense إلا لو كان سلفة فهو transfer).

الفئات المتاحة:
أكل وشرب→[وجبات سريعة,مطعم,قهوة وكافيه,سناكس,بقالة,مخبوزات,مشروبات,دليفري,لحوم ودواجن,سي فود,عام] | مواصلات→[أوبر/كريم,مترو,أتوبيس,تاكسي,بنزين,ركنة,صيانة عربية,توكتوك,طيران,عام] | فواتير→[كهرباء,مياه,غاز,إنترنت,تليفون,شحن رصيد,أقساط,تأمين,ضرائب,عام] | سكن→[إيجار,أثاث,صيانة,نظافة,أجهزة منزلية,منظفات,عام] | تسوق→[ملابس,أجهزة إلكترونية,عناية شخصية,إكسسوارات,أحذية,عام] | صحة→[دكتور,صيدلية,تحاليل,مستشفى,أسنان,نظارات,عام] | تعليم→[مدرسة,جامعة,كورسات,كتب,دروس خصوصية,عام] | ترفيه→[سينما,كافيه,سفر,رياضة وجيم,ألعاب,منصات مشاهدة,خروجة,عام] | تدخين→[سجائر,فيب/ليكود,شيشة/معسل,عام] | هدايا وصدقات→[عيد ميلاد,فرح/خطوبة,صدقة/تبرع,زكاة,عيدية,عام] | مرتب→[راتب أساسي,مكافأة/بونص,إضافي (Overtime),عام] | عمل حر→[مشاريع (Freelance),استشارات,عمولة,عام]
مطلوب JSON فقط بصيغة: { "decomposed_sentences": [...], "items": [...] }`;

const tests = [
  // 1. Chaotic, long sequence with mixed context
  "النهارده كان يوم طويل أوي، نزلت الصبح ركبت أوبر بـ 85 جنيه وبعدين قعدت على كافيه شربت قهوة بـ 70 جنيه واشتريت فطار بـ 45، رحت الشغل ومحمود زميلي كان مستلف مني 500 جنيه ورجعهملي، وبعدين دفعت قسط الفيزا 2500 جنيه، بالليل خرجت مع أصحابي ولعبنا بلايستيشن دفعت 150 وبعدين أكلنا ودفعنا 350 جنيه، وقبل ما أروح عديت على الصيدلية جبت أدوية بـ 220 واشتريت علبة سجاير بـ 80، ولما روحت افتكرت إني نسيت أشحن باقة النت فشحنت بـ 300 جنيه.",
  
  // 2. High amount of small items + known contact handling + colloquial negations
  "كنت هروح الجيم وادفع 500 بس مروحتش، رحت اشتريت شوكولاتة ب 20 وشيبسي ب 15، وبعدين لقيت بتاع الطماطم جبت ب 30 خضار، اتصل بيا رامي أخويا قالي حول لي 2000 جنيه فبعتهمله، وبعدين افتكرت إني عايز أجدد اشتراك نتفليكس بـ 120، وخدت من علي 7000 جنيه علشان كنت بايع له لابتوب، وبعدين حطيت بنزين بـ 400، واشتريت كاوتش جديد للعربية بـ 3500، واديت البواب 50 جنيه.",
  
  // 3. The exact failing sequence provided by the user but made even longer
  "لعبت كرة بـ 20 جنيه، وبعدها نزلت بلاي ستيشن بـ 100، وبعدها رحت أكلت بـ 130 شاورما، اشتريت ريدبول بـ 50، وبعدين خدت من هبة 14 ألف، واديت سميرة 500 جنيه، وحولت لمحمد 1000، ودفعت فاتورة الكهربا 650، واشتريت لبس من زارا بـ 4500، وعملت صيانة لللاب توب بـ 800."
];

async function runTests() {
  const model = genAI.getGenerativeModel({
    model: MODEL,
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });

  for (let i = 0; i < tests.length; i++) {
    console.log(`\n\n=== Test ${i + 1} ===`);
    console.log(`Text: ${tests[i]}`);
    try {
      const result = await model.generateContent(`النص:\n${tests[i]}`);
      const text = result.response.text();
      console.log(`Response Token Count: ${result.response.usageMetadata?.totalTokenCount}`);
      const parsed = JSON.parse(text);
      console.log(`Extracted ${parsed.items?.length || 0} items.`);
      parsed.items?.forEach((item, idx) => {
        console.log(`  ${idx + 1}. [${item.type}] ${item.amount} EGP - ${item.main_category}/${item.sub_category} - ${item.item_name} (Mentions: ${item.person_mentioned || "None"})`);
      });
    } catch (e) {
      console.error("Error:", e.message);
    }
  }
}

runTests();
