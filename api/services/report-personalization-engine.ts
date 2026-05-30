import type { BehaviorSnapshotResult } from "./lifestyle-inference-engine";
import type { SmartUserProfile } from "./user-profile-service";

export function buildReportPersonalizationContext(
  profile: SmartUserProfile,
  snapshot: BehaviorSnapshotResult,
): string {
  const lifestyle = profile.lifestyleInfo;
  const financial = profile.financialInfo;
  const inferred = profile.aiInferredAttributes;
  const preferences = profile.preferences;
  const basic = profile.basicInfo;

  const goalMap: Record<string, string> = {
    organize_expenses: "تنظيم المصاريف",
    reduce_spending: "تقليل الصرف",
    track_income: "تتبع الدخل",
    save_money: "ادخار المال",
    manage_business: "إدارة مشروع",
    pay_debt: "سداد الديون",
  };
  const patternMap: Record<string, string> = {
    stable: "ثابت ومنتظم",
    variable: "متغير حسب الظروف",
    impulsive: "مندفع بدون تخطيط",
    saver: "يحاول يوفر",
    unclear: "غير واضح",
  };
  const housingMap: Record<string, string> = {
    rent: "إيجار",
    owned: "ملك",
    family_owned: "بيت العيلة",
  };
  const savingsMap: Record<string, string> = {
    yes_regular: "يدخر بانتظام",
    yes_irregular: "يدخر أحياناً",
    no: "لا يدخر",
    trying: "يحاول يبدأ",
  };

  const lines: string[] = [
    "═══ بروفايل المستخدم الذكي (خصص التقرير بناءً عليه) ═══",
    `المهنة: ${basic.profession ?? "غير محددة"}`,
    `الدخل الشهري: ${financial.averageMonthlyIncome ?? "غير محدد"} ج.م`,
    `مصادر الدخل: ${Array.isArray(financial.incomeSources) && financial.incomeSources.length > 0 ? financial.incomeSources.join("، ") : "غير محدد"}`,
    `الهدف الأساسي: ${goalMap[String(financial.primaryGoal)] ?? "غير محدد"}`,
  ];

  // Family & housing
  lines.push(
    `وضع السكن: ${housingMap[String((lifestyle as any).housingType)] ?? lifestyle.livingSituation ?? "غير محدد"}`,
  );
  if ((lifestyle as any).monthlyRent)
    lines.push(`الإيجار الشهري: ${(lifestyle as any).monthlyRent} ج.م`);
  lines.push(
    `لديه أطفال: ${lifestyle.hasChildren === true ? `نعم (${lifestyle.childrenCount || ""})` : lifestyle.hasChildren === false ? "لا" : "غير محدد"}`,
  );
  lines.push(
    `يدعم مالياً: ${Array.isArray(lifestyle.supportsOthers) && lifestyle.supportsOthers.length > 0 ? lifestyle.supportsOthers.join("، ") : "لا أحد"}`,
  );

  // Debt
  lines.push(
    `عليه ديون/أقساط: ${(financial as any).hasDebt === true ? `نعم (شهرياً ${(financial as any).monthlyDebtPayment ?? "؟"} ج.م)` : (financial as any).hasDebt === false ? "لا" : "غير محدد"}`,
  );

  // AI inferred
  lines.push(
    `الاستقرار المالي المستنتج: ${snapshot.inferredAttributes.financialStability ?? inferred.financialStability ?? "غير محدد"}`,
  );
  lines.push(
    `السلوك الاستهلاكي: ${snapshot.inferredAttributes.spendingBehavior ?? inferred.spendingBehavior ?? "غير محدد"}`,
  );
  lines.push(
    `أعلى فئة إنفاق فعلية: ${snapshot.topCategories[0]?.name ?? "غير محدد"}`,
  );
  lines.push(
    `طفرات صرف فجائية: ${snapshot.behaviorFlags.hasSpikeSpending ? "نعم" : "لا"}`,
  );
  lines.push(
    `التفاصيل المفضلة: ${preferences.detailLevel === "detailed" ? "تفصيلي" : preferences.detailLevel === "summary" ? "مختصر" : "متوازن"}`,
  );

  // Deep personal data (Phase 7)
  const childrenNames = Array.isArray(lifestyle.childrenNames)
    ? lifestyle.childrenNames.filter(Boolean)
    : [];
  if (childrenNames.length > 0) {
    lines.push(`أسماء الأطفال: ${childrenNames.join("، ")}`);
  }
  if ((lifestyle as any).partnerName) {
    lines.push(`شريك الحياة: ${(lifestyle as any).partnerName}`);
  }
  const regularContacts = Array.isArray((lifestyle as any).regularContacts)
    ? (lifestyle as any).regularContacts.filter(Boolean)
    : [];
  if (regularContacts.length > 0) {
    lines.push(`أشخاص يحول لهم بانتظام: ${regularContacts.join("، ")}`);
  }
  if ((lifestyle as any).carOwnership) {
    lines.push(
      `لديه سيارة${(lifestyle as any).carType ? ` (${(lifestyle as any).carType})` : ""}`,
    );
  }
  if ((lifestyle as any).smoking) {
    lines.push(`مدخن: نعم`);
  }
  const subs = Array.isArray((lifestyle as any).subscriptions)
    ? (lifestyle as any).subscriptions
    : [];
  if (subs.length > 0) {
    const subMap: Record<string, string> = {
      netflix: "Netflix",
      shahid: "شاهد",
      spotify: "Spotify",
      youtube_premium: "YouTube Premium",
      gym: "جيم/نادي",
      internet: "إنترنت",
      phone_plan: "باقة موبايل",
      insurance: "تأمين",
    };
    lines.push(
      `اشتراكات ثابتة: ${subs.map((s: string) => subMap[s] || s).join("، ")}`,
    );
  }

  lines.push("");
  lines.push(
    "تعليمات التخصيص: خاطب المستخدم بشكل شخصي كمستشاره المالي الخاص. اذكر مهنته وهدفه وظروفه (أطفال/ديون/سكن). قارن صرفه الفعلي بدخله المعلن والتزاماته. اجعل التقرير مُعد خصيصاً له وليس عاماً.",
  );
  if (
    childrenNames.length > 0 ||
    (lifestyle as any).partnerName ||
    regularContacts.length > 0
  ) {
    lines.push(
      "تعليمة إضافية: عند تحليل التحويلات، اذكر أسماء الأشخاص المعروفين بدلاً من 'تحويلات' فقط.",
    );
  }

  return lines.join("\n");
}

export function buildBackendPersonalizedInsights(
  profile: SmartUserProfile,
  snapshot: BehaviorSnapshotResult,
): Record<string, unknown> {
  const alerts: string[] = [];
  const savingOpportunities: string[] = [];
  const topCategory = snapshot.topCategories[0];
  const stability = String(
    snapshot.inferredAttributes.financialStability || "unknown",
  );

  if (topCategory && topCategory.percent > 50) {
    alerts.push(
      `تركيز عالي جداً في الصرف على فئة (${topCategory.name}) بنسبة ${topCategory.percent}% من إجمالي مصاريفك.`,
    );
  }
  if (snapshot.behaviorFlags.hasSpikeSpending) {
    alerts.push("في طفرات مفاجئة في الصرف الشهر ده.");
  }
  if (stability === "pressure") {
    alerts.push("في ضغط مالي واضح الشهر ده مقارنة بدخلك.");
  }

  for (const sub of snapshot.topSubCategories.slice(0, 3)) {
    if (sub.percent >= 10) {
      savingOpportunities.push(
        `راجع مصاريفك في "${sub.name}" (بتمثل ${sub.percent}% من الصرف). ممكن تقلل منها شوية.`,
      );
    }
  }

  const familyContext =
    profile.lifestyleInfo.hasChildren === true
      ? "مصاريف الأولاد والأسرة واخدة جزء من الميزانية، حاول تفصل مصاريفك الشخصية عشان تقدر تتابعها."
      : "مصاريفك الشخصية هي المتحكم الأكبر في الميزانية.";

  return {
    behavioral_summary: {
      financial_stability: stability,
      spending_behavior: snapshot.inferredAttributes.spendingBehavior,
      family_context: familyContext,
    },
    alerts,
    saving_opportunities: savingOpportunities,
    comparative_analysis: {
      month_over_month_change: snapshot.inferredAttributes.monthOverMonthChange,
      expense_income_ratio: snapshot.inferredAttributes.expenseIncomeRatio,
      trend:
        Number(snapshot.inferredAttributes.monthOverMonthChange || 0) > 0
          ? "trending_up"
          : "trending_down_or_flat",
    },
  };
}
