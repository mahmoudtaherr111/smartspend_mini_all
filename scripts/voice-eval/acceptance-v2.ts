/**
 * Fresh acceptance wording frozen before its first live run. Never tune from
 * these results and then call a rerun blind acceptance. Universal checks also
 * compare the full financial before/after state for every case.
 */
import { called, notCalled, says, writesExpense, type Scenario } from "./corpus";

export const ACCEPTANCE_V2: Scenario[] = [
  {
    id: "a2-hypothetical-budget", domain: "consent", fixture: "base",
    turns: ["أنا بس بفهم: لو ميزانية الأكل بقت ألف ومتين، ده بيتحفظ لوحده ولا لازم أوافق؟"],
    checks: [notCalled("change_draft"), notCalled("confirm"), says(/موافق|توافق|تأكيد|تاكيد|تأكد|تأكدي/)],
  },
  {
    id: "a2-exact-workshop", domain: "business", fixture: "base",
    turns: ["هات رقم مصاريف ورشة النجارة من يوم القبض بالظبط، من غير تقريب."],
    checks: [called("money_query", { scope: "business" }), says(/ألفين وسبعمية وخمسين|2750|٢٧٥٠|2[,٬]750/)],
  },
  {
    id: "a2-different-scopes", domain: "business", fixture: "base",
    turns: ["الأكل بتاعي كلفني كام من يوم القبض؟", "طب سيب البيت، الورشة لوحدها مصاريفها كام بالظبط؟"],
    checks: [called("money_query", { scope: "business" }, 1), says(/ألفين وسبعمية وخمسين|2750|٢٧٥٠|2[,٬]750/, 1)],
  },
  {
    id: "a2-person-direction", domain: "debts", fixture: "base",
    turns: ["أحمد اللي كنت مدياله فلوس، لسه ليا عنده قد إيه؟"],
    checks: [called("money_query"), says(/أحمد/), says(/ألف وخمسمية|ألف ونص|1500|١٥٠٠/), notCalled("confirm")],
  },
  {
    id: "a2-record-with-reservation", domain: "consent", fixture: "base",
    turns: ["دفعت خمسة وستين جنيه فطار، جهزلي التسجيل", "أيوه بس استنى، ماتبعتش حاجة دلوقتي"],
    checks: [called("record_draft", {}, 0), notCalled("confirm")],
  },
  {
    id: "a2-accept-own-amount", domain: "recording", fixture: "base", expectedExpenseWrites: 1,
    turns: ["سجللي إن مواصلات النهارده كانت خمسة وثمانين جنيه", "تمام، موافق سجلها"],
    checks: [called("record_draft", {}, 0), called("confirm", {}, 1), writesExpense({ amount: 85, type: "expense" })],
  },
  {
    id: "a2-future-purchase", domain: "intent", fixture: "base",
    turns: ["لسه ماشتريتش، يمكن الأسبوع الجاي أجيب جزمة بسبعمية. رأيك أستنى؟"],
    checks: [notCalled("record_draft"), notCalled("confirm")],
  },
  {
    id: "a2-new-user-no-ledger", domain: "data_quality", fixture: "empty",
    turns: ["أنا لسه داخل التطبيق، وريني أكتر حاجة صرفت عليها امبارح."],
    checks: [called("money_query"), says(/مفيش|مافيش|ماتسجل|متسجل|ما اتسجل|لم يتسجل|صفر/), notCalled("confirm")],
  },
  {
    id: "a2-percentage-question", domain: "numbers", fixture: "base",
    turns: ["لو قللت مصاريف الأكل عشرين في المية يبقى التوفير كام؟ ده سؤال بس مش تعديل ميزانية."],
    checks: [called("money_query"), called("calculate"), notCalled("change_draft"), notCalled("confirm")],
  },
  {
    id: "a2-borrowing-hypothesis", domain: "intent", fixture: "base",
    turns: ["لو اتسلفت من خالد ألف الأسبوع اللي جاي، إنت هتضيفهم للدخل؟ أنا لسه ماخدتش حاجة."],
    checks: [notCalled("record_draft"), notCalled("change_draft"), notCalled("confirm"), says(/دين|سلف|قرض|تحويل/)],
  },
];
