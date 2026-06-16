import { extractSemanticMemories } from "./memory-writer";

describe("AI memory writer semantic signals", () => {
  it("captures preferences and constraints as embeddable memories without an LLM", () => {
    const memories = extractSemanticMemories([
      { role: "user", content: "انا بحب القهوة بس بكره الدليفري ومش عايز اصرف عليه كتير" },
      { role: "user", content: "خلي حد اقصي للاكل 2000 جنيه الشهر ده وما تنفذش اي هدف غير لما اكد" },
    ]);

    expect(memories).toHaveLength(2);
    expect(memories[0]).toMatchObject({
      type: "preference",
      metadata: expect.objectContaining({ reason: "preference_signal" }),
    });
    expect(memories[1]).toMatchObject({
      type: "plan",
      metadata: expect.objectContaining({ reason: "commitment_or_constraint_signal" }),
    });
  });

  it("remembers important product-help friction so later site-guide followups can use memory search", () => {
    const memories = extractSemanticMemories([
      { role: "user", content: "ازاي اربط الفيزا بالرسائل SMS عشان المصاريف تتسجل تلقائي؟" },
    ]);

    expect(memories).toHaveLength(1);
    expect(memories[0]).toMatchObject({
      type: "fact",
      importance: 52,
      metadata: expect.objectContaining({ reason: "site_help_interest_signal" }),
    });
    expect(memories[0].content).toContain("SMS");
  });

  it("does not store recall/advice prompts as long-term semantic memories", () => {
    const memories = extractSemanticMemories([
      {
        role: "user",
        content: "اعمل لي خطة أقلل مصاريف القهوة عشان أنام أحسن وافتكر اللي اتكلمنا عنه قبل كده",
      },
      {
        role: "user",
        content: "اعمل لي خطة أقلل القهوة والنوم وافتكر اللي اتفقنا عليه قبل كده",
      },
    ]);

    expect(memories).toHaveLength(0);
  });
});
