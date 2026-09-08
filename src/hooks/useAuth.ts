import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/providers/trpc";
import {
  clearOfflineIdentity,
  clearPersistedQueryCache,
  getOfflineIdentity,
  saveOfflineIdentity,
} from "@/lib/queryPersister";
import { clearScrollCache } from "@/hooks/useScrollRestoration";

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
  user?: AuthUser;
  timestamp?: number;
}

/**
 * Broadcast an authentication event to all other open tabs via BroadcastChannel.
 */
export function broadcastAuthEvent(event: AuthBroadcastEvent): void {
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
      channel.postMessage({ ...event, timestamp: Date.now() });
      channel.close();
    }
  } catch {
    // BroadcastChannel unavailable in this environment
  }
}

export function broadcastLogin(token: string, user?: AuthUser): void {
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

/**
 * Replays the device's last verified identity on the very first render, so a
 * resumed session paints its real shell instead of holding a skeleton for the
 * length of a mobile round trip. Two deliberate limits keep this safe:
 *
 *  - `role` is never replayed. Administrative surfaces stay behind a verified
 *    session, so a hand-edited snapshot cannot even render the admin shell.
 *  - `plan` is replayed for presentation only. Every paid route re-checks the
 *    tier on the server, and the snapshot is corrected the moment `auth.me`
 *    answers, so a tampered value buys a redraw and nothing else.
 */
function hydrateIdentitySnapshot(): AuthUser | null {
  const snapshot = getOfflineIdentity();
  if (!snapshot) return null;
  return {
    id: snapshot.id,
    name: snapshot.name,
    avatar: snapshot.avatar,
    role: "user",
    plan: snapshot.plan ?? "free",
    type: snapshot.type,
  };
}

export function useAuth() {
  const [snapshotUser] = useState(hydrateIdentitySnapshot);
  const [user, setUser] = useState<AuthUser | null>(snapshotUser);
  const userRef = useRef(user);
  userRef.current = user;
  // Distinct from "loading": the session check has come back from the server.
  // Anything that revokes access must wait for this, never for a snapshot.
  const [isVerified, setIsVerified] = useState(false);
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
              plan: eventData.user.plan,
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
          const offlineIdentity = getOfflineIdentity();
          const target = offlineIdentity || userRef.current;
          if (target) {
            void clearPersistedQueryCache(target);
          }
          clearOfflineIdentity();
          clearScrollCache();
          setUser(null);
          setIsVerified(true);
          utils.auth.me.setData(undefined, null);
          utils.localAuth.me.setData(undefined, null);
          void utils.auth.me.invalidate();
          void utils.localAuth.me.invalidate();
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
          plan: authenticatedUser.plan,
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
          plan: authenticatedUser.plan,
        });
        setUser(authenticatedUser);
      } else if (!isOnline) {
        // Display-only access to a short-lived, per-user local cache. Admin
        // rights are never restored from it; the tier is presentation state
        // that the server re-checks on every paid route.
        setUser(hydrateIdentitySnapshot());
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
      setIsVerified(true);
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
    // Restored scroll offsets belong to the account that just left.
    clearScrollCache();
    setUser(null);
    window.location.href = "/login";
  }, [logoutMutation, localLogoutMutation, user]);

  // Nothing is renderable only when the device has no snapshot to replay and
  // the server has not answered yet. A resumed session skips this entirely.
  const isLoading = !isVerified && user === null;

  return {
    user,
    isLoading,
    /**
     * The server has confirmed this session. Guards that take access away —
     * a redirect to /login, /pro, or off the admin route — must wait for this,
     * otherwise an unverified snapshot decides who gets thrown out.
     */
    isVerified,
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
