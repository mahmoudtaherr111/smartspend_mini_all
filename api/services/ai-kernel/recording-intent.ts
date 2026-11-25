import { detectNegation } from "../../lib/negation-detector";
import { normalizeArabic } from "../../lib/unified-normalizer";
import { parseArabicNumbers } from "../../lib/arabic-number-parser";

const outsideNarration = /(?:^|[^\p{L}])(?:و)?(?:هل|كام|كم|قد ايه|امتي|فين|ليه|ازاي|كيف|صح|لو|اذا|نفترض|مثلا|ناوي|ناويه|كنت عايز|كنت ناوي|ممكن|قلتلك|فاكر|تفتكر|بيقول|بتقول|قال|قالت|قاللي|قالي|سمعت|متسجل|سجلتها|سجلته|اتسجلت|قولي|قل لي|وريني|احسبلي|فكرني|حلل|قارن|الغي|احذف|امسح|غير|اعملي|عايز اعرف)(?=$|[^\p{L}])/u;
const futureOrThirdPerson = /(?:^|[\s،؛,])(?:و)?(?:هدفع|هصرف|هشتري|هسدد|هنزل|هقبض|هجيب|هحول|دفع|دفعتله|اشترى|اشتري|اشترت|صرف|صرفتله|قبض|قبضتله|حول|حولتله)(?=$|[\s،؛,.])/u;
const ownPast = /^(?:(?:انا|النهارده|امبارح|امس|من شويه|الصبح|بالليل)\s+)*(?:دفعت|صرفت|اشتريت|جبت|حجزت|حاسبت|سددت|حولت|سلفت|استلفت|شحنت|قبضت|استلمت|بعت|سحبت|اخدت|خدت|تبرعت|اتبرعت|جددت)(?=$|[^\p{L}])/u;
const recordCommand = /^(?:من فضلك\s+)?(?:سجل(?:لي)?|[اأ]حفظ(?:لي)?|ضيف(?:لي)?|[اأ]ضف|[اأ]كتبلي)\s+/u;
const recordingRequest = /^(?:(?:مصروف|دخل|عملي[هة]|تحويل|دفعت|صرفت|قبضت|اشتريت)(?=$|[^\p{L}])|[\d٠-٩۰-۹])/u;
const recordedSubject = /^(?:دفعت|صرفت|اشترت|جابت|حجزت|سددت|حولت|قبضت|استلمت)\s+(?:هو|هي|احنا|هم|ماما|بابا|امي|ابويا|مراتي|جوزي|اختي|اخويا|صاحبي|صاحبتي)(?=$|[^\p{L}])/u;

/** Chat needs a positive indication of a completed, speaker-owned transaction. */
export function isNonRecordingReference(text: string): boolean {
  const folded = normalizeArabic(text);
  return /[?؟«»“”"]/.test(text) || outsideNarration.test(folded)
    || futureOrThirdPerson.test(folded) || detectNegation(text).negated;
}

export function isOwnRecordedNarration(text: string): boolean {
  const normalized = normalizeArabic(text);
  return ownPast.test(normalized) && !recordedSubject.test(normalized) && !isNonRecordingReference(text);
}

export function explicitRecordingSentence(text: string): string | null {
  const command = text.trim().match(recordCommand);
  if (!command || isNonRecordingReference(text)) return null;
  const sentence = text.trim().slice(command[0].length);
  return recordingRequest.test(sentence) ? sentence : null;
}

export function splitRecordingQuestion(text: string): { sentence: string; question: string } | null {
  const parts = text.trim().match(/^(.+?)(?:[؛،,;\n]\s*(?:و\s*)?|\s+و\s*)(?=(?:قولي|قل لي|احسبلي|وريني|صرفت كام|كام|فاضل كام|باقي كام|هل)\s)(.+)$/su);
  if (!parts || !isOwnRecordedNarration(parts[1])) return null;
  return { sentence: parts[1].trim(), question: parts[2].trim() };
}

export function isRecordingClarificationReply(text: string, question: string): boolean {
  if (text.length > 200 || isNonRecordingReference(text)) return false;
  const reply = normalizeArabic(text);
  if (question.includes("«احفظ»") && reply === "احفظ") return true;
  if (reply === "تخطي" || reply === "skip") return true;
  if (isOwnRecordedNarration(text)) return /(?:العملية كاملة|اكتب العملية تاني|اكتب الجملة)/u.test(question);
  const numbers = parseArabicNumbers(reply);
  return /(?:بكام|كام|المبلغ)/u.test(question) && /^\d+(?:[.٫]\d+)?\s*(?:جنيه(?:ات)?|ج|egp)?$/iu.test(numbers)
    || /(?:مين|صلة|علاقة)/u.test(question) && /^(?:ده |دي )?(?:اخويا|اختي|ابني|بنتي|والدي|والدتي|ابويا|امي|صاحبي|جارنا|زميلي|مراتي|جوزي)$/u.test(reply)
    || /(?:طريقة الدفع|محفظة|كارت)/u.test(question) && /^(?:كاش|نقدي|فيزا|كارت|محفظه|انستاباي)$/u.test(reply);
}
