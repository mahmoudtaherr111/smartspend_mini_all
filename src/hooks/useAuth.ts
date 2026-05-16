import { useCallback, useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";

export interface AuthUser {
  id: number;
  name: string;
  email?: string | null;
  avatar?: string | null;
  role: "user" | "moderator" | "admin";
  plan: "free" | "pro" | "ultra";
  type: "oauth" | "local";
  phone?: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { data: oauthUser, isLoading: oauthLoading } = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: localUser, isLoading: localLoading } = trpc.localAuth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      setUser(null);
      window.location.reload();
    },
  });

  const localLogoutMutation = trpc.localAuth.logout.useMutation({
    onSuccess: () => {
      localStorage.removeItem("local_auth_token");
      setUser(null);
      window.location.reload();
    },
  });

  useEffect(() => {
    if (!oauthLoading && !localLoading) {
      if (oauthUser) {
        setUser({
          id: oauthUser.id,
          name: oauthUser.name,
          email: oauthUser.email,
          avatar: oauthUser.avatar,
          role: oauthUser.role as "user" | "moderator" | "admin",
          plan: oauthUser.plan as "free" | "pro" | "ultra",
          type: "oauth",
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
        });
      } else {
        setUser(null);
      }
      setIsLoading(false);
    }
  }, [oauthUser, localUser, oauthLoading, localLoading]);

  const logout = useCallback(() => {
    localStorage.removeItem("local_auth_token");
    document.cookie = "google_session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    logoutMutation.mutate();
    localLogoutMutation.mutate();
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
      !!user && (user.plan === "pro" || user.plan === "ultra" || user.role === "admin"),
    hasUltraAccess: !!user && (user.plan === "ultra" || user.role === "admin"),
    logout,
  };
}
