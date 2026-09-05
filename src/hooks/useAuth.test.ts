import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  AUTH_BROADCAST_CHANNEL,
  broadcastAuthEvent,
  broadcastLogin,
  broadcastLogout,
  broadcastSessionExpired,
  broadcastTokenRefresh,
  type AuthBroadcastEvent,
} from "./useAuth";

describe("useAuth Multi-Tab Authentication Synchronization", () => {
  const originalBroadcastChannel = (globalThis as any).BroadcastChannel;
  let broadcastMessages: any[] = [];
  let channelInstances: any[] = [];

  class MockBroadcastChannel {
    name: string;
    onmessage: ((event: MessageEvent) => void) | null = null;
    closed = false;

    constructor(name: string) {
      this.name = name;
      channelInstances.push(this);
    }

    postMessage(msg: any) {
      if (this.closed) throw new Error("Channel closed");
      broadcastMessages.push({ channel: this.name, data: msg });
    }

    close() {
      this.closed = true;
    }
  }

  beforeEach(() => {
    broadcastMessages = [];
    channelInstances = [];
    (globalThis as any).BroadcastChannel = MockBroadcastChannel;
  });

  afterEach(() => {
    if (originalBroadcastChannel !== undefined) {
      (globalThis as any).BroadcastChannel = originalBroadcastChannel;
    } else {
      delete (globalThis as any).BroadcastChannel;
    }
  });

  describe("Broadcast Channel Constants & Helpers", () => {
    it("uses 'smartspend_auth' as the broadcast channel name", () => {
      expect(AUTH_BROADCAST_CHANNEL).toBe("smartspend_auth");
    });

    it("broadcasts custom auth events with timestamp", () => {
      const event: AuthBroadcastEvent = {
        type: "AUTH_LOGIN",
        token: "jwt_token_123",
      };

      broadcastAuthEvent(event);

      expect(broadcastMessages).toHaveLength(1);
      expect(broadcastMessages[0].channel).toBe("smartspend_auth");
      expect(broadcastMessages[0].data.type).toBe("AUTH_LOGIN");
      expect(broadcastMessages[0].data.token).toBe("jwt_token_123");
      expect(typeof broadcastMessages[0].data.timestamp).toBe("number");
    });

    it("broadcastLogin sends AUTH_LOGIN event with user payload", () => {
      const user = {
        id: 42,
        name: "أحمد علي",
        email: "ahmed@example.com",
        role: "user" as const,
        plan: "pro" as const,
        type: "local" as const,
      };

      broadcastLogin("token_abc", user);

      expect(broadcastMessages).toHaveLength(1);
      expect(broadcastMessages[0].data.type).toBe("AUTH_LOGIN");
      expect(broadcastMessages[0].data.token).toBe("token_abc");
      expect(broadcastMessages[0].data.user).toEqual(user);
    });

    it("broadcastLogout sends AUTH_LOGOUT event", () => {
      broadcastLogout();

      expect(broadcastMessages).toHaveLength(1);
      expect(broadcastMessages[0].data.type).toBe("AUTH_LOGOUT");
    });

    it("broadcastSessionExpired sends SESSION_EXPIRED event", () => {
      broadcastSessionExpired();

      expect(broadcastMessages).toHaveLength(1);
      expect(broadcastMessages[0].data.type).toBe("SESSION_EXPIRED");
    });

    it("broadcastTokenRefresh sends TOKEN_REFRESH event with new token", () => {
      broadcastTokenRefresh("refreshed_jwt_999");

      expect(broadcastMessages).toHaveLength(1);
      expect(broadcastMessages[0].data.type).toBe("TOKEN_REFRESH");
      expect(broadcastMessages[0].data.token).toBe("refreshed_jwt_999");
    });

    it("gracefully handles environments without BroadcastChannel without throwing", () => {
      delete (globalThis as any).BroadcastChannel;

      expect(() => broadcastLogin("token_123")).not.toThrow();
      expect(() => broadcastLogout()).not.toThrow();
      expect(() => broadcastSessionExpired()).not.toThrow();
      expect(() => broadcastTokenRefresh("token_123")).not.toThrow();
    });
  });
});
