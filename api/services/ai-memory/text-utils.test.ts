import { isLowSignalMemoryText, keywordTokens, specificTokenScore } from "./text-utils";

describe("AI memory text scoring", () => {
  it("ignores Arabic conversational glue words when focusing memory results", () => {
    const query = "فاكر خطة الكاميرا والموبايل اللي اتكلمنا عنها؟";
    const foodSummary =
      "في الشهر الحالي، إجمالي صرفك على الأكل هو ٦٥٩٫٥ جنيه من ٥ عملية. العمليات اللي دخلت في الرقم: صرفت 375 جنيه في كارفور";
    const cameraPlan = "حطلي هدف احوش 91000 عشان اجيب كاميرا خلال 9 شهور بس ما تنفذش غير لما أأكد";
    const mobilePlan = "حطلي هدف احوش 90000 عشان اجيب موبايل خلال 9 شهور بس ما تنفذش غير لما أأكد";

    expect([...keywordTokens(query)]).toEqual(expect.arrayContaining(["كاميرا", "موبايل"]));
    expect([...keywordTokens(query)]).not.toContain("اللي");
    expect(specificTokenScore(query, cameraPlan)).toBeGreaterThan(0);
    expect(specificTokenScore(query, mobilePlan)).toBeGreaterThan(0);
    expect(specificTokenScore(query, foodSummary)).toBeLessThanOrEqual(0);
  });

  it("does not treat generic plan words as a subject match", () => {
    const query = "فاكر الخطة اللي اتكلمنا عنها عشان الموبايل؟";
    const carPlan =
      "عايز أحوش 100000 جنيه عشان أجيب عربية خلال 12 شهر، ناقشني في الخطة وجهز هدف بس ما تنفذش غير لما أوافق";
    const mobilePlan = "حطلي هدف احوش 90000 عشان اجيب موبايل خلال 9 شهور بس ما تنفذش غير لما أأكد";

    expect(specificTokenScore(query, carPlan)).toBeLessThanOrEqual(0);
    expect(specificTokenScore(query, mobilePlan)).toBeGreaterThan(0);
  });

  it("treats prefixed recall prompts as low-signal memory text", () => {
    expect(
      isLowSignalMemoryText("اعمل لي خطة أقلل مصاريف القهوة عشان أنام أحسن وافتكر اللي اتكلمنا عنه قبل كده"),
    ).toBe(true);
    expect(
      isLowSignalMemoryText("اعمل لي خطة أقلل القهوة والنوم وافتكر اللي اتفقنا عليه قبل كده"),
    ).toBe(true);
    expect(
      isLowSignalMemoryText("في الشهر الحالي، إجمالي صرفك على الأكل هو ٦٥٩٫٥ جنيه. العمليات اللي دخلت في الرقم: قهوة الصبح"),
    ).toBe(true);
  });
});
