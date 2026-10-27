import {
  SITE_GUIDE_EMBEDDING_DIMENSIONS,
  buildSiteGuideEmbedding,
  searchSiteGuide,
} from "./index";

describe("site guide retrieval phase 6", () => {
  it("uses 256 dimensional static embeddings", () => {
    expect(buildSiteGuideEmbedding("ازاي اربط SMS").length).toBe(SITE_GUIDE_EMBEDDING_DIMENSIONS);
  });

  it("says plainly that bank messages are not recorded on their own today", () => {
    const result = searchSiteGuide("ازاي اربط رسائل SMS عشان تسجل مصاريف البنك؟", 2);

    expect(result.chunks[0]).toMatchObject({ id: "expenses:bank_messages" });
    expect(result.facts[0].value).toContain("مش متاح دلوقتي");
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

  it("prioritizes card guidance for bank-account phrasing", () => {
    const result = searchSiteGuide("إزاي أربط حسابي البنكي أو الفيزا بالتطبيق؟", 3);

    expect(result.chunks[0]).toMatchObject({ area: "card" });
    expect(result.facts[0].value).toContain("آخر أربعة أرقام");
  });

  it("answers an iPhone or Android bank-message question with the same honest answer", () => {
    expect(searchSiteGuide("ازاي اربط رسايل البنك على الآيفون؟", 1).chunks[0]).toMatchObject({ id: "expenses:bank_messages" });
    expect(searchSiteGuide("ازاي اربط اشعارات البنك على الاندرويد", 1).chunks[0]).toMatchObject({ id: "expenses:bank_messages" });
  });
});
