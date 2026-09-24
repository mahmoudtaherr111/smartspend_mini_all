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

  it("still reads a gift received with a receiving verb as income", async () => {
    const result = await parse("خدت عيدية من خالي 200");
    expect(result.items[0]?.type).toBe("income");
  });

  it("does not save unexplained income as salary on its own", async () => {
    const result = await parse("احمد رجعلي 500");
    expect(result.decision).not.toBe("auto_save");
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
    expect(brief(await parse("اشتريت كريم للوش 150"))).toEqual([[150, "تسوق", "expense"]]);
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
