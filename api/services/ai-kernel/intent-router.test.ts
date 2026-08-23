import { compileDataNeeds } from "./data-need-compiler";
import { routeIntent } from "./intent-router";

describe("AI kernel intent routing", () => {
  it("routes simple finance totals to small summary data needs", () => {
    const intent = routeIntent("صرفت كام النهارده؟");
    const needs = compileDataNeeds(intent);

    expect(intent.kind).toBe("finance_query");
    expect(intent.slots.period).toBe("today");
    expect(needs).toHaveLength(1);
    expect(needs[0]).toMatchObject({
      kind: "finance.summary",
      priority: "hot",
      scope: { period: "today" },
      maxRows: 1,
    });
  });

  it("routes category finance questions to exact category totals", () => {
    const intent = routeIntent("صرفت كام في الاكل الشهر ده بالظبط؟");
    const needs = compileDataNeeds(intent);

    expect(intent.kind).toBe("finance_query");
    expect(intent.slots.category).toBe("food");
    expect(needs.map((need) => need.kind)).toEqual([
      "finance.category_total",
      "finance.transactions",
    ]);
  });

  it("routes wallet balance questions to wallet summary only", () => {
    const intent = routeIntent("فاضل كام في محافظي؟");
    const needs = compileDataNeeds(intent);

    expect(intent.kind).toBe("finance_query");
    expect(intent.slots.wallet).toBe(true);
    expect(needs.map((need) => need.kind)).toEqual(["wallet.summary"]);
  });

  it("routes month comparison to a structured current-vs-previous comparison", () => {
    const intent = routeIntent("قارن مصاريفي الشهر ده بالشهر اللي فات");
    const needs = compileDataNeeds(intent);

    expect(intent.kind).toBe("finance_analysis");
    expect(intent.slots.metric).toBe("comparison");
    expect(needs).toHaveLength(1);
    expect(needs[0]).toMatchObject({
      kind: "finance.period_comparison",
      scope: { period: "current_month", comparePeriod: "previous_month" },
    });
  });

  it("treats top-category questions as finance analysis even without the word expenses", () => {
    const intent = routeIntent("أعلى الفئات الشهر ده");
    const needs = compileDataNeeds(intent);

    expect(intent.kind).toBe("finance_analysis");
    expect(needs.map((need) => need.kind)).toEqual(["finance.summary", "finance.breakdown"]);
  });

  it("adds a canonical-person lookup for spending questions about a named relation", () => {
    const intent = routeIntent("صرفت كام على ماما الشهر ده؟");
    const needs = compileDataNeeds(intent);

    expect(intent.kind).toBe("finance_query");
    expect(needs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "finance.person_total",
        scope: expect.objectContaining({
          period: "current_month",
          personQuery: expect.any(String),
        }),
      }),
    ]));
  });

  it("routes a category-list question to a monthly breakdown instead of today's generic summary", () => {
    const intent = routeIntent("وريني تصنيفات مصاريفي الشهر ده");
    const needs = compileDataNeeds(intent);

    expect(intent).toMatchObject({
      kind: "finance_analysis",
      reason: "category_breakdown_match",
      slots: { period: "current_month" },
    });
    expect(needs.map((need) => need.kind)).toEqual(["finance.summary", "finance.breakdown"]);
  });

  it("routes classification explanation questions to transaction evidence, not generic actions", () => {
    const intent = routeIntent("كارفور الخضار واللحمة اتحسب أكل ولا تسوق؟ ولو غلط أعمل إيه؟");
    const needs = compileDataNeeds(intent);

    expect(intent).toMatchObject({
      kind: "finance_analysis",
      reason: "classification_explanation_match",
      slots: expect.objectContaining({
        category: "food",
        categories: ["food", "shopping"],
        needsEvidence: true,
      }),
    });
    expect(needs.map((need) => need.kind)).toEqual(["finance.classification_trace", "finance.transactions", "finance.breakdown", "finance.category_inclusion"]);
    expect(needs[1]).toMatchObject({
      priority: "hot",
      scope: expect.objectContaining({
        categories: ["food", "shopping"],
        transactionTypes: ["expense"],
      }),
    });
  });

  it("routes goal planning to profile, goals, summary, and breakdown needs", () => {
    const intent = routeIntent("عايز احوش 100 الف عشان اجيب عربيه");
    const needs = compileDataNeeds(intent);

    expect(intent.kind).toBe("goal_planning");
    expect(needs.map((need) => need.kind)).toEqual([
      "profile.snapshot",
      "goals.active",
      "finance.summary",
      "finance.breakdown",
    ]);
  });

  it("routes goal progress questions to the dedicated goal progress need", () => {
    const intent = routeIntent("وصلت كام في أهداف الادخار بتاعتي؟");
    const needs = compileDataNeeds(intent);

    expect(intent.kind).toBe("goal_planning");
    expect(needs.map((need) => need.kind)).toEqual(["finance.goal_progress"]);
    expect(needs[0]).toMatchObject({
      priority: "hot",
      maxRows: 8,
    });
  });

  it("routes site help and memory questions away from finance tools", () => {
    expect(routeIntent("ازاي اربط الفيزا بال SMS؟").kind).toBe("site_help");
    expect(routeIntent("فاكر اتفقنا على ايه في خطة العربيه؟").kind).toBe("memory_question");
  });

  it("distinguishes card-linking help from direct wallet actions", () => {
    expect(routeIntent("ازاي اربط الفيزا بالرسائل SMS؟").kind).toBe("site_help");
    expect(routeIntent("اربط كارت فيزا آخر 4321").kind).toBe("action_request");
    expect(routeIntent("اربط كارت فيزا آخر 8642 رصيد 9091")).toMatchObject({
      kind: "action_request",
      reason: "direct_site_action_keyword_match",
    });
  });

  it("does not match short finance tokens inside unrelated words", () => {
    const intent = routeIntent("فاكر خطة الكاميرا والموبايل؟ اذكر الرقم والمدة بس");

    expect(intent.kind).toBe("memory_question");
  });

  it("keeps action/advice requests primary when they ask to reuse memory", () => {
    const intent = routeIntent("اعمل لي خطة أقلل القهوة والنوم وافتكر اللي اتفقنا عليه قبل كده");
    const needs = compileDataNeeds(intent);

    expect(intent.kind).toBe("advice_request");
    expect(needs.map((need) => need.kind)).toContain("memory.search");
  });

  it("detects custom periods from user message", () => {
    const intent3Months = routeIntent("صرفت كام اخر ٣ شهور؟");
    expect(intent3Months.slots.period).toBe("custom");
    expect(intent3Months.slots.startDate).toBeDefined();
    expect(intent3Months.slots.endDate).toBeDefined();

    const intentMonth5 = routeIntent("صرفت كام في شهر ٥؟");
    expect(intentMonth5.slots.period).toBe("custom");
    expect(intentMonth5.slots.startDate).toContain("-05-01");
  });
});
