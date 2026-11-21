/**
 * Pacing for free-tier keys: a few requests a minute, a few hundred a day.
 *
 * A 429 scored as a wrong answer measures the quota, not the model, and a harness that
 * retries at once turns one rate limit into ten. So requests start one at a time, at least
 * `60 / rpm` seconds apart (measured between STARTS, so a slow answer does not let the next
 * one go early), a rate-limited case waits what the provider asked (or a minute) and is tried
 * again a bounded number of times, and a provider that asks for a wait longer than a run
 * should sit through stops the run instead of being asked again.
 *
 * Clock and sleep are injected so all of this is tested without waiting.
 */

export type Clock = () => number;
export type Sleep = (ms: number) => Promise<void>;

export const realClock: Clock = () => Date.now();
export const realSleep: Sleep = (ms) => new Promise((done) => setTimeout(done, Math.max(0, ms)));

export class RateLimiter {
  readonly intervalMs: number;
  private nextStartAt = -Infinity;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    rpm: number,
    private readonly clock: Clock = realClock,
    private readonly sleep: Sleep = realSleep,
  ) {
    if (!Number.isFinite(rpm) || rpm <= 0) throw new Error("rpm must be a positive number");
    this.intervalMs = Math.ceil(60_000 / rpm);
  }

  /**
   * Resolves when a request may start, and books that start. Calls are served one at a
   * time in the order they were made, so two callers can never start together.
   */
  acquire(): Promise<number> {
    const turn = this.queue.then(async () => {
      const wait = this.nextStartAt - this.clock();
      if (wait > 0) await this.sleep(wait);
      const startedAt = this.clock();
      this.nextStartAt = startedAt + this.intervalMs;
      return startedAt;
    });
    this.queue = turn.then(
      () => undefined,
      () => undefined,
    );
    return turn;
  }

  /** No request starts before `ms` from now (a provider's Retry-After). Never shortens a wait already booked. */
  holdFor(ms: number): void {
    this.nextStartAt = Math.max(this.nextStartAt, this.clock() + Math.max(0, ms));
  }
}

/** What one try of a case came to. */
export type TryResult<T> =
  | { ok: true; value: T }
  | { ok: false; rateLimited: true; retryAfterMs?: number; detail: string }
  | { ok: false; rateLimited: false; detail: string };

export type CaseOutcome<T> =
  | { status: "done"; value: T; retries: number }
  | { status: "failed"; detail: string; retries: number; rateLimited: boolean }
  /** The provider asked for a wait longer than `maxWaitMs`: likely a daily quota. The run should stop. */
  | { status: "quota"; detail: string; retryAfterMs: number; retries: number };

export interface RetryPolicy {
  /** Retries after the first try, on rate limits only. */
  maxRetries: number;
  /** Wait when the provider names none. */
  defaultWaitMs: number;
  /** A requested wait above this is treated as an exhausted quota. */
  maxWaitMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = { maxRetries: 3, defaultWaitMs: 60_000, maxWaitMs: 10 * 60_000 };

/**
 * One case: wait for its turn, try it, and on a rate limit wait and try again up to
 * `maxRetries` times. Any other failure is final for this run (a resumed run tries it again).
 */
export async function runWithRetries<T>(
  attempt: () => Promise<TryResult<T>>,
  limiter: RateLimiter,
  sleep: Sleep,
  policy: RetryPolicy = DEFAULT_RETRY,
  onWait?: (ms: number, retry: number) => void,
): Promise<CaseOutcome<T>> {
  for (let retries = 0; ; retries++) {
    await limiter.acquire();
    const result = await attempt();
    if (result.ok) return { status: "done", value: result.value, retries };
    if (!result.rateLimited) return { status: "failed", detail: result.detail, retries, rateLimited: false };
    const wait = result.retryAfterMs ?? policy.defaultWaitMs;
    if (wait > policy.maxWaitMs) return { status: "quota", detail: result.detail, retryAfterMs: wait, retries };
    if (retries >= policy.maxRetries) return { status: "failed", detail: result.detail, retries, rateLimited: true };
    onWait?.(wait, retries + 1);
    limiter.holdFor(wait);
    await sleep(wait);
  }
}
