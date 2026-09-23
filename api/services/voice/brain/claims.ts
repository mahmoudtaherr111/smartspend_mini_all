/**
 * Catches the assistant saying something is recorded or done while it is still a draft waiting for the user:
 * "سجلت خمسين جنيه مواصلات، أأكد؟" when nothing was written. Only the reply given while a draft waits is checked,
 * so talk about what the user recorded before ("آخر حاجة سجلتها كانت أكل") is left alone. The model gets a note
 * to put it right at once; the incident records only that it happened, never the sentence.
 */

/** Past-tense "recorded / done" as the assistant says it about its own action, without diacritics. */
const DONE_CLAIM =
  /(^|[\s،,.؟?!])(سجلت|سجلتها|سجلتهم|سجلته|اتسجل|اتسجلت|اتسجلوا|اتعمل|اتعملت|اتنفذ|اتنفذت|خلصتها|عملتها)(?=$|[\s،,.؟?!])/;
/** Arabic short vowels, tanween, shadda and sukun (U+064B to U+0652). */
const DIACRITICS = new RegExp(`[${String.fromCharCode(0x64b)}-${String.fromCharCode(0x652)}]`, "g");

export const DONE_CLAIM_NOTE =
  "(ملاحظة من التطبيق، مش من المستخدم: لسه ماتسجلش ولا اتعمل حاجة. دي مسودة مستنية موافقته. " +
  "قول كده في جملة قصيرة واسأله سؤال واحد زي «أسجلها؟».)";

export class DoneClaimCheck {
  private turnText = "";
  private flagged = false;

  /** Adds a chunk of the assistant's speech; true once, the first time it claims a waiting draft is done. */
  add(chunk: string, draftWaiting: boolean): boolean {
    this.turnText += chunk;
    if (this.flagged || !draftWaiting) return false;
    if (!DONE_CLAIM.test(this.turnText.replace(DIACRITICS, ""))) return false;
    this.flagged = true;
    return true;
  }

  endTurn(): void {
    this.turnText = "";
    this.flagged = false;
  }
}
