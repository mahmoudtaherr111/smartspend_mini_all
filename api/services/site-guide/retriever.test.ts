import {
  SITE_GUIDE_EMBEDDING_DIMENSIONS,
  buildSiteGuideEmbedding,
  searchSiteGuide,
} from "./index";

describe("site guide retrieval phase 6", () => {
  it("uses 256 dimensional static embeddings", () => {
    expect(buildSiteGuideEmbedding("ازاي اربط SMS").length).toBe(SITE_GUIDE_EMBEDDING_DIMENSIONS);
  });

  it("retrieves SMS setup guidance", () => {
    const result = searchSiteGuide("ازاي اربط رسائل SMS عشان تسجل مصاريف البنك؟", 2);

    expect(result.chunks[0]).toMatchObject({
      area: "sms",
    });
    expect(result.facts[0].value).toContain("SMS");
    expect(result.artifacts[0]).toMatchObject({
      type: "text_block",
      payload: expect.objectContaining({ embeddingDimensions: 256 }),
    });
  });

  it("retrieves card and visa linking guidance", () => {
    const result = searchSiteGuide("ازاي اربط فيزا البنك في التطبيق؟", 2);

    expect(result.chunks[0]).toMatchObject({
      area: "card",
    });
    expect(result.facts[0].label).toContain("الفيزا");
  });

  it("prioritizes card and SMS guidance for bank-account phrasing", () => {
    const result = searchSiteGuide("إزاي أربط حسابي البنكي أو الفيزا بالتطبيق؟", 3);

    expect(result.chunks[0]).toMatchObject({ area: "card" });
    expect(result.chunks[1]).toMatchObject({ area: "sms" });
    expect(result.facts[0].value).toContain("آخر أربعة أرقام");
    expect(result.facts[1].value).toContain("SMS");
  });
});
