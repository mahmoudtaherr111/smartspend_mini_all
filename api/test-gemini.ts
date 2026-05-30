import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "dotenv";
config({ path: "../.env" });

const SMART_CLASSIFIER_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["income", "expense", "transfer", "investment"] },
          amount: { type: "number" },
          main_category: { type: "string" },
          sub_category: { type: "string" },
          item_name: { type: "string" },
          confidence: { type: "number" },
          alertMessage: { type: "string" },
          needsClarification: { type: "boolean" },
          clarificationQuestion: { type: "string", nullable: true },
          person_mentioned: { type: "string", nullable: true },
          person_relationship: { type: "string", nullable: true },
          is_valid_transaction: { type: "boolean" },
        },
        required: [
          "type",
          "amount",
          "main_category",
          "sub_category",
          "item_name",
          "confidence",
          "alertMessage",
          "needsClarification"
        ],
      },
    },
  },
  required: ["items"],
} as any;

const prompt = `مصنف مالي مصري. صنّف العملية بدقة.
المستخدم يتكلم بعامية مصرية يومية (مثل "ضربت كشري"، "قعدت ع القهوة").
قواعد صارمة:
1) استخدم الفئات من القائمة فقط.
2) type = income/expense/transfer/investment
3) item_name = وصف مختصر للعملية.
4) confidence 0-100.
5) alertMessage: يجب ألا يكون فارغاً. لو إسراف واضح اكتب تحذير قصير(≤15 كلمة)، لو عادي اكتب "ok".

القاموس:
دفعت/صرفت/اشتريت/ركبت/اكلت/ضربت/خرجت/نزلت/قعدت=expense. جالي/قبضت=income.

الفئات المتاحة:
أكل وشرب→[وجبات سريعة,مطعم,قهوة وكافيه,سناكس,بقالة,مخبوزات,مشروبات,دليفري,لحوم ودواجن,سي فود,عام] | فواتير→[كهرباء,مياه,غاز,إنترنت,تليفون,شحن رصيد,أقساط,تأمين,ضرائب,عام] | تسوق→[ملابس,إلكترونيات,أحذية,عام] | متنوعات→[عام]

مطلوب JSON فقط.`;

async function testAI() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
  const geminiModel = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: prompt,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: SMART_CLASSIFIER_SCHEMA,
    },
  });

  const texts = [
    "انا صرفت 500 جنيه كلت بيها باستا",
    "صرفت 350 جبت بيهم بيبسي وريد بول ومياه",
    "صرفت 600 جنيه جبت بيهم بانطلون"
  ];

  for (const text of texts) {
      console.log(`\nTesting: ${text}`);
      try {
          const res = await geminiModel.generateContent(`النص: "${text}"`);
          console.log("Response:", res.response.text());
      } catch (e: any) {
          console.log("Error:", e.message);
      }
      await new Promise(r => setTimeout(r, 2000)); // sleep to avoid 429
  }
}

testAI().catch(console.error);
