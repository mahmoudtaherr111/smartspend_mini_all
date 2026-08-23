import { describe, expect, it } from "vitest";
import { runSmartPipeline } from "./smart-pipeline";

type ExpectedItem = {
  amount: number;
  category: string;
  subCategory?: string;
  type?: "income" | "expense" | "transfer" | "investment";
};

type GoldenCase = {
  name: string;
  text: string;
  expectedDecision?: "auto_save" | "review" | "clarify";
  expectedQuestionIncludes?: string;
  expectedItems: ExpectedItem[];
  knownPeople?: Array<{
    name: string;
    relationship: string;
    category: string;
    subCategory: string;
  }>;
};

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

const knownPeople = [
  {
    name: "مروان",
    relationship: "أخ",
    category: "العائلة",
    subCategory: "مروان أخوك",
  },
  {
    name: "سارة",
    relationship: "صديقة",
    category: "أصدقاء",
    subCategory: "سارة صاحبتك",
  },
  {
    name: "عماد",
    relationship: "موظف",
    category: "موظفين",
    subCategory: "عماد موظفك",
  },
];

const goldenCases: GoldenCase[] = [
  {
    name: "coffee with amount after preposition",
    text: "شربت قهوة ب 35 جنيه",
    expectedItems: [{ amount: 35, category: "أكل وشرب", subCategory: "قهوة وكافيه" }],
  },
  {
    name: "bakery without explicit expense verb",
    text: "عيش من الفرن 20 جنيه",
    expectedItems: [{ amount: 20, category: "أكل وشرب", subCategory: "مخبوزات" }],
  },
  {
    name: "groceries in colloquial wording",
    text: "اشتريت خضار وفاكهة 180",
    expectedItems: [{ amount: 180, category: "أكل وشرب", subCategory: "بقالة" }],
  },
  {
    name: "delivery",
    text: "طلبت دليفري 220",
    expectedItems: [{ amount: 220, category: "أكل وشرب", subCategory: "دليفري" }],
  },
  {
    name: "uber",
    text: "ركبت اوبر 80",
    expectedItems: [{ amount: 80, category: "مواصلات", subCategory: "أوبر/كريم" }],
  },
  {
    name: "microbus",
    text: "ركبت ميكروباص 15",
    expectedItems: [{ amount: 15, category: "مواصلات", subCategory: "أتوبيس" }],
  },
  {
    name: "parking attendant",
    text: "دفعت للسايس 20",
    expectedItems: [{ amount: 20, category: "خدمات سيارات", subCategory: "ركنة" }],
  },
  {
    name: "car oil change",
    text: "غيرت زيت العربية 650",
    expectedItems: [{ amount: 650, category: "خدمات سيارات", subCategory: "تغيير زيت" }],
  },
  {
    name: "rent",
    text: "دفعت الايجار 5000",
    expectedItems: [{ amount: 5000, category: "سكن", subCategory: "إيجار" }],
  },
  {
    name: "plumber maintenance",
    text: "السباك خد 250",
    expectedItems: [{ amount: 250, category: "سكن", subCategory: "صيانة" }],
  },
  {
    name: "home cleaning supplies",
    text: "جبت منظفات للبيت 140",
    expectedItems: [{ amount: 140, category: "سكن", subCategory: "منظفات" }],
  },
  {
    name: "electricity bill",
    text: "فاتورة الكهربا 450",
    expectedItems: [{ amount: 450, category: "فواتير", subCategory: "كهرباء" }],
  },
  {
    name: "internet bill",
    text: "دفعت النت الارضي 360",
    expectedItems: [{ amount: 360, category: "فواتير", subCategory: "إنترنت" }],
  },
  {
    name: "mobile recharge",
    text: "شحنت رصيد 100",
    expectedItems: [{ amount: 100, category: "فواتير", subCategory: "شحن رصيد" }],
  },
  {
    name: "clothes shopping",
    text: "اشتريت هدوم جديدة 900",
    expectedItems: [{ amount: 900, category: "تسوق", subCategory: "ملابس" }],
  },
  {
    name: "haircut",
    text: "حلقت ب 120",
    expectedItems: [{ amount: 120, category: "تسوق", subCategory: "عناية شخصية" }],
  },
  {
    name: "electronics cable",
    text: "جبت سلك شاحن 75",
    expectedItems: [{ amount: 75, category: "تسوق", subCategory: "أجهزة إلكترونية" }],
  },
  {
    name: "doctor",
    text: "كشف دكتور 400",
    expectedItems: [{ amount: 400, category: "صحة", subCategory: "دكتور" }],
  },
  {
    name: "pharmacy",
    text: "علاج من الصيدلية 260",
    expectedItems: [{ amount: 260, category: "صحة", subCategory: "صيدلية" }],
  },
  {
    name: "lab analysis",
    text: "عملت تحليل دم 300",
    expectedItems: [{ amount: 300, category: "صحة", subCategory: "تحاليل" }],
  },
  {
    name: "school fees",
    text: "مصاريف المدرسة 1200",
    expectedItems: [{ amount: 1200, category: "تعليم", subCategory: "مدرسة" }],
  },
  {
    name: "private lesson",
    text: "دفعت درس خصوصي 250",
    expectedItems: [{ amount: 250, category: "تعليم", subCategory: "دروس خصوصية" }],
  },
  {
    name: "cinema",
    text: "دخلت سينما 180",
    expectedItems: [{ amount: 180, category: "ترفيه", subCategory: "سينما" }],
  },
  {
    name: "gym subscription",
    text: "اشتراك الجيم 700",
    expectedItems: [{ amount: 700, category: "ترفيه", subCategory: "رياضة وجيم" }],
  },
  {
    name: "playstation outing",
    text: "لعبت بلايستيشن 90",
    expectedItems: [{ amount: 90, category: "ترفيه", subCategory: "ألعاب" }],
  },
  {
    name: "cigarettes",
    text: "علبة سجاير 65",
    expectedItems: [{ amount: 65, category: "تدخين", subCategory: "سجائر" }],
  },
  {
    name: "vape liquid",
    text: "ليكود فيب 180",
    expectedItems: [{ amount: 180, category: "تدخين", subCategory: "فيب/ليكود" }],
  },
  {
    name: "charity",
    text: "طلعت صدقة 100",
    expectedItems: [{ amount: 100, category: "هدايا وصدقات", subCategory: "صدقة/تبرع" }],
  },
  {
    name: "birthday gift",
    text: "هدية عيد ميلاد 350",
    expectedItems: [{ amount: 350, category: "هدايا وصدقات", subCategory: "عيد ميلاد" }],
  },
  {
    name: "salary",
    text: "قبضت المرتب 15000",
    expectedItems: [{ amount: 15000, category: "مرتب", subCategory: "مرتب أساسي", type: "income" }],
  },
  {
    name: "freelance side job",
    text: "جالي من سبوبة فريلانس 1800",
    expectedItems: [{ amount: 1800, category: "عمل حر", subCategory: "سبوبة", type: "income" }],
  },
  {
    name: "cashback income",
    text: "كاش باك 70",
    expectedItems: [{ amount: 70, category: "عوائد استثمار", subCategory: "كاش باك", type: "income" }],
  },
  {
    name: "atm withdrawal",
    text: "سحبت من ATM 2000",
    expectedItems: [{ amount: 2000, category: "تحويل", subCategory: "سحب ATM", type: "transfer" }],
  },
  {
    name: "instapay transfer",
    text: "تحويل انستاباي 1000",
    expectedItems: [{ amount: 1000, category: "تحويل", subCategory: "انستاباي", type: "transfer" }],
  },
  {
    name: "gold investment",
    text: "اشتريت دهب ب 6000",
    expectedItems: [{ amount: 6000, category: "استثمار", subCategory: "ذهب", type: "investment" }],
  },
  {
    name: "known family person without lam prefix",
    text: "اديت مروان 500",
    knownPeople,
    expectedItems: [{ amount: 500, category: "العائلة", subCategory: "مروان أخوك" }],
  },
  {
    name: "known friend with attached lam",
    text: "حولت لسارة 300",
    knownPeople,
    expectedItems: [{ amount: 300, category: "أصدقاء", subCategory: "سارة صاحبتك" }],
  },
  {
    name: "known employee",
    text: "دفعت لعماد 1200",
    knownPeople,
    expectedItems: [{ amount: 1200, category: "موظفين", subCategory: "عماد موظفك" }],
  },
  {
    name: "mixed known and unknown batch people",
    text: "حولت لمروان 500 ولسارة 300 ولخالد 200 ولمحمود 100",
    knownPeople,
    expectedDecision: "clarify",
    expectedQuestionIncludes: "خالد و محمود",
    expectedItems: [
      { amount: 500, category: "العائلة", subCategory: "مروان أخوك" },
      { amount: 300, category: "أصدقاء", subCategory: "سارة صاحبتك" },
      { amount: 200, category: "تحويل", subCategory: "أشخاص" },
      { amount: 100, category: "تحويل", subCategory: "أشخاص" },
    ],
  },
  {
    name: "unknown person should clarify",
    text: "اديت باسم 400",
    expectedDecision: "clarify",
    expectedQuestionIncludes: "مين باسم",
    expectedItems: [{ amount: 400, category: "متنوعات" }],
  },
  {
    name: "inline relationship should learn family",
    text: "اديت باسم 400 التوضيح: اخويا",
    expectedItems: [{ amount: 400, category: "العائلة", subCategory: "باسم أخوك" }],
  },
  {
    name: "three local expenses in one sentence",
    text: "فطرت ب 50 وركبت اوبر 80 ودفعت النت 360",
    expectedItems: [
      { amount: 50, category: "أكل وشرب", subCategory: "وجبات سريعة" },
      { amount: 80, category: "مواصلات", subCategory: "أوبر/كريم" },
      { amount: 360, category: "فواتير", subCategory: "إنترنت" },
    ],
  },
  {
    name: "long mixed expense narrative",
    text: "جبت عيش 20 وركبت مترو 10 واشتريت هدوم 900 وكشف دكتور 400 وعلبة سجاير 65",
    expectedItems: [
      { amount: 20, category: "أكل وشرب", subCategory: "مخبوزات" },
      { amount: 10, category: "مواصلات", subCategory: "مترو" },
      { amount: 900, category: "تسوق", subCategory: "ملابس" },
      { amount: 400, category: "صحة", subCategory: "دكتور" },
      { amount: 65, category: "تدخين", subCategory: "سجائر" },
    ],
  },
  {
    name: "long narrative with known person",
    text: "شربت قهوة 35 وبعدها ركبت كريم 90 وكمان اديت مروان 500 ودفعت الكهربا 450",
    knownPeople,
    expectedItems: [
      { amount: 35, category: "أكل وشرب", subCategory: "قهوة وكافيه" },
      { amount: 90, category: "مواصلات", subCategory: "أوبر/كريم" },
      { amount: 500, category: "العائلة", subCategory: "مروان أخوك" },
      { amount: 450, category: "فواتير", subCategory: "كهرباء" },
    ],
  },
  {
    name: "long narrative stops for unknown person but keeps previous items",
    text: "شربت قهوة 35 وركبت كريم 90 واديت باسم 500 ودفعت الكهربا 450",
    expectedDecision: "clarify",
    expectedQuestionIncludes: "مين باسم",
    expectedItems: [
      { amount: 35, category: "أكل وشرب", subCategory: "قهوة وكافيه" },
      { amount: 90, category: "مواصلات", subCategory: "أوبر/كريم" },
      { amount: 500, category: "متنوعات", subCategory: "أشخاص" },
      { amount: 450, category: "فواتير", subCategory: "كهرباء" },
    ],
  },
  {
    name: "transfer to known person Seif",
    text: "حولت لسيف 500 جنيه",
    knownPeople: [
      {
        name: "سيف",
        relationship: "صديق",
        category: "أصدقاء",
        subCategory: "سيف صديقك",
      },
    ],
    expectedItems: [{ amount: 500, category: "أصدقاء", subCategory: "سيف صديقك" }],
  },
  {
    name: "medicine from Seif Pharmacy",
    text: "علاج من صيدلية سيف 100 جنيه",
    expectedItems: [{ amount: 100, category: "صحة", subCategory: "صيدلية" }],
  },
  {
    name: "conjunction prefix without spaces",
    text: "100 جنيه مواصلات وب50 جنيه أكل",
    expectedItems: [
      { amount: 100, category: "مواصلات" },
      { amount: 50, category: "أكل وشرب" },
    ],
  },
  {
    name: "waw-starting word وجبة should not split",
    text: "دفعت 100 جنيه وجبة كشري",
    expectedItems: [{ amount: 100, category: "أكل وشرب" }],
  },
];

function assertItem(actual: any, expected: ExpectedItem) {
  expect(actual.amount).toBe(expected.amount);
  expect(actual.category).toBe(expected.category);
  if (expected.subCategory) expect(actual.subCategory).toBe(expected.subCategory);
  if (expected.type) expect(actual.type).toBe(expected.type);
}

describe("classification golden suite for Egyptian colloquial inputs", () => {
  it.each(goldenCases)("$name", async (testCase) => {
    const result = await runSmartPipeline({
      ...baseInput,
      text: testCase.text,
      userProfileContext: { knownPeople: testCase.knownPeople || [] },
    });

    expect(result.tokensUsed, result.clarificationQuestion).toBe(0);
    expect(result.parsedBy, result.clarificationQuestion).toMatch(/rule_engine|hybrid/);
    if (testCase.expectedDecision) {
      expect(result.decision).toBe(testCase.expectedDecision);
    } else {
      expect(result.decision).toMatch(/auto_save|review/);
    }
    if (testCase.expectedQuestionIncludes) {
      expect(result.clarificationQuestion).toContain(
        testCase.expectedQuestionIncludes,
      );
    }
    expect(result.items).toHaveLength(testCase.expectedItems.length);
    testCase.expectedItems.forEach((expected, index) => {
      assertItem(result.items[index], expected);
    });
  });
});
