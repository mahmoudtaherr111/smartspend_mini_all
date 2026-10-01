/**
 * The extended-thinking model sometimes loses a step inside the provider and then apologises for a "system error"
 * that did not happen (docs/systems/voice-calls.md, known issues): either its tool call never reaches the app (a filler,
 * IN_PROGRESS, no `toolCall`, an apology), or the tools answered and it apologises anyway before using their results.
 * Measured on LOW: one request in ten to one in two, by the hour.
 *
 * This guard keeps that apology from the user. Every utterance that continues a task (one that starts after an
 * utterance ended while the model was still IN_PROGRESS) has its first audio and words held for a moment. If the words
 * claim a failure while no tool of the request failed, the held audio is dropped and the call sends a note: call the
 * tool again (no tool was called) or answer from the results it has (tools answered). Anything else held is released at
 * once, in order. The cost is a delay of at most `holdMs` at the start of those utterances; a first answer, or the
 * standard model, is never held.
 *
 * Pure bookkeeping: CallSession feeds it events and does what it answers.
 */
export type GuardVerdict =
  | { kind: "pass" }
  | { kind: "hold" }
  /** Already suppressed: no second recovery decision for another chunk of this utterance. */
  | { kind: "suppress" }
  | {
      kind: "release";
      audio: Array<{ pcm: Buffer; sampleRate: number }>;
      words: string[];
    }
  /** `afterTools`: the request's tools had answered, so the model is to use their results rather than call again. */
  | { kind: "drop"; retry: boolean; afterTools: boolean };

export interface GuardOptions {
  /** Longest hold before the utterance is released untested. */
  holdMs?: number;
  /** Characters of the utterance that are enough to tell it is not an apology. */
  enoughChars?: number;
  maxRetries?: number;
  claimsFailure(text: string): boolean;
}

export class LostToolCallGuard {
  private toolCalls = 0;
  /** The last utterance ended with the model still IN_PROGRESS: the next one continues the task. */
  private continuing = false;
  private toolFailed = false;
  private held: {
    since: number;
    words: string[];
    audio: Array<{ pcm: Buffer; sampleRate: number }>;
  } | null = null;
  /** The utterance under way was already let through: the rest of it is not held again. */
  private passing = false;
  /** The rest of a dropped utterance, until the provider confirms it stopped. */
  private dropping = false;
  /** An apology was dropped: whatever the model says next answers the same request and is held like a continuation. */
  private afterDrop = false;
  private retries = 0;
  private finished = false;

  constructor(private readonly options: GuardOptions) {}

  private get holdMs(): number {
    return this.options.holdMs ?? 900;
  }

  /** The user made a new request: its own tools and utterances count from here. */
  newRequest(): void {
    this.toolCalls = 0;
    this.continuing = false;
    this.toolFailed = false;
    this.retries = 0;
    this.finished = false;
    this.held = null;
    this.passing = false;
    this.dropping = false;
    this.afterDrop = false;
  }

  /** The model called a tool: what was held is not an apology, and what it says after the results is held again. */
  toolCalled(): GuardVerdict {
    this.toolCalls += 1;
    const release = this.flush();
    this.passing = false;
    this.continuing = true;
    return release;
  }

  toolAnswered(ok: boolean): void {
    if (!ok) this.toolFailed = true;
  }

  /** The model ended an utterance; `working` when it said it is still IN_PROGRESS. */
  utteranceEnded(working: boolean): GuardVerdict {
    if (this.dropping) {
      this.dropping = false;
      this.continuing = true;
      return { kind: "pass" };
    }
    const release = this.flush();
    this.passing = false;
    // After a dropped apology the provider may close the stopped utterance as IDLE; the note's answer still continues.
    this.continuing = working || this.afterDrop;
    this.afterDrop = false;
    return release;
  }

  /** The provider stopped the utterance (the guard's note, or the user talking over it). */
  interrupted(): void {
    this.dropping = false;
    this.held = null;
    this.passing = false;
  }

  audio(pcm: Buffer, sampleRate: number, now: number): GuardVerdict {
    if (this.dropping) return { kind: "drop", retry: false, afterTools: this.toolCalls > 0 };
    if (this.held) {
      this.held.audio.push({ pcm, sampleRate });
      return this.expired(now) ? this.flush() : { kind: "hold" };
    }
    if (
      (this.continuing || this.afterDrop) && !this.passing && !this.toolFailed &&
      !this.finished
    ) {
      this.held = { since: now, words: [], audio: [{ pcm, sampleRate }] };
      return { kind: "hold" };
    }
    return { kind: "pass" };
  }

  words(text: string, now: number): GuardVerdict {
    if (this.dropping) return { kind: "suppress" };
    if (
      !this.held &&
      (this.continuing || this.afterDrop) &&
      !this.passing &&
      !this.toolFailed &&
      !this.finished
    ) {
      this.held = { since: now, words: [], audio: [] };
    }
    if (!this.held) return { kind: "pass" };
    this.held.words.push(text);
    // A tool of this request really failed: saying so is the truth, not a lost step.
    if (this.toolFailed) return this.flush();
    const said = this.held.words.join("");
    if (this.options.claimsFailure(said)) {
      this.held = null;
      this.dropping = true;
      this.afterDrop = true;
      const retry = this.retries < (this.options.maxRetries ?? 2);
      if (retry) this.retries += 1;
      else this.finished = true;
      return { kind: "drop", retry, afterTools: this.toolCalls > 0 };
    }
    if (said.length >= (this.options.enoughChars ?? 28) || this.expired(now)) return this.flush();
    return { kind: "hold" };
  }

  /** Called on a timer while holding: releases what is held once the hold is over. */
  tick(now: number): GuardVerdict {
    return this.held && this.expired(now) ? this.flush() : { kind: "pass" };
  }

  get holding(): boolean {
    return this.held !== null;
  }

  private expired(now: number): boolean {
    return this.held !== null && now - this.held.since >= this.holdMs;
  }

  private flush(): GuardVerdict {
    if (!this.held) return { kind: "pass" };
    const { audio, words } = this.held;
    this.held = null;
    // What was held was not an apology: the rest of this utterance goes straight through.
    this.passing = true;
    return { kind: "release", audio, words };
  }

  snapshot(): { retries: number; finished: boolean } {
    return { retries: this.retries, finished: this.finished };
  }

  restore(state: { retries?: number; finished?: boolean } | undefined): void {
    this.retries = Math.max(0, state?.retries ?? 0);
    this.finished = state?.finished === true;
  }
}
