/**
 * Catches the assistant saying something is recorded or done while it is still a draft waiting for the user:
 * "سجلت خمسين جنيه مواصلات، أأكد؟" when nothing was written. Only the reply given while a draft waits is checked,
 * so talk about what the user recorded before ("آخر حاجة سجلتها كانت أكل") is left alone. The model gets a note
 * to put it right at once; the incident records only that it happened, never the sentence.
 */

/** Past-tense "recorded / done" as the assistant says it about its own action, without diacritics. */
const DONE_CLAIM =
  /(^|[\s،,.؟?!])(سجلت|سجلنا|سجلناه|سجلتها|سجلتهم|سجلته|سجلتلك|سجلنالك|سجلتهالك|حفظتلك|حفظنالك|حفظتهالك|اتسجل|اتسجلت|اتسجلوا|اتعمل|اتعملت|اتنفذ|اتنفذت|خلصتها|عملتها|حفظت|حفظنا|اتحفظ|اتحفظت)(?=$|[\s،,.؟?!])/;
/** Arabic short vowels, tanween, shadda and sukun (U+064B to U+0652). */
const DIACRITICS = new RegExp(
  `[${String.fromCharCode(0x64b)}-${String.fromCharCode(0x652)}]`,
  "g",
);

export function claimsDone(text: string): boolean {
  return DONE_CLAIM.test(text.replace(DIACRITICS, ""));
}

export const DONE_CLAIM_NOTE =
  "(ملاحظة من التطبيق، مش من المستخدم: لسه ماتسجلش ولا اتعمل حاجة. دي مسودة مستنية موافقته. " +
  "قول كده في جملة قصيرة واسأله سؤال واحد زي «أسجلها؟».)";

export class DoneClaimCheck {
  private turnText = "";
  private flagged = false;
  private notesThisRequest = 0;
  private notes = 0;

  /**
   * At most `perRequest` corrections for one request of the user and `perCall` in all: a model that reads a draft back
   * as "سجلت … أسجلها؟" would otherwise be stopped, restart with the same words, and be stopped again without end.
   */
  constructor(
    private readonly perRequest = 1,
    private readonly perCall = 3,
  ) {}

  /** The user spoke: a new request may be corrected again. */
  newRequest(): void {
    this.notesThisRequest = 0;
  }

  /**
   * Adds a chunk of the assistant's speech. The first time a reply claims a waiting draft is done: `note` while
   * corrections are left (the model is told at once), `record` after (the incident only). Otherwise null.
   */
  add(chunk: string, draftWaiting: boolean): "note" | "record" | null {
    this.turnText += chunk;
    if (this.flagged || !draftWaiting) return null;
    if (!claimsDone(this.turnText)) return null;
    this.flagged = true;
    if (this.notesThisRequest >= this.perRequest || this.notes >= this.perCall)
      return "record";
    this.notesThisRequest += 1;
    this.notes += 1;
    return "note";
  }

  endTurn(): void {
    this.turnText = "";
    this.flagged = false;
  }

  snapshot(): { notes: number } {
    return { notes: this.notes };
  }

  restore(state: { notes?: number } | null | undefined): void {
    this.notes = state?.notes ?? 0;
  }
}

/**
 * Catches the assistant saying a replaced amount as the one just written: the user corrected "خمستاشر" to "خمسين",
 * fifty was saved, and the confirmation says "اتسجلت خمستاشر". The number check cannot, because the user did say
 * fifteen; this knows which draft was written. Once a reply.
 */
export class WrittenAmountCheck {
  private turnText = "";
  private flagged = false;
  private corrections = 0;

  /** `correct` is false after two corrections in the call: the incident is still recorded, the model not stopped again. */
  add(
    chunk: string,
    recent: { written: number[]; replaced: number[] } | null,
    amountsIn: (text: string) => number[],
  ): { spoken: number; written: number; correct: boolean } | null {
    this.turnText += chunk;
    if (this.flagged || !recent || !recent.replaced.length) return null;
    if (!claimsDone(this.turnText)) return null;
    const spoken = amountsIn(this.turnText);
    // A correction says "خمسين مش خمستاشر" or "خمسين بدل خمستاشر": the old amount is denied, not claimed as written.
    const denied = [...this.turnText.matchAll(/(?:^|[\s،,.؟?!])(?:مش|بدل|بدلا من)\s+([^،,.؟?!]+)/g)]
      .flatMap((match) => amountsIn(match[1]).slice(0, 1));
    const wrong = spoken.find(
      (value) =>
        recent.replaced.some((amount) => Math.abs(amount - value) < 0.5) &&
        !denied.some((amount) => Math.abs(amount - value) < 0.5) &&
        !recent.written.some((amount) => Math.abs(amount - value) < 0.5),
    );
    if (wrong === undefined) return null;
    this.flagged = true;
    const correct = this.corrections < 2;
    if (correct) this.corrections += 1;
    return { spoken: wrong, written: recent.written[0], correct };
  }

  endTurn(): void {
    this.turnText = "";
    this.flagged = false;
  }
}

/** "حصل عطل", "مشكلة في النظام", "مش قادر أوصل": the assistant saying something broke, without diacritics. */
const FAILURE_CLAIM =
  /عطل\s+(?:فني|تقني|في\s+(?:النظام|السيستم|التطبيق|الخدمه))|خطا في النظام|مشكله في النظام|مشكله في السيستم|مشكله تقنيه|مشكله فنيه|خطا تقني|السيستم واقع|مش قادر(?:ه|ين)?\s+(?:اوصل|نوصل)\s+(?:للمعلومه|للبيانات|لحساباتك|لبياناتك)/;

/** Whether the words claim a technical failure ("حصل عطل", "مشكلة في السيستم"), however they are spelled. */
export function claimsFailure(text: string): boolean {
  const normalized = text
    .replace(DIACRITICS, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه");
  // Only an explicit technical claim: a bare "عطل" or inability to reach a goal is ordinary financial speech.
  return FAILURE_CLAIM.test(normalized);
}

export const FAILURE_CLAIM_NOTE =
  "(ملاحظة من التطبيق، مش من المستخدم: مفيش أداة فشلت عندنا؛ الطلب ماوصلناش أصلًا. قول للمستخدم إنك هتجرب تاني " +
  "في كلمتين، ونادي الأداة المناسبة تاني بنفس الطلب. متقولش إن فيه عطل.)";

/** After the call held back the extended model's apology for a tool call that never reached the app. */
export const LOST_CALL_RETRY_NOTE =
  "(ملاحظة من التطبيق، مش من المستخدم: طلب الأداة بتاعك ماوصلش للتطبيق، ومفيش أي عطل عندنا. متعتذرش ومتقولش إن " +
  "فيه مشكلة؛ نادي الأداة المناسبة تاني دلوقتي بنفس الطلب.)";

/** After the held-back apology came once the request's tools had answered: the results are there to use. */
export const FALSE_FAILURE_AFTER_TOOLS_NOTE =
  "(ملاحظة من التطبيق، مش من المستخدم: الأدوات ردت عادي ومفيش أي عطل عندنا، والنتايج عندك. متعتذرش ومتقولش إن فيه " +
  "مشكلة؛ كمّل الإجابة من النتايج دي، ولو محتاج حاجة تانية نادي الأداة.)";

/** The same, when the tool call was lost again and again within one request. */
export const LOST_CALL_GIVE_UP_NOTE =
  "(ملاحظة من التطبيق، مش من المستخدم: طلب الأداة ماوصلش للتطبيق أكتر من مرة. قول للمستخدم بصراحة في جملة إنك مش " +
  "قادر توصل للمعلومة دي في المكالمة دلوقتي، واقترح يسأل تاني بعد شوية أو يشوفها في شاشة التطبيق. متقولش إن السيستم واقع.)";

/**
 * Catches the assistant claiming a technical failure while none of the tools of the user's latest request failed.
 * The extended-thinking model does this when its tool call never reaches the app (docs/systems/voice-calls.md,
 * known issues): the user hears "حصل عطل" about something the app never received. The call records the incident
 * and, within a limit, tells the model to try the tool again.
 */
export class FailureClaimCheck {
  private turnText = "";
  private flagged = false;
  private toolsFailed = 0;
  private toolsCalled = 0;
  private retries = 0;
  private providerExhausted = false;

  constructor(private readonly maxRetries = 2) {}

  /** The user asked something new: the tools of the last request no longer explain a failure. */
  newRequest(): void {
    this.providerExhausted = false;
    this.toolsCalled = 0;
    this.toolsFailed = 0;
    this.turnText = "";
    this.flagged = false;
  }

  toolAnswered(ok: boolean): void {
    this.toolsCalled += 1;
    if (!ok) this.toolsFailed += 1;
  }

  /** Recovery exhausted at the provider boundary: an honest inability is no longer a false tool failure. */
  providerFailed(): void {
    this.toolsFailed += 1;
    this.providerExhausted = true;
  }

  /**
   * Adds a chunk of the assistant's speech. Returns what to do the first time a turn claims a failure no tool
   * reported: `retry` while retries are left, `record` after.
   */
  add(chunk: string): { toolsCalled: number; retry: boolean } | null {
    this.turnText += chunk;
    if (this.flagged || this.toolsFailed > 0 || this.providerExhausted)
      return null;
    if (!claimsFailure(this.turnText)) return null;
    this.flagged = true;
    const retry = this.retries < this.maxRetries;
    if (retry) this.retries += 1;
    return { toolsCalled: this.toolsCalled, retry };
  }

  endTurn(): void {
    this.turnText = "";
    this.flagged = false;
  }

  snapshot(): { retries: number; providerExhausted: boolean } {
    return { retries: this.retries, providerExhausted: this.providerExhausted };
  }

  restore(
    state: { retries?: number; providerExhausted?: boolean } | null | undefined,
  ): void {
    this.retries = state?.retries ?? 0;
    this.providerExhausted = state?.providerExhausted === true;
  }
}
