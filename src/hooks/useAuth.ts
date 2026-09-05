import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import {
  clearOfflineIdentity,
  clearPersistedQueryCache,
  getOfflineIdentity,
  saveOfflineIdentity,
} from "@/lib/queryPersister";

export interface AuthUser {
  id: number;
  name: string;
  email?: string | null;
  avatar?: string | null;
  role: "user" | "moderator" | "admin";
  plan: "free" | "pro" | "ultra";
  type: "oauth" | "local";
  phone?: string | null;
  createdAt?: string | Date | null;
}

export const AUTH_BROADCAST_CHANNEL = "smartspend_auth";

export type AuthBroadcastEventType =
  | "AUTH_LOGIN"
  | "LOGIN"
  | "AUTH_LOGOUT"
  | "LOGOUT"
  | "SESSION_EXPIRED"
  | "TOKEN_REFRESH"
  | "AUTH_REFRESH";

export interface AuthBroadcastEvent {
  type: AuthBroadcastEventType;
  token?: string;
  user?: AuthUser | null;
  timestamp?: number;
}

/**
 * Broadcast an authentication event to all other open tabs via BroadcastChannel.
 */
export function broadcastAuthEvent(event: AuthBroadcastEvent): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
    channel.postMessage({
      ...event,
      timestamp: event.timestamp || Date.now(),
    });
    channel.close();
  } catch (e) {
    // Gracefully ignore channel errors in restricted environments
  }
}

export function broadcastLogin(token?: string, user?: AuthUser | null): void {
  broadcastAuthEvent({ type: "AUTH_LOGIN", token, user });
}

export function broadcastLogout(): void {
  broadcastAuthEvent({ type: "AUTH_LOGOUT" });
}

export function broadcastSessionExpired(): void {
  broadcastAuthEvent({ type: "SESSION_EXPIRED" });
}

export function broadcastTokenRefresh(token: string): void {
  broadcastAuthEvent({ type: "TOKEN_REFRESH", token });
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === "undefined" || navigator.onLine,
  );

  const utils = trpc.useUtils();

  const {
    data: oauthUser,
    isFetched: oauthFetched,
    refetch: refetchOAuth,
  } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const {
    data: localUser,
    isFetched: localFetched,
    refetch: refetchLocal,
  } = trpc.localAuth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation();
  const localLogoutMutation = trpc.localAuth.logout.useMutation();

  useEffect(() => {
    const setOnline = () => setIsOnline(true);
    const setOffline = () => setIsOnline(false);
    window.addEventListener("online", setOnline);
    window.addEventListener("offline", setOffline);
    return () => {
      window.removeEventListener("online", setOnline);
      window.removeEventListener("offline", setOffline);
    };
  }, []);

  // Multi-tab session synchronization via BroadcastChannel and window storage events
  useEffect(() => {
    const handleAuthMessage = (eventData: AuthBroadcastEvent) => {
      if (!eventData || !eventData.type) return;

      switch (eventData.type) {
        case "AUTH_LOGIN":
        case "LOGIN":
        case "TOKEN_REFRESH":
        case "AUTH_REFRESH": {
          if (eventData.user) {
            setUser(eventData.user);
            saveOfflineIdentity({
              id: eventData.user.id,
              type: eventData.user.type,
              name: eventData.user.name,
              avatar: eventData.user.avatar,
            });
          }
          // Invalidate and refetch queries to synchronize permissions and session
          void utils.auth.me.invalidate();
          void utils.localAuth.me.invalidate();
          void refetchOAuth();
          void refetchLocal();
          break;
        }

        case "AUTH_LOGOUT":
        case "LOGOUT": {
          setUser(null);
          clearOfflineIdentity();
          utils.auth.me.setData(undefined, null);
          utils.localAuth.me.setData(undefined, null);
          void utils.auth.me.invalidate();
          void utils.localAuth.me.invalidate();
          break;
        }

        case "SESSION_EXPIRED": {
          setUser(null);
          utils.auth.me.setData(undefined, null);
          utils.localAuth.me.setData(undefined, null);
          break;
        }
      }
    };

    let channel: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
        channel.onmessage = (event: MessageEvent<AuthBroadcastEvent>) => {
          handleAuthMessage(event.data);
        };
      }
    } catch {
      // BroadcastChannel unavailable in this environment
    }

    const handleStorageEvent = (event: StorageEvent) => {
      if (event.key === "local_auth_token") {
        if (event.newValue) {
          // Token updated in another tab -> sync login state
          handleAuthMessage({ type: "AUTH_LOGIN", token: event.newValue });
        } else if (event.newValue === null && event.oldValue !== null) {
          // Token removed in another tab -> sync logout state
          handleAuthMessage({ type: "AUTH_LOGOUT" });
        }
      }
    };

    const handleSessionExpiredEvent = () => {
      handleAuthMessage({ type: "SESSION_EXPIRED" });
    };

    if (typeof window !== "undefined") {
      window.addEventListener("storage", handleStorageEvent);
      window.addEventListener(
        "smartspend_session_expired",
        handleSessionExpiredEvent,
      );
      window.addEventListener(
        "smartspend:session-expired",
        handleSessionExpiredEvent,
      );
    }

    return () => {
      if (channel) {
        channel.close();
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("storage", handleStorageEvent);
        window.removeEventListener(
          "smartspend_session_expired",
          handleSessionExpiredEvent,
        );
        window.removeEventListener(
          "smartspend:session-expired",
          handleSessionExpiredEvent,
        );
      }
    };
  }, [utils, refetchOAuth, refetchLocal]);

  useEffect(() => {
    if (!oauthFetched || !localFetched) {
      setIsLoading(true);
      return;
    }

    if (oauthFetched && localFetched) {
      if (oauthUser) {
        const authenticatedUser: AuthUser = {
          id: oauthUser.id,
          name: oauthUser.name,
          email: oauthUser.email,
          avatar: oauthUser.avatar,
          role: oauthUser.role as "user" | "moderator" | "admin",
          plan: oauthUser.plan as "free" | "pro" | "ultra",
          type: "oauth",
          createdAt: oauthUser.createdAt,
        };
        saveOfflineIdentity({
          id: authenticatedUser.id,
          type: authenticatedUser.type,
          name: authenticatedUser.name,
          avatar: authenticatedUser.avatar,
        });
        setUser(authenticatedUser);
      } else if (localUser) {
        const authenticatedUser: AuthUser = {
          id: localUser.id,
          name: localUser.name,
          email: localUser.email,
          role: localUser.role as "user" | "moderator" | "admin",
          plan: localUser.plan as "free" | "pro" | "ultra",
          type: "local",
          phone: localUser.phone,
          createdAt: localUser.createdAt,
        };
        saveOfflineIdentity({
          id: authenticatedUser.id,
          type: authenticatedUser.type,
          name: authenticatedUser.name,
          avatar: authenticatedUser.avatar,
        });
        setUser(authenticatedUser);
      } else if (!isOnline) {
        const offlineIdentity = getOfflineIdentity();
        // This is display-only access to a short-lived, per-user local cache.
        // Never restore plan or admin privileges without validating the session.
        setUser(
          offlineIdentity
            ? {
                id: offlineIdentity.id,
                name: offlineIdentity.name,
                avatar: offlineIdentity.avatar,
                role: "user",
                plan: "free",
                type: offlineIdentity.type,
              }
            : null,
        );
      } else {
        // A definite online unauthenticated response invalidates any snapshot
        // that may remain from an expired session on this device.
        const offlineIdentity = getOfflineIdentity();
        if (offlineIdentity && oauthUser === null && localUser === null) {
          clearOfflineIdentity();
          void clearPersistedQueryCache(offlineIdentity);
        }
        setUser(null);
      }
      setIsLoading(false);
    }
  }, [oauthUser, localUser, oauthFetched, localFetched, isOnline]);

  const logout = useCallback(async () => {
    localStorage.removeItem("local_auth_token");
    // Queued data and hydrated query results belong to the previous user. Never
    // carry either into the next account on a shared phone.
    localStorage.removeItem("smartspend_offline_texts");
    localStorage.removeItem("smartspend_offline_manual");
    document.cookie =
      "google_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";

    // Broadcast logout immediately to all open tabs
    broadcastAuthEvent({ type: "AUTH_LOGOUT", timestamp: Date.now() });

    try {
      await Promise.all([
        logoutMutation.mutateAsync(),
        localLogoutMutation.mutateAsync(),
      ]);
    } catch {
      // Even if server-side logout fails, proceed to login
    }
    // Do this after the mutations finish: the persistence subscription reacts
    // to mutation-cache events and could otherwise write the old cache back.
    if (user) {
      await clearPersistedQueryCache(user);
    }
    clearOfflineIdentity();
    setUser(null);
    window.location.href = "/login";
  }, [logoutMutation, localLogoutMutation, user]);

  return {
    user,
    isLoading,
    isAdmin: user?.role === "admin",
    isModerator: user?.role === "moderator" || user?.role === "admin",
    /** Pro or Ultra or Admin — matches premium feature access across the app */
    isPro:
      user?.plan === "pro" || user?.plan === "ultra" || user?.role === "admin",
    hasProAccess:
      !!user &&
      (user.plan === "pro" || user.plan === "ultra" || user.role === "admin"),
    hasUltraAccess: !!user && (user.plan === "ultra" || user.role === "admin"),
    logout,
  };
}
