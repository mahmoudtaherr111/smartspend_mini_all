/**
 * What the call never keeps about a person. Age and gender are never stored, even when the user asks (the owner's
 * decision). What the post-call summary picks up on its own also leaves out health, religion and judgments of the
 * person's character or state of mind: nobody asked for those to be remembered.
 */

/** Statements of age or gender. */
export const AGE_OR_GENDER =
  /(عندي\s*\d+\s*سن|عمري|سني|سنّي|مواليد|اتولدت|عيد ميلادي|(أنا|انا)\s+(راجل|ست|بنت|ولد|شاب|ست بيت)|(^|\s)(ذكر|أنثى|انثى)(\s|$))/;

const UNASKED_PERSONAL =
  /(مريض|اكتئاب|مكتئب|قلق نفسي|علاج نفسي|دكتور نفسي|ضغط الدم|السكر عنده|مسلم|مسيحي|قبطي|ملحد|متدين|شخصيته|نفسيته|متوتر|عصبي|بخيل|مسرف|مهمل|مدمن)/;

/** True for anything the post-call summary must not keep. */
export function neverKeptUnasked(text: string): boolean {
  return AGE_OR_GENDER.test(text) || UNASKED_PERSONAL.test(text);
}
