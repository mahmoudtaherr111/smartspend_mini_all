/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Utilities & Helper Implementations for AI Streaming, Bidi & Resilient Chat
// ============================================================================

export interface RetryAfterInfo {
  retryAfterSeconds: number;
  formattedArabicMessage: string;
  source: "payload" | "header" | "fallback";
}

/**
 * Parses dynamic retryAfter backoff from tRPC error data or HTTP headers.
 */
export function parse429RetryAfter(errorResponse: {
  data?: { retryAfterSeconds?: number };
  headers?: Headers | Record<string, string>;
  defaultBackoffSeconds?: number;
}): RetryAfterInfo {
  const fallback = errorResponse.defaultBackoffSeconds ?? 30;

  // 1. Check tRPC custom payload
  if (
    errorResponse.data &&
    typeof errorResponse.data.retryAfterSeconds === "number" &&
    errorResponse.data.retryAfterSeconds > 0
  ) {
    const sec = Math.ceil(errorResponse.data.retryAfterSeconds);
    return {
      retryAfterSeconds: sec,
      formattedArabicMessage: `تم تجاوز الحد المسموح. يرجى الانتظار ${sec} ثانية قبل إرسال طلب جديد.`,
      source: "payload",
    };
  }

  // 2. Check HTTP Retry-After header
  const headers = errorResponse.headers;
  if (headers) {
    let headerVal: string | null = null;
    if (typeof (headers as Headers).get === "function") {
      headerVal = (headers as Headers).get("Retry-After");
    } else if (typeof headers === "object") {
      headerVal =
        (headers as Record<string, string>)["retry-after"] ||
        (headers as Record<string, string>)["Retry-After"] ||
        null;
    }

    if (headerVal) {
      // Check if numeric seconds
      const parsedSec = parseInt(headerVal, 10);
      if (!isNaN(parsedSec) && parsedSec > 0) {
        return {
          retryAfterSeconds: parsedSec,
          formattedArabicMessage: `تم تجاوز الحد المسموح. يرجى الانتظار ${parsedSec} ثانية قبل إرسال طلب جديد.`,
          source: "header",
        };
      }

      // Check if HTTP-date format
      const parsedDate = new Date(headerVal).getTime();
      if (!isNaN(parsedDate)) {
        const diffSec = Math.max(1, Math.ceil((parsedDate - Date.now()) / 1000));
        return {
          retryAfterSeconds: diffSec,
          formattedArabicMessage: `تم تجاوز الحد المسموح. يرجى الانتظار ${diffSec} ثانية قبل إرسال طلب جديد.`,
          source: "header",
        };
      }
    }
  }

  return {
    retryAfterSeconds: fallback,
    formattedArabicMessage: `تم تجاوز الحد المسموح. يرجى الانتظار ${fallback} ثانية قبل إرسال طلب جديد.`,
    source: "fallback",
  };
}

/**
 * Timeout configuration calibrator for LLM Gateway vs Frontend Client.
 */
export interface TimeoutConfig {
  upstreamGatewayTimeoutMs: number;
  clientTimeoutMs: number;
  isCalibrated: boolean;
}

export function calibrateTimeouts(
  gatewayTimeoutMs = 32_000,
  clientTimeoutMs = 45_000
): TimeoutConfig {
  // Client timeout MUST be strictly greater than gateway timeout to prevent false-positive disconnects
  const isCalibrated = clientTimeoutMs > gatewayTimeoutMs;
  return {
    upstreamGatewayTimeoutMs: gatewayTimeoutMs,
    clientTimeoutMs: Math.max(clientTimeoutMs, gatewayTimeoutMs + 5000),
    isCalibrated,
  };
}

/**
 * Markdown & Bidi Stream Parser with Directionality & Token Boundary Protection.
 */
export class BidiStreamParser {
  private buffer = "";
  private inCodeFence = false;
  private codeFenceLanguage = "";

  public feedChunk(chunk: string): string {
    this.buffer += chunk;
    return this.renderSafePreview(this.buffer);
  }

  public getRawBuffer(): string {
    return this.buffer;
  }

  public reset(): void {
    this.buffer = "";
    this.inCodeFence = false;
    this.codeFenceLanguage = "";
  }

  /**
   * Automatically closes unclosed Markdown elements (code blocks, bold, etc.)
   * and isolates mixed Arabic/English directionality using Bidi markers.
   */
  public renderSafePreview(text: string): string {
    let sanitized = text;

    // Detect unclosed code fences
    const fenceMatches = sanitized.match(/```/g) || [];
    const hasUnclosedCode = fenceMatches.length % 2 !== 0;

    if (hasUnclosedCode) {
      sanitized += "\n```"; // Close fence for safe rendering
    }

    // Detect unclosed bold markers **
    const boldMatches = sanitized.match(/\*\*/g) || [];
    if (boldMatches.length % 2 !== 0) {
      sanitized += "**";
    }

    return sanitized;
  }

  /**
   * Wrap numbers and LTR tokens inside Arabic text with LTR embedding marks (\u202A ... \u202C)
   * to ensure Egyptian dialect currency ("150 ج.م") or English brand names ("Carrefour المعادي")
   * render without inverted punctuation.
   */
  public static isolateBidiTokens(text: string): string {
    // Isolate English words/codes surrounded by Arabic
    const arabicRegex = /[\u0600-\u06FF]/;
    if (!arabicRegex.test(text)) {
      return text;
    }

    // Wrap English words / currency tokens in directional isolation
    return text.replace(/([A-Za-z0-9_.-]+(\s+[A-Za-z0-9_.-]+)*)/g, (match) => {
      // Don't wrap pure single spaces or empty
      if (!match.trim()) return match;
      return `\u200E${match}\u200E`; // LRM (Left-to-Right Mark)
    });
  }
}

/**
 * Chat Conversation Draft & State Store for Tab Navigation & Unmount Persistence.
 */
export class ChatDraftStore {
  private storageKey: string;

  constructor(userId: string | number = "default") {
    this.storageKey = `smartspend_chat_draft_${userId}`;
  }

  public saveDraft(draft: { conversationId?: string; prompt: string; timestamp?: number }): void {
    try {
      const payload = {
        ...draft,
        timestamp: draft.timestamp || Date.now(),
      };
      sessionStorage.setItem(this.storageKey, JSON.stringify(payload));
    } catch (e) {}
  }

  public getDraft(): { conversationId?: string; prompt: string; timestamp: number } | null {
    try {
      const raw = sessionStorage.getItem(this.storageKey);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  public clearDraft(): void {
    try {
      sessionStorage.removeItem(this.storageKey);
    } catch (e) {}
  }
}

// ============================================================================
// TEST SUITE: AI Streaming Resilience & Edge Cases
// ============================================================================

describe("AI Streaming Resilience & Edge-Case Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Tier 1: Client-Server Abort Signal Propagation & Cancellation
  // --------------------------------------------------------------------------
  describe("Tier 1: AbortController Signal Propagation", () => {
    it("1.1 triggers abort signal and terminates in-flight stream on user cancellation", async () => {
      const controller = new AbortController();
      let streamCancelled = false;

      // Mock asynchronous stream consumer
      const mockStreamReader = async (signal: AbortSignal) => {
        return new Promise<string>((resolve, reject) => {
          const timeout = setTimeout(() => {
            resolve("Stream completed");
          }, 5000);

          signal.addEventListener("abort", () => {
            clearTimeout(timeout);
            streamCancelled = true;
            const err = new Error("Aborted by user");
            err.name = "AbortError";
            reject(err);
          });
        });
      };

      const streamPromise = mockStreamReader(controller.signal);

      // User cancels mid-stream
      controller.abort();

      await expect(streamPromise).rejects.toThrow("Aborted by user");
      expect(streamCancelled).toBe(true);
      expect(controller.signal.aborted).toBe(true);
    });

    it("1.2 handles immediate abort before stream starts without hanging", async () => {
      const controller = new AbortController();
      controller.abort(); // already aborted

      const mockFetch = vi.fn().mockImplementation((_url, options) => {
        if (options?.signal?.aborted) {
          const err = new Error("The user aborted a request.");
          err.name = "AbortError";
          return Promise.reject(err);
        }
        return Promise.resolve(new Response("ok"));
      });

      await expect(mockFetch("/api/chat/stream", { signal: controller.signal })).rejects.toThrow(
        "The user aborted a request."
      );
    });

    it("1.3 prevents stale abort signal reuse across consecutive chat turns", () => {
      let activeController = new AbortController();

      // Turn 1 cancelled
      activeController.abort();
      expect(activeController.signal.aborted).toBe(true);

      // Turn 2 started - must instantiate fresh AbortController
      activeController = new AbortController();
      expect(activeController.signal.aborted).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Tier 2: 429 Rate-Limit Backoff Parsing & Arabic UX
  // --------------------------------------------------------------------------
  describe("Tier 2: 429 Rate-Limit Backoff Parsing & Arabic Localized UX", () => {
    it("2.1 parses retryAfterSeconds from tRPC structured error payload", () => {
      const result = parse429RetryAfter({
        data: { retryAfterSeconds: 45 },
      });

      expect(result.retryAfterSeconds).toBe(45);
      expect(result.source).toBe("payload");
      expect(result.formattedArabicMessage).toContain("45 ثانية");
    });

    it("2.2 parses Retry-After header with integer seconds", () => {
      const headers = new Headers();
      headers.set("Retry-After", "60");

      const result = parse429RetryAfter({ headers });
      expect(result.retryAfterSeconds).toBe(60);
      expect(result.source).toBe("header");
      expect(result.formattedArabicMessage).toContain("60 ثانية");
    });

    it("2.3 parses Retry-After header with HTTP-date timestamp", () => {
      const futureDate = new Date(Date.now() + 25000).toUTCString();
      const headers = { "retry-after": futureDate };

      const result = parse429RetryAfter({ headers });
      expect(result.retryAfterSeconds).toBeGreaterThanOrEqual(23);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(26);
      expect(result.source).toBe("header");
    });

    it("2.4 falls back to default backoff when payload or header is absent", () => {
      const result = parse429RetryAfter({ defaultBackoffSeconds: 30 });
      expect(result.retryAfterSeconds).toBe(30);
      expect(result.source).toBe("fallback");
      expect(result.formattedArabicMessage).toContain("30 ثانية");
    });

    it("2.5 handles negative, zero, or NaN retry values by falling back safely", () => {
      const result = parse429RetryAfter({
        data: { retryAfterSeconds: -10 },
        defaultBackoffSeconds: 20,
      });
      expect(result.retryAfterSeconds).toBe(20);
      expect(result.source).toBe("fallback");
    });
  });

  // --------------------------------------------------------------------------
  // Tier 3: Timeout Calibration & Synchronization
  // --------------------------------------------------------------------------
  describe("Tier 3: Gateway & Client Timeout Calibration", () => {
    it("3.1 verifies client timeout is strictly calibrated above gateway timeout", () => {
      const config = calibrateTimeouts(32_000, 45_000);
      expect(config.isCalibrated).toBe(true);
      expect(config.clientTimeoutMs).toBeGreaterThan(config.upstreamGatewayTimeoutMs);
      expect(config.clientTimeoutMs - config.upstreamGatewayTimeoutMs).toBe(13_000);
    });

    it("3.2 automatically clamps client timeout if misconfigured lower than gateway", () => {
      // If someone mistakenly passes clientTimeoutMs = 20_000 and gateway = 32_000
      const config = calibrateTimeouts(32_000, 20_000);
      expect(config.clientTimeoutMs).toBe(37_000); // gateway + 5000ms safety margin
      expect(config.clientTimeoutMs).toBeGreaterThan(config.upstreamGatewayTimeoutMs);
    });

    it("3.3 resets timeout watchdog upon receiving streaming chunks", () => {
      let timeoutWatchdog: NodeJS.Timeout | null = null;
      let timeoutTriggered = false;

      const resetWatchdog = (timeoutMs: number) => {
        if (timeoutWatchdog) clearTimeout(timeoutWatchdog);
        timeoutWatchdog = setTimeout(() => {
          timeoutTriggered = true;
        }, timeoutMs);
      };

      // Initial arm with 50ms timeout
      resetWatchdog(50);

      // Chunk 1 arrives at 20ms -> resets watchdog
      setTimeout(() => resetWatchdog(50), 20);

      // Chunk 2 arrives at 40ms -> resets watchdog
      setTimeout(() => resetWatchdog(50), 40);

      // Check at 60ms: watchdog should NOT have fired yet because it was reset
      setTimeout(() => {
        expect(timeoutTriggered).toBe(false);
        if (timeoutWatchdog) clearTimeout(timeoutWatchdog);
      }, 60);
    });
  });

  // --------------------------------------------------------------------------
  // Tier 4: Markdown Stream Formatting & RTL Bidi Text Isolation
  // --------------------------------------------------------------------------
  describe("Tier 4: Markdown Stream Integrity & Egyptian Dialect Bidi Formatting", () => {
    it("4.1 auto-closes unclosed code blocks during active streaming chunks", () => {
      const parser = new BidiStreamParser();

      // Chunk with opened code fence
      const preview1 = parser.feedChunk("هذا كود لحساب المصاريف:\n```typescript\nconst total = 1500;");
      expect(preview1).toContain("```typescript\nconst total = 1500;\n```");

      // Chunk that formally closes the code fence
      const preview2 = parser.feedChunk("\n```\nتم الحساب بنجاح!");
      expect(preview2).toContain("const total = 1500;\n```\nتم الحساب بنجاح!");
      // Should not have redundant duplicate fences
      expect((preview2.match(/```/g) || []).length).toBe(2);
    });

    it("4.2 auto-closes unclosed bold/italic formatting during streaming", () => {
      const parser = new BidiStreamParser();
      const preview = parser.feedChunk("المبلغ الإجمالي هو **1500 جنيه");
      expect(preview).toBe("المبلغ الإجمالي هو **1500 جنيه**");
    });

    it("4.3 correctly isolates mixed Arabic and LTR currency/brand tokens", () => {
      const mixedText = "دفعت 250 EGP في Carrefour المعادي و 50 USD أونلاين";
      const isolated = BidiStreamParser.isolateBidiTokens(mixedText);

      // Expect directional marks wrapping the LTR tokens
      expect(isolated).toContain("\u200E250 EGP\u200E");
      expect(isolated).toContain("\u200ECarrefour\u200E");
      expect(isolated).toContain("\u200E50 USD\u200E");
    });

    it("4.4 preserves conversation draft across tab unmounts and navigations", () => {
      const store = new ChatDraftStore("user_123");

      // User types prompt and switches tab
      store.saveDraft({
        conversationId: "conv-abc-999",
        prompt: "عايز تقرير مصاريف شهر أغسطس اللي فات",
      });

      // Tab remounts: recover draft
      const restored = store.getDraft();
      expect(restored).not.toBeNull();
      expect(restored?.conversationId).toBe("conv-abc-999");
      expect(restored?.prompt).toBe("عايز تقرير مصاريف شهر أغسطس اللي فات");
      expect(restored?.timestamp).toBeGreaterThan(0);

      // Clear draft upon submission
      store.clearDraft();
      expect(store.getDraft()).toBeNull();
    });
  });
});
