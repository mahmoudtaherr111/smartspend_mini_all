/**
 * The one prompt. It asks the model a single question.
 *
 * ── What this replaces ──────────────────────────────────────────────────────
 *
 * `dynamic-prompt-builder.ts` held two near-identical builders that had already drifted
 * apart, produced 1926 tokens of instruction for 91 characters of user speech (21:1),
 * and contained a contradiction that alone accounts for a large share of the category
 * errors: rule 4 said "choose categories LITERALLY from the attached TAXONOMY only",
 * while the worked examples used أكل وشرب, استثمار and سكن — three categories the
 * attached taxonomy had filtered out. The prompt demonstrated answers it forbade.
 *
 * It also spent tokens on four things that made the system worse:
 *
 *   - `decomposed_sentences`: told the model to re-split the text. Our decomposer is
 *     100% exact on the monologue set; the model is 0%. We paid to be told the wrong
 *     answer, and the field had no consumer anywhere in the repo.
 *   - `reasoning`: chain-of-thought, also with no consumer. Pure output cost.
 *   - `confidence`: a self-rating measured at +34.1 points optimistic.
 *   - 14 lines of dialect heuristics that duplicate the rule engine, which applies the
 *     same rules deterministically at 92% against the model's 60%.
 *
 * ── What it does instead ────────────────────────────────────────────────────
 *
 * Amounts, direction and segmentation are already settled by deterministic code that
 * measures better than the model at all three. So the model receives numbered clauses
 * with those facts fixed, and returns only the category — indexed, so it cannot merge or
 * split; enum-constrained, so it cannot invent.
 *
 * The system prompt is fully static, which makes it cacheable at the provider. The only
 * per-request text is the clause list and the user's own vocabulary.
 */
import { buildFullTaxonomy } from "./classifier-contract";

export interface ClauseForModel {
  /** 1-based, matching the reply's `i`. */
  index: number;
  text: string;
  /** Already extracted. The model is told, not asked. */
  amount: number | null;
  /** Already resolved. The model is told, not asked. */
  direction: "expense" | "income" | "transfer" | "investment";
  /** What the local pass guessed, when it guessed something too weak to keep. */
  localGuess?: string;
}

export interface PromptContext {
  clauses: ClauseForModel[];
  knownPeople?: Array<{ name: string; relationship?: string }>;
  /** Categories this user actually uses, most-used first. A prior, not a filter. */
  frequentCategories?: string[];
  /** The user's own business categories, when they run one. */
  businessCategories?: Array<{ nameAr: string; type: string }>;
}

/**
 * Static. Never varies by request, so a provider that caches prompt prefixes caches all
 * of it — which is the whole reason the taxonomy being complete costs so little.
 */
export const CLASSIFICATION_SYSTEM_PROMPT = `أنت مصنّف فئات لمصاريف مصرية. مهمتك سؤال واحد فقط.

المبالغ والاتجاه والتقسيم كلها **محسومة** ومعطاة لك. لا تحسبها ولا تراجعها ولا تعيد تقسيم أي جملة.

مهمتك: لكل جملة مرقّمة، اختر **الفئة** الأنسب من القائمة، والفرعية المناسبة لها.

القواعد:
1. أخرِج عنصراً واحداً لكل رقم — لا أكثر ولا أقل. استخدم نفس الرقم في الحقل i.
2. category لازم تكون معرّفاً إنجليزياً من القائمة حرفياً (مثل food، transport).
3. sub لازم تكون فرعية عربية من نفس الفئة حرفياً.
4. لو الجملة فيها اسم شخص، حط الاسم في person واختر الفئة المناسبة للعلاقة.
5. لو الجملة فعلاً غامضة ولا تنتمي لأي فئة، اختر miscellaneous — لكن ده آخر حل، مش الحل السهل.

الفئات (المعرّف=الاسم:الفرعيات):
${buildFullTaxonomy()}

أخرِج JSON فقط:
{"items":[{"i":1,"category":"food","sub":"مطعم"}]}`;

const DIRECTION_LABEL: Record<ClauseForModel["direction"], string> = {
  expense: "مصروف",
  income: "دخل",
  transfer: "تحويل",
  investment: "استثمار",
};

/**
 * The per-request half: the clauses, and only what is specific to this user.
 *
 * Each clause carries its amount and direction as settled facts. Stating them removes
 * the model's reason to reconsider them, and stating them per-clause rather than as one
 * list of amounts removes its room to reassign them between clauses — the mechanism
 * behind the 6.2% over-splitting the old prompt produced.
 */
export function buildClassificationUserPrompt(ctx: PromptContext): string {
  const lines: string[] = [];

  lines.push(`صنّف ${ctx.clauses.length} جملة:`);
  for (const clause of ctx.clauses) {
    const amount = clause.amount === null ? "بدون مبلغ" : `${clause.amount} جنيه`;
    const guess = clause.localGuess ? ` · تخميننا: ${clause.localGuess}` : "";
    lines.push(
      `${clause.index}. ${clause.text} — [${amount} · ${DIRECTION_LABEL[clause.direction]}${guess}]`,
    );
  }

  if (ctx.knownPeople?.length) {
    // Named so the model attributes to the right person, and so an unrecognised name is
    // visibly unrecognised rather than quietly guessed at.
    const names = ctx.knownPeople
      .map((p) => (p.relationship ? `${p.name} (${p.relationship})` : p.name))
      .join("، ");
    lines.push("", `أشخاص معروفون: ${names}`);
    lines.push("أي اسم تاني اكتبه في person وسيب الفرعية فاضية.");
  }

  if (ctx.frequentCategories?.length) {
    // A prior, not a filter. The old system used history to REMOVE categories from the
    // list, which is how the right answer became unreachable; here it only breaks ties.
    lines.push("", `المستخدم بيستخدم غالباً: ${ctx.frequentCategories.slice(0, 6).join("، ")}`);
    lines.push("(ده ترجيح عند التساوي فقط، مش تقييد — كل الفئات متاحة.)");
  }

  if (ctx.businessCategories?.length) {
    const biz = ctx.businessCategories.map((c) => `${c.nameAr} (${c.type})`).join("، ");
    lines.push("", `لو الجملة تخص شغل المستخدم استخدم work مع فرعية من: ${biz}`);
  }

  return lines.join("\n");
}

/** For the cost accounting in the trace, and for the benchmark's token math. */
export function estimatePromptTokens(ctx: PromptContext): {
  system: number;
  user: number;
} {
  const user = buildClassificationUserPrompt(ctx);
  return {
    system: Math.round(CLASSIFICATION_SYSTEM_PROMPT.length * 0.5),
    user: Math.round(user.length * 0.5),
  };
}
