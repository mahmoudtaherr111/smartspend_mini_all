import {
  buildConversationCapsule,
  draftConversationMemory,
  extractSemanticMemories,
} from "./memory-writer";

describe("AI memory writer helpers", () => {
  it("builds a small conversation capsule instead of storing full chat", () => {
    const capsule = buildConversationCapsule([
      { role: "user", content: "عايز احوش 100 الف جنيه عشان اجيب عربية خلال سنة ونحتاج خطة شهرية واضحة" },
      { role: "assistant", content: "تمام، هنقسم الهدف على شهور ونشوف المصاريف اللي ممكن تتقلل." },
    ]);

    expect(capsule.split(/\s+/).length).toBeLessThanOrEqual(30);
    expect(capsule).toContain("100");
  });

  it("does not turn recall/advice prompts plus assistant replies into memory capsules", () => {
    const capsule = buildConversationCapsule([
      { role: "user", content: "اعمل لي خطة أظبط القهوة والنوم وافتكر اللي اتفقنا عليه قبل كده" },
      {
        role: "assistant",
        content:
          "تمام، هبني لك خطة آمنة على البيانات المؤكدة من غير أرقام مخترعة: من بياناتك المؤكدة: المصروفات ٢٬٣٣٧٫٥ جنيه.",
      },
    ]);

    expect(capsule).toBe("استعلام ذاكرة بدون ذكرى جديدة");
  });

  it("extracts only important semantic memories from user messages", () => {
    const memories = extractSemanticMemories([
      { role: "user", content: "اهلا" },
      { role: "assistant", content: "اهلا بيك" },
      { role: "user", content: "اتفقنا اني احوش 100 الف عشان العربية ومش هلمس الفلوس دي" },
    ]);

    expect(memories).toHaveLength(1);
    expect(memories[0]).toMatchObject({
      type: "plan",
      importance: expect.any(Number),
    });
    expect(memories[0].content).toContain("100");
  });

  it("drafts capsule, running summary, and memories together", () => {
    const draft = draftConversationMemory({
      userId: 1,
      userType: "oauth",
      conversationId: 5,
      messages: [
        { role: "user", content: "عايز خطة ادخار للعربية" },
        { role: "assistant", content: "ممكن نبدأ بهدف شهري ونراجع مصاريف الاكل والمواصلات." },
      ],
    });

    expect(draft.capsule).toContain("عربية");
    expect(draft.runningSummary).toContain("user:");
    expect(draft.memories[0].content).toContain("عربية");
  });
});
