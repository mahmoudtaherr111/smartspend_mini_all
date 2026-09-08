import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";

/**
 * Entitlement is allowed to be optimistic — the device snapshot replays the
 * last verified tier so a subscriber walks straight back into a paid screen.
 * Losing a screen is not: a snapshot that is missing or stale on the tier must
 * never bounce a paying user to /pro, so every redirect waits for `isVerified`.
 */

/** Requires Pro, Ultra, or Admin (matches backend `proProcedure` intent). */
export function ProFeatureRoute({ children }: { children: React.ReactNode }) {
  const { user, isVerified, hasProAccess } = useAuth();
  if (hasProAccess) return <>{children}</>;
  if (!isVerified) return <PageLoadingSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to="/pro" replace />;
}

/** Requires Ultra or Admin (matches backend `ultraProcedure`). */
export function UltraFeatureRoute({ children }: { children: React.ReactNode }) {
  const { user, isVerified, hasUltraAccess } = useAuth();
  if (hasUltraAccess) return <>{children}</>;
  if (!isVerified) return <PageLoadingSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to="/pro" replace />;
}
