import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { clearPersistedQueryCache } from "@/lib/queryPersister";

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

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { data: oauthUser, isFetched: oauthFetched } = trpc.auth.me.useQuery(
    undefined,
    {
      retry: false,
      refetchOnWindowFocus: false,
    },
  );

  const { data: localUser, isFetched: localFetched } =
    trpc.localAuth.me.useQuery(undefined, {
      retry: false,
      refetchOnWindowFocus: false,
    });

  const logoutMutation = trpc.auth.logout.useMutation();
  const localLogoutMutation = trpc.localAuth.logout.useMutation();

  useEffect(() => {
    if (!oauthFetched || !localFetched) {
      setIsLoading(true);
      return;
    }

    if (oauthFetched && localFetched) {
      if (oauthUser) {
        setUser({
          id: oauthUser.id,
          name: oauthUser.name,
          email: oauthUser.email,
          avatar: oauthUser.avatar,
          role: oauthUser.role as "user" | "moderator" | "admin",
          plan: oauthUser.plan as "free" | "pro" | "ultra",
          type: "oauth",
          createdAt: oauthUser.createdAt,
        });
      } else if (localUser) {
        setUser({
          id: localUser.id,
          name: localUser.name,
          email: localUser.email,
          role: localUser.role as "user" | "moderator" | "admin",
          plan: localUser.plan as "free" | "pro" | "ultra",
          type: "local",
          phone: localUser.phone,
          createdAt: localUser.createdAt,
        });
      } else {
        setUser(null);
      }
      setIsLoading(false);
    }
  }, [oauthUser, localUser, oauthFetched, localFetched]);

  const logout = useCallback(async () => {
    localStorage.removeItem("local_auth_token");
    // Queued data and hydrated query results belong to the previous user. Never
    // carry either into the next account on a shared phone.
    localStorage.removeItem("smartspend_offline_texts");
    localStorage.removeItem("smartspend_offline_manual");
    await clearPersistedQueryCache();
    document.cookie =
      "google_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    try {
      await Promise.all([
        logoutMutation.mutateAsync(),
        localLogoutMutation.mutateAsync(),
      ]);
    } catch {
      // Even if server-side logout fails, proceed to login
    }
    setUser(null);
    window.location.href = "/login";
  }, [logoutMutation, localLogoutMutation]);

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
