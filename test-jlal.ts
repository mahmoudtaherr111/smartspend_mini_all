import { classifySegmentFree } from "./api/lib/classifier-free-v2";
import { decomposeHeuristic } from "./api/lib/narrative-decomposer";

async function run() {
  const text = "اديت 500 جنيه لجلال (صاحبي)";
  const decomp = decomposeHeuristic(text);
  const segment = decomp.segments[0];
  console.log("Segment:", segment);

  // We need an API key. Since we don't have one loaded, let's mock the API call or just look at the prompt.
  const { CATEGORIES } = await import("./api/lib/category-registry.js");
  function buildFocusedCategories(segment: any): string {
    if (segment.direction === "income") {
      return CATEGORIES.filter(
        (c: any) => c.type === "income" || c.type === "transfer",
      )
        .map(
          (c: any) =>
            `${c.name_ar}:[${c.subcategories.map((s: any) => s.name_ar).join(",")}]`,
        )
        .join("|");
    }
    if (segment.direction === "investment") {
      return CATEGORIES.filter(
        (c: any) => c.type === "investment" || c.name_ar === "متنوعات",
      )
        .map(
          (c: any) =>
            `${c.name_ar}:[${c.subcategories.map((s: any) => s.name_ar).join(",")}]`,
        )
        .join("|");
    }
    if (segment.direction === "transfer") {
      return CATEGORIES.filter(
        (c: any) =>
          c.type === "transfer" ||
          c.name_ar === "هدايا وصدقات" ||
          c.name_ar === "معاملات عائلية" ||
          c.name_ar === "متنوعات",
      )
        .map(
          (c: any) =>
            `${c.name_ar}:[${c.subcategories.map((s: any) => s.name_ar).join(",")}]`,
        )
        .join("|");
    }
    return CATEGORIES.filter((c: any) => c.type === "expense")
      .map(
        (c: any) =>
          `${c.name_ar}:[${c.subcategories.map((s: any) => s.name_ar).join(",")}]`,
      )
      .join("|");
  }

  const cats = buildFocusedCategories(segment);

  const systemPrompt = `مصنف مالي مصري.صنّف العملية الواحدة دي بدقة.

قواعد:
1)استخدم فقط الفئات من القائمة.
2)item_name=وصف السلعة باختصار.
3)confidence 0-100.
4)"جالي/إداني/قبضت/استلمت"=income."دفعت/صرفت/اشتريت/ركبت"=expense.
5)"حولت لـ/سلفت"=transfer.
6)"دهب/أسهم/شهادة"=investment.
7) للأشخاص: 
   - أبويا/مراتي/أخويا → فئة "معاملات عائلية" والفرعية اسم الشخص فقط (مثل: أحمد). 
   - صاحبي/صديقتي → فئة "أصدقاء" والفرعية اسم الشخص فقط.
   - موظف/عامل/ميكانيكي/بواب → لو علاقة مهنية/خدمة تكون الفئة حسب الخدمة (مثل "خدمات سيارات" أو "موظفين وعمال") والفرعية اسم الشخص فقط.
  • أوبر/كريم/ديدي/اندرايفر/سويفل → مواصلات/أوبر وكريم (أو أتوبيس لسويفل).
• كارفور/هايبر/كازيون/بيم/سوبر ماركت/بقالة → أكل وشرب/بقالة.
• صيدلية/علاج/دكتور/مستشفى/العزبي/رشدي → صحة.
• غاز/كهرباء/مياه/شحن كارت → فواتير/مرافق.
• قسط/فاليو/سهولة/كونتكت/أمان → فئة "التزامات وجمعيات" والفرعية "أقساط شركات".
   وإذا تم ذكر اسم شخص غير مسجل ولا توجد قرابة واضحة أعط confidence أقل من 50.
الفئات:${cats}
JSON فقط.`;

  console.log("System Prompt:\n", systemPrompt);

  const directionHint =
    segment.direction !== "unknown"
      ? ` الاتجاه:${segment.direction === "income" ? "دخل" : segment.direction === "expense" ? "مصروف" : segment.direction === "transfer" ? "تحويل" : "استثمار"}`
      : "";
  const amountHint = segment.amount ? ` المبلغ:${segment.amount}` : "";
  const userPrompt = `"${segment.text}"${directionHint}${amountHint}`;

  console.log("\nUser Prompt:\n", userPrompt);
}

run();
