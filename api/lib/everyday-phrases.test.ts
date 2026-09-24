/**
 * Everyday Egyptian sentences the local engine used to get wrong while sure of itself —
 * saved on their own as the wrong category, the wrong direction or the wrong amount,
 * or answered with a question about a person who does not exist. No network, no DB.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { runSmartPipeline, type PipelineResult } from "./smart-pipeline";
import { mapModelName } from "./model-mapper";

vi.mock("../queries/connection", () => {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, { from: self, where: self, orderBy: self, values: self, set: self,
    limit: async () => [], then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve) });
  return { db: { select: self, insert: self, update: self, query: {} }, pool: {} };
});
vi.mock("./muscle-memory", () => ({ muscleMemoryLookup: async () => null }));
vi.mock("./ai-gateway", () => ({ resolveAdminRoutes: async () => ({ preferred: null, routes: [] }) }));
vi.mock("./llm-router", async (original) => ({ ...await original<object>(),
  executeLlmChain: async () => { throw new Error("offline: no provider"); } }));

let userId = 983000;
async function parse(text: string): Promise<PipelineResult> {
  return runSmartPipeline({ text, userId: userId++, userType: "local", userPlan: "free", userDict: [],
    apiKey: "", modelName: mapModelName("flash"), maxTokens: 512, userProfileContext: { knownPeople: [] } });
}
const brief = (r: PipelineResult) => r.items.map((i) => [i.amount, i.category, i.type]);

beforeAll(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("a word inside another word is not that word", () => {
  it("does not read اخي in واخيرا, nor امي in ياميش", async () => {
    expect(brief(await parse("واخيرا دفعت 300 بنزين"))).toEqual([[300, "مواصلات", "expense"]]);
    expect(brief(await parse("ياميش رمضان 600"))).toEqual([[600, "أكل وشرب", "expense"]]);
  });
});

describe("gifts given are spending", () => {
  it("files eidiya, a birth gift and wedding money as gifts, not salary", async () => {
    expect(brief(await parse("عيدية للعيال 500"))).toEqual([[500, "هدايا وصدقات", "expense"]]);
    expect(brief(await parse("هدية سبوع 300"))).toEqual([[300, "هدايا وصدقات", "expense"]]);
    expect(brief(await parse("نقطة فرح 500"))).toEqual([[500, "هدايا وصدقات", "expense"]]);
  });

  it("reads a gift received with a receiving verb as a gift received", async () => {
    const result = await parse("خدت عيدية من خالي 200");
    expect(result.items[0]?.type).toBe("income");
    expect(result.items[0]?.category).toBe("هدايا وعيديات");
    expect(result.items[0]?.subCategory).toBe("عيدية");
  });

  it("does not save unexplained income as salary on its own", async () => {
    const result = await parse("احمد رجعلي 500");
    expect(result.decision).not.toBe("auto_save");
  });
});

describe("money coming in is named by where it came from", () => {
  it("files money back from a return as a refund", async () => {
    const result = await parse("رجعت الجزمة واخدت فلوسي 300");
    expect(brief(result)).toEqual([[300, "دخل آخر", "income"]]);
    expect(result.items[0]?.subCategory).toBe("مرتجعات واسترداد");
  });

  it("files the price of something sold as a sale", async () => {
    const result = await parse("بعت الموبايل القديم ب 4000");
    expect(brief(result)).toEqual([[4000, "دخل آخر", "income"]]);
    expect(result.items[0]?.subCategory).toBe("بيع حاجة");
  });

  it("files income with no named source as other income, not salary", async () => {
    const result = await parse("استلمت 500");
    expect(result.items[0]?.type).toBe("income");
    expect(result.items[0]?.category).not.toBe("مرتب");
    expect(result.decision).not.toBe("auto_save");
  });

  it("still files a salary that is named", async () => {
    expect(brief(await parse("قبضت المرتب 12000"))).toEqual([[12000, "مرتب", "income"]]);
  });
});

describe("purpose before person and payment rail", () => {
  it("files what the money was for, not who it was for", async () => {
    const school = await parse("دفعت مصاريف مدرسة ابني 12000");
    expect(brief(school)).toEqual([[12000, "تعليم", "expense"]]);
    expect(brief(await parse("اديت ماما 1000"))).toEqual([[1000, "العائلة", "expense"]]);
  });

  it("files what a card or a wallet paid for, not the card or the wallet", async () => {
    expect(brief(await parse("دفعت بالفيزا 300 في المطعم"))).toEqual([[300, "أكل وشرب", "expense"]]);
    expect(brief(await parse("دفعت 200 بفودافون كاش للسباك"))).toEqual([[200, "سكن", "expense"]]);
    expect(brief(await parse("حولت 1000 بانستاباي"))).toEqual([[1000, "تحويل", "transfer"]]);
  });

  it("names a kin word without the preposition before it", async () => {
    const result = await parse("حولت لامي 1000");
    expect(result.items[0]?.person_mentioned).toBe("امي");
  });
});

describe("loans and bank loans", () => {
  it("files paying back what one owes as a loan moving out", async () => {
    const result = await parse("رجعت لمحمد الفلوس اللي عليا 300");
    expect(result.items[0]?.type).toBe("transfer");
    expect(result.items[0]?.subCategory).toBe("دين/سلفة");
  });

  it("files a bank loan's installment and interest as spending", async () => {
    const installment = await parse("دفعت قسط القرض 2000");
    expect(brief(installment)).toEqual([[2000, "أقساط وفوايد", "expense"]]);
    const interest = await parse("دفعت فوائد القرض 700");
    expect(brief(interest)).toEqual([[700, "أقساط وفوايد", "expense"]]);
    expect(interest.items[0]?.subCategory).toBe("فوايد قروض");
  });

  it("files cash taken from a card as an ATM withdrawal", async () => {
    const result = await parse("سحبت 2000 من الفيزا");
    expect(brief(result)).toEqual([[2000, "تحويل", "transfer"]]);
    expect(result.items[0]?.subCategory).toBe("سحب ATM");
  });
});

describe("kids", () => {
  it("files the nursery and baby milk under kids", async () => {
    const nursery = await parse("مصاريف الحضانة 1500");
    expect(brief(nursery)).toEqual([[1500, "أطفال", "expense"]]);
    expect(nursery.items[0]?.subCategory).toBe("حضانة");
    expect(brief(await parse("لبن للبيبي 300"))).toEqual([[300, "أطفال", "expense"]]);
    expect(brief(await parse("بامبرز 250"))).toEqual([[250, "أطفال", "expense"]]);
  });
});

describe("amounts", () => {
  it("multiplies spoken hundreds", async () => {
    expect(brief(await parse("دفعت خمس مية ايجار"))).toEqual([[500, "سكن", "expense"]]);
  });

  it("reads bottled water as a drink and not as 100", async () => {
    expect(brief(await parse("ازازة مية 10"))).toEqual([[10, "أكل وشرب", "expense"]]);
  });

  it("does not invent an 8 from تمن, nor a 92 from the fuel grade", async () => {
    expect(brief(await parse("دفعت تمن الأكل 50"))).toEqual([[50, "أكل وشرب", "expense"]]);
    expect(brief(await parse("بنزين 92 ب 400"))).toEqual([[400, "مواصلات", "expense"]]);
  });
});

describe("everyday words", () => {
  it("reads lunch as a meal, not as tomorrow", async () => {
    expect(brief(await parse("جبت غدا ب 150"))).toEqual([[150, "أكل وشرب", "expense"]]);
  });

  it("keeps a category the engine already named", async () => {
    // The final normalization used to re-read "مشروع" as a freelance project.
    expect(brief(await parse("ركبت مشروع ب 10"))).toEqual([[10, "مواصلات", "expense"]]);
    expect(brief(await parse("الف وميتين ايجار العربية"))).toEqual([[1200, "مواصلات", "expense"]]);
  });

  it("keeps the trade named by بتاع", async () => {
    expect(brief(await parse("اديت بتاع اللبن 50"))).toEqual([[50, "أكل وشرب", "expense"]]);
  });

  it("tells a face cream from Careem and a gas cylinder from the stove", async () => {
    expect(brief(await parse("اشتريت كريم للوش 150"))).toEqual([[150, "عناية شخصية", "expense"]]);
    expect(brief(await parse("انبوبة البوتاجاز 150"))).toEqual([[150, "فواتير", "expense"]]);
  });
});

describe("people", () => {
  it("does not ask about a person who is not there", async () => {
    for (const text of ["رجعت الجزمة واخدت فلوسي 300", "خدت منه 150"]) {
      const result = await parse(text);
      expect(result.clarificationQuestion ?? "").not.toMatch(/مين/);
    }
  });

  it("still asks about a real name", async () => {
    const result = await parse("اديت مروان 200");
    expect(result.clarificationQuestion).toMatch(/مروان/);
  });
});
