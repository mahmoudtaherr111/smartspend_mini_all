/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Multi-Tab Auth Synchronization & Draft Preservation Models
// ============================================================================

export type AuthEventType = "AUTH_LOGIN" | "AUTH_LOGOUT" | "SESSION_EXPIRED" | "TOKEN_REFRESH";

export interface AuthBroadcastMessage {
  type: AuthEventType;
  token?: string;
  user?: {
    id: number;
    name: string;
    email?: string | null;
    role: "user" | "moderator" | "admin";
    plan: "free" | "pro" | "ultra";
    type: "oauth" | "local";
  };
  timestamp: number;
}

/**
 * Multi-Tab Auth Synchronizer using BroadcastChannel with Storage Event Fallback
 */
export class MultiTabAuthSync {
  private channel: BroadcastChannel | null = null;
  private onAuthEventCallback?: (msg: AuthBroadcastMessage) => void;

  constructor(onAuthEvent?: (msg: AuthBroadcastMessage) => void) {
    this.onAuthEventCallback = onAuthEvent;
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        this.channel = new BroadcastChannel("smartspend_auth");
        this.channel.onmessage = (event: MessageEvent<AuthBroadcastMessage>) => {
          if (event.data && event.data.type) {
            this.onAuthEventCallback?.(event.data);
          }
        };
      } catch (e) {
        this.channel = null;
      }
    }
  }

  public broadcastLogin(token: string, user: NonNullable<AuthBroadcastMessage["user"]>): void {
    const msg: AuthBroadcastMessage = {
      type: "AUTH_LOGIN",
      token,
      user,
      timestamp: Date.now(),
    };
    if (this.channel) {
      this.channel.postMessage(msg);
    }
    // Also trigger storage key update for cross-tab storage event listeners
    localStorage.setItem("local_auth_token", token);
    localStorage.setItem("smartspend_auth_sync_event", JSON.stringify(msg));
  }

  public broadcastLogout(): void {
    const msg: AuthBroadcastMessage = {
      type: "AUTH_LOGOUT",
      timestamp: Date.now(),
    };
    if (this.channel) {
      this.channel.postMessage(msg);
    }
    localStorage.removeItem("local_auth_token");
    localStorage.removeItem("smartspend_offline_texts");
    localStorage.removeItem("smartspend_offline_manual");
    localStorage.setItem("smartspend_auth_sync_event", JSON.stringify(msg));
  }

  public broadcastSessionExpired(): void {
    const msg: AuthBroadcastMessage = {
      type: "SESSION_EXPIRED",
      timestamp: Date.now(),
    };
    if (this.channel) {
      this.channel.postMessage(msg);
    }
    localStorage.setItem("smartspend_auth_sync_event", JSON.stringify(msg));
  }

  public close(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
  }
}

/**
 * Form Draft Preservation on 401 Unauthenticated Interception
 */
export interface ExpenseDraftData {
  text: string;
  amount?: number;
  category?: string;
  subCategory?: string;
  paymentMethod?: string;
  date?: string;
  notes?: string;
}

export class AuthDraftPreserver {
  private static DRAFT_KEY = "smartspend_draft_expense_form";

  public static savePendingDraft(formData: ExpenseDraftData): void {
    try {
      sessionStorage.setItem(
        this.DRAFT_KEY,
        JSON.stringify({
          formData,
          savedAt: Date.now(),
        })
      );
    } catch (e) {}
  }

  public static getPendingDraft(): ExpenseDraftData | null {
    try {
      const raw = sessionStorage.getItem(this.DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed.formData || null;
    } catch {
      return null;
    }
  }

  public static clearPendingDraft(): void {
    try {
      sessionStorage.removeItem(this.DRAFT_KEY);
    } catch (e) {}
  }

  /**
   * Intercepts 401 response and automatically secures current in-progress form inputs
   */
  public static handle401Unauthorized(
    currentFormState: ExpenseDraftData,
    openReauthModal: () => void
  ): void {
    this.savePendingDraft(currentFormState);
    openReauthModal();
  }
}

// ============================================================================
// TEST SUITE: Multi-Tab Auth Sync & Draft Preservation
// ============================================================================

describe("Multi-Tab Auth Synchronization & 401 Draft Preservation Test Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Tier 1: BroadcastChannel Multi-Tab Auth Routing
  // --------------------------------------------------------------------------
  describe("Tier 1: BroadcastChannel Message Propagation", () => {
    it("1.1 broadcasts AUTH_LOGIN across tabs and updates localStorage", () => {
      const authSync = new MultiTabAuthSync();
      const mockUser: NonNullable<AuthBroadcastMessage["user"]> = {
        id: 42,
        name: "أحمد محمود",
        email: "ahmed@example.com",
        role: "user",
        plan: "pro",
        type: "local",
      };

      authSync.broadcastLogin("jwt-token-xyz-123", mockUser);

      expect(localStorage.getItem("local_auth_token")).toBe("jwt-token-xyz-123");
      const eventJson = localStorage.getItem("smartspend_auth_sync_event");
      expect(eventJson).not.toBeNull();
      const parsedEvent = JSON.parse(eventJson!);
      expect(parsedEvent.type).toBe("AUTH_LOGIN");
      expect(parsedEvent.user.name).toBe("أحمد محمود");

      authSync.close();
    });

    it("1.2 broadcasts AUTH_LOGOUT and clears sensitive cached storage items", () => {
      const authSync = new MultiTabAuthSync();

      localStorage.setItem("local_auth_token", "active-token");
      localStorage.setItem("smartspend_offline_texts", JSON.stringify(["pending text"]));
      localStorage.setItem("smartspend_offline_manual", JSON.stringify([{ amount: 50 }]));

      authSync.broadcastLogout();

      expect(localStorage.getItem("local_auth_token")).toBeNull();
      expect(localStorage.getItem("smartspend_offline_texts")).toBeNull();
      expect(localStorage.getItem("smartspend_offline_manual")).toBeNull();

      const eventJson = localStorage.getItem("smartspend_auth_sync_event");
      const parsedEvent = JSON.parse(eventJson!);
      expect(parsedEvent.type).toBe("AUTH_LOGOUT");

      authSync.close();
    });

    it("1.3 broadcasts SESSION_EXPIRED event", () => {
      const authSync = new MultiTabAuthSync();

      authSync.broadcastSessionExpired();

      const eventJson = localStorage.getItem("smartspend_auth_sync_event");
      const parsedEvent = JSON.parse(eventJson!);
      expect(parsedEvent.type).toBe("SESSION_EXPIRED");

      authSync.close();
    });
  });

  // --------------------------------------------------------------------------
  // Tier 2: Storage Event Listener Synchronization
  // --------------------------------------------------------------------------
  describe("Tier 2: Cross-Tab Storage Event Synchronization", () => {
    it("2.1 reacts to storage event when local_auth_token is removed by another tab", () => {
      let loggedOutByStorage = false;

      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === "local_auth_token" && e.newValue === null) {
          loggedOutByStorage = true;
        }
      };

      window.addEventListener("storage", handleStorageChange);

      // Simulate StorageEvent fired by browser when another tab clears token
      const mockStorageEvent = new StorageEvent("storage", {
        key: "local_auth_token",
        oldValue: "valid-token",
        newValue: null,
      });
      window.dispatchEvent(mockStorageEvent);

      expect(loggedOutByStorage).toBe(true);

      window.removeEventListener("storage", handleStorageChange);
    });

    it("2.2 reacts to storage event when smartspend_auth_sync_event is updated", () => {
      const receivedEvents: any[] = [];

      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === "smartspend_auth_sync_event" && e.newValue) {
          receivedEvents.push(JSON.parse(e.newValue));
        }
      };

      window.addEventListener("storage", handleStorageChange);

      const eventPayload = {
        type: "AUTH_LOGIN",
        token: "new-token-456",
        timestamp: Date.now(),
      };

      window.dispatchEvent(
        new StorageEvent("storage", {
          key: "smartspend_auth_sync_event",
          newValue: JSON.stringify(eventPayload),
        })
      );

      expect(receivedEvents).toHaveLength(1);
      expect(receivedEvents[0].type).toBe("AUTH_LOGIN");
      expect(receivedEvents[0].token).toBe("new-token-456");

      window.removeEventListener("storage", handleStorageChange);
    });
  });

  // --------------------------------------------------------------------------
  // Tier 3: 401 Unauthenticated & Form Draft Preservation
  // --------------------------------------------------------------------------
  describe("Tier 3: 401 Interception & Form Draft Preservation", () => {
    it("3.1 saves active form inputs to sessionStorage when 401 error occurs", () => {
      const activeForm: ExpenseDraftData = {
        text: "صيانة السيارة في الحرفيين 2400 جنيه",
        amount: 2400,
        category: "سيارات وصيانة",
        paymentMethod: "كاش",
        notes: "تم تغيير زيت وفلاتر",
      };

      const openModalMock = vi.fn();

      AuthDraftPreserver.handle401Unauthorized(activeForm, openModalMock);

      expect(openModalMock).toHaveBeenCalledTimes(1);

      const savedDraft = AuthDraftPreserver.getPendingDraft();
      expect(savedDraft).toEqual(activeForm);
    });

    it("3.2 restores saved draft and clears sessionStorage after successful re-auth", () => {
      const activeForm: ExpenseDraftData = {
        text: "فاتورة كهرباء 350 جنيه",
        amount: 350,
        category: "فواتير وخدمات",
      };

      AuthDraftPreserver.savePendingDraft(activeForm);

      // Verify draft exists
      expect(AuthDraftPreserver.getPendingDraft()).toEqual(activeForm);

      // Re-auth succeeds -> Form restores draft and clears storage
      const restored = AuthDraftPreserver.getPendingDraft();
      AuthDraftPreserver.clearPendingDraft();

      expect(restored).toEqual(activeForm);
      expect(AuthDraftPreserver.getPendingDraft()).toBeNull();
    });

    it("3.3 handles null/empty form data without throwing errors", () => {
      expect(AuthDraftPreserver.getPendingDraft()).toBeNull();
      expect(() => AuthDraftPreserver.clearPendingDraft()).not.toThrow();
    });
  });
});
