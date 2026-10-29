import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  friendlyHttpError,
  saveFormDraft,
  getFormDraft,
  clearFormDraft,
  clearAllFormDrafts,
  registerDraftCollector,
  preserveActiveFormDrafts,
  handleUnauthenticatedSession,
  deviceHadSession,
  DRAFT_STORAGE_PREFIX,
  ACTIVE_DRAFTS_INDEX_KEY,
} from "./trpc";

describe("tRPC Client Headers & Tunnel Bypass Removal", () => {
  const originalLocalStorage = globalThis.localStorage;
  const originalSessionStorage = globalThis.sessionStorage;
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalLocalStorage !== undefined) {
      Object.defineProperty(globalThis, "localStorage", {
        value: originalLocalStorage,
        writable: true,
        configurable: true,
      });
    } else {
      delete (globalThis as any).localStorage;
    }

    if (originalSessionStorage !== undefined) {
      Object.defineProperty(globalThis, "sessionStorage", {
        value: originalSessionStorage,
        writable: true,
        configurable: true,
      });
    } else {
      delete (globalThis as any).sessionStorage;
    }

    if (originalBroadcastChannel !== undefined) {
      (globalThis as any).BroadcastChannel = originalBroadcastChannel;
    } else {
      delete (globalThis as any).BroadcastChannel;
    }
  });

  // =========================================================================
  // 1. STATIC CODE AUDIT & INVARIANTS
  // =========================================================================
  describe("1. Static Code Invariants (No Legacy Tunnel Headers)", () => {
    const filePath = path.resolve(process.cwd(), "src/providers/trpc.ts");
    const sourceCode = fs.readFileSync(filePath, "utf-8");

    it("does not contain 'bypass-tunnel-reminder' header", () => {
      expect(sourceCode).not.toContain("bypass-tunnel-reminder");
    });

    it("does not contain 'ngrok-skip-browser-warning' header", () => {
      expect(sourceCode).not.toContain("ngrok-skip-browser-warning");
    });
  });

  // =========================================================================
  // 2. RUNTIME HEADERS BEHAVIOR
  // =========================================================================
  describe("2. The session travels in the HttpOnly cookie", () => {
    it("adds no Authorization header, even when an older build left a token in storage", () => {
      // The cookie is sent by the browser on its own; the client must not read storage for a token.
      const sourceCode = fs.readFileSync(path.resolve(process.cwd(), "src/providers/trpc.ts"), "utf-8");
      expect(sourceCode).not.toContain("local_auth_token");
      expect(sourceCode).not.toMatch(/Authorization/);
    });
  });

  // =========================================================================
  // 3. FRIENDLY HTTP ERROR MESSAGES
  // =========================================================================
  describe("3. Friendly Arabic HTTP Error Messages", () => {
    it("maps 401 unauthenticated to session expiration message", () => {
      expect(friendlyHttpError(401)).toContain("انتهت الجلسة");
    });

    it("maps 403 forbidden to unauthorized access message", () => {
      expect(friendlyHttpError(403)).toContain("مش مسموحلك");
    });

    it("maps 404 not found to missing endpoint message", () => {
      expect(friendlyHttpError(404)).toContain("غير موجود");
    });

    it("maps 429 rate limit to wait message", () => {
      expect(friendlyHttpError(429)).toContain("طلبات كثيرة");
    });

    it("maps 500 server error to server failure message", () => {
      expect(friendlyHttpError(500)).toContain("خطأ في الخادم");
      expect(friendlyHttpError(502)).toContain("خطأ في الخادم");
    });

    it("provides fallback message for unclassified status codes", () => {
      expect(friendlyHttpError(418)).toContain("ماقدرناش نكمّل الطلب");
    });
  });

  // =========================================================================
  // 4. FORM DRAFT PRESERVATION & RECOVERY
  // =========================================================================
  describe("4. Form Draft Preservation in sessionStorage", () => {
    let mockSessionStore: Record<string, string> = {};

    beforeEach(() => {
      mockSessionStore = {};
      const mockSessionStorage = {
        getItem: vi.fn((key: string) => mockSessionStore[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          mockSessionStore[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockSessionStore[key];
        }),
        key: vi.fn((index: number) => Object.keys(mockSessionStore)[index] || null),
        get length() {
          return Object.keys(mockSessionStore).length;
        },
        clear: vi.fn(() => {
          mockSessionStore = {};
        }),
      };
      Object.defineProperty(globalThis, "sessionStorage", {
        value: mockSessionStorage,
        writable: true,
        configurable: true,
      });
    });

    it("saves and retrieves a form draft accurately", () => {
      const draftData = { text: "غداء في مطعم 150 جنيه", category: "طعام" };
      saveFormDraft("expense_form", draftData);

      const recovered = getFormDraft("expense_form");
      expect(recovered).toEqual(draftData);
    });

    it("clears a specific form draft upon request", () => {
      saveFormDraft("draft_1", { amount: 100 });
      saveFormDraft("draft_2", { amount: 200 });

      clearFormDraft("draft_1");

      expect(getFormDraft("draft_1")).toBeNull();
      expect(getFormDraft("draft_2")).toEqual({ amount: 200 });
    });

    it("clears all form drafts", () => {
      saveFormDraft("draft_a", { a: 1 });
      saveFormDraft("draft_b", { b: 2 });

      clearAllFormDrafts();

      expect(getFormDraft("draft_a")).toBeNull();
      expect(getFormDraft("draft_b")).toBeNull();
    });

    it("discards expired drafts exceeding maxAgeMs", () => {
      const draftData = { goal: "شراء لابتوب", target: 30000 };
      saveFormDraft("goal_form", draftData);

      // Retrieve with maxAgeMs = -1 (immediate expiration)
      const expired = getFormDraft("goal_form", -1);
      expect(expired).toBeNull();
    });

    it("collects drafts from registered form collectors during preservation", () => {
      const collector1 = vi.fn(() => ({ activeText: "مشاوير 80 جنيه" }));
      const collector2 = vi.fn(() => ({ walletName: "فودافون كاش", balance: "5000" }));

      const unregister1 = registerDraftCollector("expense_active", collector1);
      const unregister2 = registerDraftCollector("wallet_active", collector2);

      preserveActiveFormDrafts();

      expect(collector1).toHaveBeenCalled();
      expect(collector2).toHaveBeenCalled();
      expect(getFormDraft("expense_active")).toEqual({ activeText: "مشاوير 80 جنيه" });
      expect(getFormDraft("wallet_active")).toEqual({ walletName: "فودافون كاش", balance: "5000" });

      unregister1();
      unregister2();
    });
  });

  // =========================================================================
  // 5. SESSION EXPIRATION & 401 HANDLING
  // =========================================================================
  describe("5. Session Expiration Interception", () => {
    it("broadcasts SESSION_EXPIRED and preserves active drafts without throwing", () => {
      let broadcastCalled = false;
      let postedMessage: any = null;

      class MockBroadcastChannel {
        name: string;
        constructor(name: string) {
          this.name = name;
        }
        postMessage(msg: any) {
          broadcastCalled = true;
          postedMessage = msg;
        }
        close() {}
      }

      (globalThis as any).BroadcastChannel = MockBroadcastChannel;

      const mockSessionStorage = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        key: vi.fn(() => null),
        length: 0,
      };
      Object.defineProperty(globalThis, "sessionStorage", {
        value: mockSessionStorage,
        writable: true,
        configurable: true,
      });

      expect(() =>
        handleUnauthenticatedSession({ silent: true, source: "/api/trpc/expense.create" }),
      ).not.toThrow();

      expect(broadcastCalled).toBe(true);
      expect(postedMessage?.type).toBe("SESSION_EXPIRED");
    });

    it("reads a 401 as an ended session only on a device that was signed in", () => {
      const store = new Map<string, string>();
      Object.defineProperty(globalThis, "localStorage", {
        value: {
          getItem: (key: string) => store.get(key) ?? null,
          setItem: (key: string, value: string) => store.set(key, value),
          removeItem: (key: string) => store.delete(key),
        },
        writable: true,
        configurable: true,
      });
      expect(deviceHadSession()).toBe(false);
      store.set("smartspend_offline_identity_v1", "{}");
      expect(deviceHadSession()).toBe(true);
      store.clear();
      // A token older builds kept is not a session: only the identity a sign-in leaves counts.
      store.set("local_auth_token", "t");
      expect(deviceHadSession()).toBe(false);
    });
  });
});
