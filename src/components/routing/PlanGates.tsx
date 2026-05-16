import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";

/** Requires Pro, Ultra, or Admin (matches backend `proProcedure` intent). */
export function ProFeatureRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, hasProAccess } = useAuth();
  if (isLoading) return <PageLoadingSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  if (!hasProAccess) return <Navigate to="/pro" replace />;
  return <>{children}</>;
}

/** Requires Ultra or Admin (matches backend `ultraProcedure`). */
export function UltraFeatureRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, hasUltraAccess } = useAuth();
  if (isLoading) return <PageLoadingSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  if (!hasUltraAccess) return <Navigate to="/pro" replace />;
  return <>{children}</>;
}
