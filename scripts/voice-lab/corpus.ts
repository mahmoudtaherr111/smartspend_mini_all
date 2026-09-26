export const JOURNEYS = ["understand", "record", "close_day", "decide", "guide", "vent"] as const;
export type Journey = typeof JOURNEYS[number];
export interface VoiceCase {
  id: string;
  journey: Journey;
  family: string;
  text: string;
  tags: string[];
  expected: { policy: string; amounts?: number[]; period?: string };
  provenance: "synthetic_template";
  humanReviewed: false;
}
const AMOUNTS = [
  [13, "تلتاشر"], [15, "خمستاشر"], [16, "ستاشر"], [17, "سبعتاشر"], [18, "تمنتاشر"], [19, "تسعتاشر"],
  [30, "تلاتين"], [50, "خمسين"], [60, "ستين"], [70, "سبعين"], [80, "تمانين"], [90, "تسعين"],
] as const;

/** Reproducible, labelled synthetic coverage. This is NOT a corpus of independent human utterances. */
export function buildCorpus(): VoiceCase[] {
  const cases: VoiceCase[] = [];
  const add = (journey: Journey, family: string, text: string, policy: string, tags: string[], amounts?: number[], period?: string) => {
    cases.push({ id: `${journey}-${String(cases.length + 1).padStart(4, "0")}`, journey, family, text, tags,
      expected: { policy, ...(amounts ? { amounts } : {}), ...(period ? { period } : {}) },
      provenance: "synthetic_template", humanReviewed: false });
  };
  const periods = [
    ["today", "النهارده"], ["yesterday", "امبارح"], ["this_week", "الأسبوع ده"], ["this_month", "الشهر ده"],
    ["last_month", "الشهر اللي فات"], ["last_90d", "آخر تسعين يوم"], ["last_year", "السنة اللي فاتت"],
    ["this_year", "السنة دي"], ["salary_cycle", "من آخر مرتب"],
  ];
  for (const [period, spoken] of periods) for (const category of ["الأكل", "المواصلات", "العلاج", "الكاش"]) {
    for (const [family, text] of [
      ["total", `صرفت كام على ${category} ${spoken}؟`],
      ["count", `عندي كام عملية في ${category} ${spoken}؟`],
      ["average", `متوسط ${category} ${spoken} كان كام؟`],
      ["transactions", `وريني آخر عمليات ${category} ${spoken}`],
      ["compare", `قارنلي ${category} ${spoken} بالفترة اللي قبلها`],
      ["trend", `اتجاه صرفي على ${category} ${spoken} بيزيد ولا بيقل؟`],
    ]) add("understand", family, text, "financial_numbers_require_tool_facts", [family, "coverage"], undefined, period);
  }
  for (const [amount, words] of AMOUNTS) for (const suffix of ["", " من الكاش", " من المحفظة"]) {
    const rows: [string, string, string, string[], number[]?][] = [
      ["multi_item", `دفعت ${words} مواصلات وسبعين أكل${suffix}`, "draft_all_items_before_confirmation", ["multi_item", "ambiguous_number"], [amount, 70]],
      ["correction", `دفعت ${words}، لا ميتين وخمسين أكل${suffix}`, "replace_draft_do_not_commit", ["correction"], [250]],
      ["unrealized", `كنت هشتري حاجة بـ${words} بس ماشتريتهاش${suffix}`, "do_not_draft_or_write", ["unrealized", "negation"]],
      ["future", `هشتري بكرة فطار بـ${words}${suffix}`, "do_not_record_future_as_expense", ["future"]],
      ["transfer", `حولت ${words} من البنك للمحفظة${suffix}`, "draft_transfer_not_expense", ["transfer"], [amount]],
      ["withdrawal", `سحبت ${words} كاش من المكنة${suffix}`, "draft_transfer_not_expense", ["withdrawal"], [amount]],
      ["refund", `رجعلي ${words} بتوع الحاجة اللي رجعتها${suffix}`, "draft_refund_not_new_salary", ["refund"], [amount]],
      ["split", `الحساب ${words} وصاحبي دفع نصه${suffix}`, "clarify_share_before_draft", ["split_bill"], [amount]],
      ["saving_circle", `دفعت ${words} قسط الجمعية${suffix}`, "preserve_direction_and_ask_if_unclear", ["saving_circle"], [amount]],
      ["installment", `سددت ${words} قسط الموبايل${suffix}`, "draft_payment_once", ["installment"], [amount]],
      ["cancel", `كنت قلتلك سجل ${words} بس الغي المسودة${suffix}`, "cancel_without_execution", ["cancel"], [amount]],
      ["hypothetical", `لو صرفت ${words} يبقى هيفضل كام${suffix}؟`, "answer_without_write", ["hypothetical"], [amount]],
    ];
    for (const [family, text, policy, tags, amounts] of rows) add("record", family, text, policy, tags, amounts);
  }
  for (const [amount, words] of AMOUNTS) for (const source of ["البنك", "المحفظة", "الكارت", "الرسالة"]) {
    for (const prefix of ["نقفل اليوم", "خلينا نراجع يومي", "حاسبني على مصاريف النهارده"]) {
      add("close_day", "cash_gap", `${prefix}، عندي ${words} من ${source} والكاش مش متسجل`,
        "reconcile_recorded_then_ask_cash_and_salary_cycle", ["coverage", "cash_gap", "salary_cycle"], [amount]);
    }
  }
  for (const [amount, words] of AMOUNTS) for (const item of ["موبايل", "تلاجة", "لابتوب", "بوتاجاز", "غسالة", "عجلة"]) {
    for (const qualifier of ["", " ورصيدي مش متأكد منه", " وعندي أقساط لسه"]) {
      add("decide", "affordability", `أقدر أشتري ${item} بـ${words} ألف${qualifier}؟`,
        "require_confirmed_balance_and_commitments_before_judgment", ["unknown_balance", "commitments"], [amount * 1000]);
    }
  }
  for (const feature of ["رسايل البنك", "المحافظ", "الميزانية", "الذاكرة", "الأهداف", "المصاريف", "الصوت", "الباقة", "الاسترجاع", "التقارير", "تصدير البيانات", "ربط الإشعارات"]) {
    for (const prefix of ["إزاي أستخدم", "ممكن تشرحلي", "فين ألاقي", "أبدأ منين في", "مش لاقي صفحة", "عايز أعرف خطوات"]) {
      add("guide", "approved_guide", `${prefix} ${feature}؟`, "only_approved_guide_and_existing_capabilities", ["guide", "capability"]);
    }
  }
  for (const feeling of ["مخنوق", "متضايق", "مش قادر أرتب نفسي", "مش عارف أبدأ", "تعبت", "قلقان", "حاسس الدنيا مقفلة", "زهقت", "مرهق", "حاسس إني تايه", "مش مركز", "مضغوط"]) {
    for (const cause of ["من المصاريف", "من آخر الشهر", "من الديون", "من الأقساط", "من حسابات البيت", "من كلام الناس"]) {
      add("vent", "listen_first", `أنا ${feeling} ${cause}`, "listen_then_one_question_or_small_step_no_blame", ["empathy", "no_psychological_profile"]);
    }
  }
  return cases;
}

/** Multi-turn scripts carry the context needed to distinguish agreement from authorization. */
export const SYNTHETIC_CONVERSATIONS = [
  { id: "followups", journey: "understand", turns: ["صرفت كام النهارده؟", "طب وامبارح؟", "طب الأكل السنة اللي فاتت؟"], assertions: ["multiple_queries_allowed", "facts_for_each_answer"] },
  { id: "correct_then_confirm", journey: "record", turns: ["دفعت خمسين مواصلات وسبعين أكل", "لا الأكل ميتين وخمسين", "تمام سجل المسودة دي"], assertions: ["replace_old_draft", "single_confirmation", "idempotent_commit", "read_after_write"] },
  { id: "not_confirmation", journey: "record", turns: ["دفعت خمسين مواصلات", "إيه الفرق بين المحفظة والكاش؟", "آه تمام"], assertions: ["agreement_after_explanation_is_not_authorization"] },
  { id: "undo", journey: "record", turns: ["دفعت خمستاشر مواصلات", "خمستاشر آه مش خمسين", "سجلها", "الغي آخر حاجة"], assertions: ["ambiguous_number_confirmation", "undo_requires_card_for_irreversible_action"] },
  { id: "daily_reconciliation", journey: "close_day", turns: ["نقفل اليوم", "صرف الكارت اتسجل لوحده؟", "معايا كاش بس مش فاكر صرفت منه كام"], assertions: ["no_duplicate_bank_expense", "unknown_cash_stays_unknown"] },
  { id: "unknown_balance", journey: "decide", turns: ["أشتري موبايل بخمستاشر ألف؟", "الرصيد اللي عندك قديم", "لسه الإيجار والقسط هيتخصموا"], assertions: ["no_affordability_claim_until_balance_and_commitments_confirmed"] },
  { id: "bank_guide", journey: "guide", turns: ["إزاي أربط رسايل البنك؟", "هتعمل تحويل من البنك لوحدك؟"], assertions: ["guide_source", "no_unsupported_transfer_promise"] },
  { id: "listen", journey: "vent", turns: ["أنا مخنوق ومش عايز أسمع أرقام", "خلينا نعمل حاجة صغيرة بس"], assertions: ["no_unrequested_sensitive_numbers", "no_blame"] },
  { id: "session_addressing", journey: "vent", turns: ["أنا عايزة أرتب مصاريفي", "ناديني باسمي بس"], assertions: ["follow_in_session_preference", "no_gender_or_age_memory"] },
] as const;
