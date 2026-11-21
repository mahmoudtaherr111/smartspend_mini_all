// How the console explains a classification to someone who does not read code.

/** Why a category was chosen, by the evidence the pipeline records (api/lib/classification-evidence.ts). */
export const MATCH: Record<string, string> = {
  user_correction: "الشخص صحّح نفس الحاجة قبل كده، فالتطبيق اتعلمها",
  muscle_memory: "الشخص سجّل نفس الجملة قبل كده",
  user_dictionary: "كلمة في قاموس الشخص نفسه",
  known_person: "اسم شخص معروف عند المستخدم",
  merchant_registry: "اسم محل أو تاجر معروف",
  merchant_disambiguated: "اسم محل معروف، واتحدد معناه من باقي الجملة",
  merchant_catalog: "محل من كتالوج المحلات",
  governed_noun: "فعل وكلمة معروفين مع بعض (زي «دفعت إيجار»)",
  verb_noun_regex: "فعل وكلمة معروفين مع بعض",
  synonym_graph: "كلمة مرادفة لفئة معروفة",
  subcat_trigram: "تلات كلمات من قاموس الفئات",
  subcat_bigram: "كلمتين من قاموس الفئات",
  subcat_unigram: "كلمة من قاموس الفئات",
  dict_trigram: "تلات كلمات من القاموس العام",
  dict_bigram: "كلمتين من القاموس العام",
  dict_unigram: "كلمة من القاموس العام",
  context_rule: "قاعدة من سياق الجملة",
  fuzzy: "كلمة قريبة من كلمة معروفة (ممكن تكون غلطة إملائية)",
  embedding: "معنى الجملة قريب من جمل معروفة",
  intent_only: "اتفهم إنه صرف بس من غير فئة واضحة",
  business_scoring: "قواعد حساب الشغل",
  llm: "الموديل قرر",
  fallback: "مفيش دليل، فراحت للفئة العامة",
};

export const PARSED_BY: Record<string, string> = {
  rule_engine: "القواعد",
  ai: "الموديل",
  hybrid: "القواعد والموديل",
  manual: "يدوي",
};

export const DECISION: Record<string, string> = {
  auto_save: "اتسجلت لوحدها",
  review: "اتعرضت للمراجعة",
  clarify: "اتسأل سؤال",
};

export const INPUT: Record<string, string> = { text: "كتابة", voice: "صوت", image: "فاتورة", sms: "رسالة بنك" };

/** A confidence out of 100 in words, with the tone the console colours it. */
export function confidenceWords(value: number): { text: string; tone: "good" | "warn" | "bad" } {
  if (value >= 85) return { text: `واثق (${value}%)`, tone: "good" };
  if (value >= 60) return { text: `متوسط (${value}%)`, tone: "warn" };
  return { text: `مش متأكد (${value}%)`, tone: "bad" };
}
