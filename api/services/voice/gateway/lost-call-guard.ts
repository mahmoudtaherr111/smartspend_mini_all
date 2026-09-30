/**
 * The extended-thinking model sometimes loses its own tool call inside the provider: it says a filler ("هشوفلك
 * الرصيد"), ends that utterance while still IN_PROGRESS, never sends the `toolCall`, and then apologises for a "system
 * error" that did not happen (docs/systems/voice-calls.md, known issues; .agents evidence: ~1 request in 10 at LOW).
 *
 * This guard keeps that apology from the user. After a filler that ended IN_PROGRESS with no tool call for the current
 * request, the next utterance's first audio and words are held for a moment. If the words claim a failure while no
 * tool failed, the held audio is dropped and the call asks the model to call the tool again; otherwise everything held
 * is released at once. The cost is a delay of at most `holdMs` on that one kind of utterance.
 *
 * Pure bookkeeping: CallSession feeds it events and does what it answers.
 */
export type GuardVerdict =
  | { kind: "pass" }
  | { kind: "hold" }
  | { kind: "release"; audio: Array<{ pcm: Buffer; sampleRate: number }>; words: string[] }
  | { kind: "drop"; retry: boolean };

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
  private fillerEnded = false;
  private toolFailed = false;
  private held: { since: number; words: string[]; audio: Array<{ pcm: Buffer; sampleRate: number }> } | null = null;
  /** The rest of a dropped utterance, until the provider confirms it stopped. */
  private dropping = false;
  private retries = 0;

  constructor(private readonly options: GuardOptions) {}

  private get holdMs(): number {
    return this.options.holdMs ?? 900;
  }

  /** The user made a new request: its own tools and fillers count from here. */
  newRequest(): void {
    this.toolCalls = 0;
    this.fillerEnded = false;
    this.toolFailed = false;
    this.retries = 0;
    this.held = null;
    this.dropping = false;
  }

  /** The model called a tool: whatever it says next is not a lost call. */
  toolCalled(): GuardVerdict {
    this.toolCalls += 1;
    this.fillerEnded = false;
    return this.flush();
  }

  toolAnswered(ok: boolean): void {
    if (!ok) this.toolFailed = true;
  }

  /** The model ended an utterance; `working` when it said it is still IN_PROGRESS. */
  utteranceEnded(working: boolean): GuardVerdict {
    if (this.dropping) {
      this.dropping = false;
      return { kind: "pass" };
    }
    const release = this.flush();
    if (working && this.toolCalls === 0) this.fillerEnded = true;
    return release;
  }

  /** The provider stopped the utterance (the retry note, or the user talking over it). */
  interrupted(): void {
    this.dropping = false;
    this.held = null;
  }

  audio(pcm: Buffer, sampleRate: number, now: number): GuardVerdict {
    if (this.dropping) return { kind: "drop", retry: false };
    if (this.held) {
      this.held.audio.push({ pcm, sampleRate });
      return this.expired(now) ? this.flush() : { kind: "hold" };
    }
    if (this.fillerEnded && this.toolCalls === 0) {
      this.held = { since: now, words: [], audio: [{ pcm, sampleRate }] };
      return { kind: "hold" };
    }
    return { kind: "pass" };
  }

  words(text: string, now: number): GuardVerdict {
    if (this.dropping) return { kind: "drop", retry: false };
    if (!this.held) return { kind: "pass" };
    this.held.words.push(text);
    // A tool of this request really failed: saying so is the truth, not a lost call.
    if (this.toolFailed) return this.flush();
    const said = this.held.words.join("");
    if (this.options.claimsFailure(said)) {
      this.held = null;
      this.dropping = true;
      this.fillerEnded = false;
      const retry = this.retries < (this.options.maxRetries ?? 2);
      if (retry) this.retries += 1;
      return { kind: "drop", retry };
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
    this.fillerEnded = false;
    return { kind: "release", audio, words };
  }

  snapshot(): { retries: number } {
    return { retries: this.retries };
  }
}
