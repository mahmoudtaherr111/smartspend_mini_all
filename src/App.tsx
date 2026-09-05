import React, { Suspense, lazy } from "react";
import { ThemeProvider } from "next-themes";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import {
  clearLegacyPersistedQueryCache,
  createQueryPersister,
  getQueryCacheScope,
  PERSISTED_QUERY_BUSTER,
  PERSISTED_QUERY_MAX_AGE,
  shouldPersistQueryKey,
  type QueryCacheUser,
} from "@/lib/queryPersister";
import { trpc, trpcClient } from "@/providers/trpc";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/useAuth";
import { PageTransition } from "@/components/layout/PageTransition";
import { Sidebar } from "@/components/Sidebar";
import { useNativeThemeSync } from "@/hooks/useNativeThemeSync";
import {
  useVirtualKeyboard,
  VirtualKeyboardProvider,
} from "@/hooks/useVirtualKeyboard";
import { initBackButtonListener } from "@/lib/back-button-manager";
import { dismissAppLoader } from "@/pwa/register-sw";
import { AdBanner } from "@/components/ads/AdBanner";
import { useSessionTracker } from "@/hooks/useSessionTracker";
import { cn } from "@/lib/utils";
import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";
import { NotificationBell } from "@/components/NotificationBell";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { PwaEnhancements } from "@/components/pwa/PwaEnhancements";
import { PullToRefreshWrapper } from "@/components/pwa/PullToRefreshWrapper";
import { BiometricLockProvider } from "@/providers/BiometricLockProvider";
import { BiometricLockOverlay } from "@/components/auth/BiometricLockOverlay";
import { BiometricOnboardingModal } from "@/components/auth/BiometricOnboardingModal";
import { useBiometricOnboarding } from "@/hooks/useBiometricOnboarding";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";

import "./3d-effects.css";
import "./print.css";

// Public URLs keep the app shell logo available in both Vite development and
// the deployed PWA (the old root-level asset imports resolved to stale hashes).
const darkModeLogo = "/photos/dark_mode_logo-removebg-preview.png";
const whiteModeLogo = "/photos/white_mode_logo-removebg-preview.png";

const Landing = lazy(() => import("@/pages/Landing"));
const Login = lazy(() => import("@/pages/Login"));
const Home = lazy(() => import("@/pages/Home"));
const Settings = lazy(() => import("@/pages/Settings"));
const BankSyncPage = lazy(() => import("@/pages/BankSyncPage"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const Support = lazy(() => import("@/pages/Support"));
const Admin = lazy(() => import("@/pages/Admin"));
const Pro = lazy(() => import("@/pages/Pro"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const AICenter = lazy(() => import("@/pages/AICenter"));
const More = lazy(() => import("@/pages/More"));
const UltraLounge = lazy(() => import("@/pages/UltraLounge"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 24 * 60 * 60_000,
    },
  },
});

function HomeEntry() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center min-h-screen bg-background"
        dir="rtl"
      >
        جاري التحميل...
      </div>
    );
  }
  if (user) return <Navigate to="/dashboard" replace />;
  return (
    <Suspense fallback={<PageLoadingSkeleton />}>
      <Landing />
    </Suspense>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  useSessionTracker();
  if (isLoading) return <PageLoadingSkeleton />;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAdmin } = useAuth();
  if (isLoading) return <PageLoadingSkeleton />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

function PublicOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <PageLoadingSkeleton />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export const BOTTOM_NAV_ROUTES = [
  "/dashboard",
  "/ai",
  "/settings",
  "/support",
  "/pro",
  "/bank-sync",
  "/more",
];

export function hasBottomNav(pathname: string): boolean {
  if (pathname.startsWith("/settings/")) return false;
  return BOTTOM_NAV_ROUTES.some((route) => pathname.startsWith(route));
}

export type AppContentMode = "document" | "workspace";

/**
 * Document routes let the app shell own vertical scrolling and may opt into
 * pull-to-refresh. Workspace routes (chat, calls, editors) own their internal
 * scroll areas and must receive a definite height from the shell.
 */
export function getAppContentMode(pathname: string): AppContentMode {
  return pathname === "/ai" || pathname.startsWith("/ai/")
    ? "workspace"
    : "document";
}

function Layout({ children }: { children: React.ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  useScrollRestoration(scrollRef);
  const location = useLocation();
  const { isKeyboardOpen } = useVirtualKeyboard();

  const isBottomNavActive = hasBottomNav(location.pathname);
  const shouldPadBottomNav = Boolean(
    user && isBottomNavActive && !isKeyboardOpen,
  );
  const contentMode = getAppContentMode(location.pathname);
  const isWorkspace = contentMode === "workspace";
  const isSettingsDetail = location.pathname.startsWith("/settings/");
  const isAdminPage = location.pathname === "/admin";
  const showAppChrome = Boolean(
    user ||
    (isAuthLoading &&
      (hasBottomNav(location.pathname) ||
        location.pathname.startsWith("/admin"))),
  );

  const routeContent = (
    <>
      {user && !isWorkspace && !isAdminPage && <AdBanner />}
      {children}
    </>
  );

  return (
    <div className="app-shell bg-background relative overflow-hidden" dir="rtl">
      {/* Premium Ambient Background Glows */}
      <div className="absolute top-[-5%] right-[-10%] ambient-glow glow-emerald pointer-events-none" />
      <div className="absolute bottom-[15%] left-[-15%] ambient-glow glow-indigo pointer-events-none" />

      {showAppChrome && (
        <>
          <div
            className={cn(
              "lg:hidden items-center justify-between px-4 py-3 pt-safe bg-white/70 dark:bg-slate-950/60 backdrop-blur-xl text-slate-900 dark:text-white border-b border-slate-200/50 dark:border-white/5 shrink-0 z-40",
              isSettingsDetail || isAdminPage ? "hidden" : "flex",
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <img
                src={whiteModeLogo}
                alt="SmartSpend"
                className="h-12 sm:h-14 w-auto object-contain block dark:hidden origin-right no-drag pointer-events-none select-none"
              />
              <img
                src={darkModeLogo}
                alt="SmartSpend"
                className="h-12 sm:h-14 w-auto object-contain hidden dark:block origin-right no-drag pointer-events-none select-none"
              />
            </div>
            {user ? (
              <NotificationBell />
            ) : (
              <span
                aria-hidden="true"
                className="size-11 shrink-0 rounded-full bg-slate-200/55 dark:bg-white/5"
              />
            )}
          </div>
          <div className="hidden lg:block">
            <Sidebar isOpen={false} onToggle={() => {}} />
          </div>
          <MobileBottomNav />
          {user && <PwaEnhancements />}
        </>
      )}
      <main
        ref={scrollRef}
        data-content-mode={contentMode}
        className={cn(
          "app-content min-h-0 hide-scrollbar transition-all duration-500",
          isWorkspace ? "app-content-workspace" : "app-content-document",
          showAppChrome ? "lg:ms-72 lg:pb-0" : "",
          showAppChrome ? (shouldPadBottomNav ? "pb-nav-safe" : "pb-safe") : "",
        )}
      >
        {isWorkspace ? (
          <div className="route-workspace">{routeContent}</div>
        ) : (
          <PullToRefreshWrapper scrollRef={scrollRef} className="min-h-full">
            {routeContent}
          </PullToRefreshWrapper>
        )}
      </main>
    </div>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("React Error Boundary:", error, errorInfo);

    // Auto-reload on chunk load error
    const isChunkError =
      error.message?.includes("Failed to fetch dynamically imported module") ||
      error.message?.includes("ChunkLoadError") ||
      error.name === "ChunkLoadError";

    if (isChunkError) {
      const hasReloaded = sessionStorage.getItem("chunk_error_reloaded");
      if (!hasReloaded) {
        sessionStorage.setItem("chunk_error_reloaded", "true");
        window.location.reload();
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground"
          dir="rtl"
        >
          <div className="max-w-lg w-full rounded-xl border border-destructive/30 bg-card p-6 shadow-sm space-y-4">
            <h1 className="text-xl font-bold text-destructive">
              حصل مشكلة في العرض
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              حصل خطأ غير متوقع. جرّب تعيد تحميل الصفحة. لو المشكلة مستمرة، سجّل
              الدخول من جديد أو تواصل مع الدعم.
            </p>
            <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-40 whitespace-pre-wrap">
              {this.state.error?.message}
            </pre>
            <button
              type="button"
              className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              onClick={() => window.location.reload()}
            >
              إعادة تحميل
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <Routes location={location}>
      <Route
        path="/"
        element={
          <PageTransition>
            <HomeEntry />
          </PageTransition>
        }
      />
      <Route
        path="/login"
        element={
          <PublicOnlyRoute>
            <PageTransition>
              <Login />
            </PageTransition>
          </PublicOnlyRoute>
        }
      />
      <Route
        path="/auth/callback"
        element={
          <PageTransition>
            <AuthCallback />
          </PageTransition>
        }
      />
      <Route
        path="/privacy"
        element={
          <PageTransition>
            <Privacy />
          </PageTransition>
        }
      />
      <Route
        path="/terms"
        element={
          <PageTransition>
            <Terms />
          </PageTransition>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <PageTransition>
              <Home />
            </PageTransition>
          </ProtectedRoute>
        }
      />
      <Route
        path="/support"
        element={
          <ProtectedRoute>
            <PageTransition>
              <Support />
            </PageTransition>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <PageTransition>
              <Admin />
            </PageTransition>
          </AdminRoute>
        }
      />
      <Route
        path="/pro"
        element={
          <ProtectedRoute>
            <PageTransition>
              <Pro />
            </PageTransition>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/*"
        element={
          <ProtectedRoute>
            <PageTransition>
              <Settings />
            </PageTransition>
          </ProtectedRoute>
        }
      />
      <Route
        path="/bank-sync"
        element={
          <ProtectedRoute>
            <PageTransition>
              <BankSyncPage />
            </PageTransition>
          </ProtectedRoute>
        }
      />
      <Route
        path="/ai"
        element={
          <ProtectedRoute>
            <PageTransition>
              <AICenter />
            </PageTransition>
          </ProtectedRoute>
        }
      />
      <Route
        path="/more"
        element={
          <ProtectedRoute>
            <PageTransition>
              <More />
            </PageTransition>
          </ProtectedRoute>
        }
      />
      <Route
        path="/ultra"
        element={
          <ProtectedRoute>
            <PageTransition>
              <UltraLounge />
            </PageTransition>
          </ProtectedRoute>
        }
      />

      <Route
        path="*"
        element={
          <PageTransition>
            <NotFound />
          </PageTransition>
        }
      />
    </Routes>
  );
}

function PersistedQueryScope({
  user,
  children,
}: {
  user: QueryCacheUser;
  children: React.ReactNode;
}) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: createQueryPersister(user),
        buster: PERSISTED_QUERY_BUSTER,
        maxAge: PERSISTED_QUERY_MAX_AGE,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) =>
            query.state.status === "success" &&
            shouldPersistQueryKey(query.queryKey),
        },
      }}
    >
      {/* React Query pauses fetching while the account-scoped cache restores.
          Keeping the real shell mounted reserves the header and navigation
          geometry from the first frame and avoids a visible 69px jump. */}
      {children}
    </PersistQueryClientProvider>
  );
}

function BiometricAppEnhancements() {
  const { showModal, closeModal, postponePrompt, optOutPermanently } =
    useBiometricOnboarding();

  return (
    <>
      <BiometricLockOverlay />
      <BiometricOnboardingModal
        isOpen={showModal}
        onClose={closeModal}
        onPostpone={postponePrompt}
        onOptOut={optOutPermanently}
      />
    </>
  );
}

function NativeLifecycleBridge() {
  useNativeThemeSync();
  return null;
}

function AuthScopedApplication() {
  const { user } = useAuth();

  const application = (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <VirtualKeyboardProvider>
        <NativeLifecycleBridge />
        <BrowserRouter>
          <BiometricLockProvider>
            <Layout>
              <Suspense fallback={<PageLoadingSkeleton />}>
                <AnimatedRoutes />
              </Suspense>
            </Layout>
            <BiometricAppEnhancements />
            <Toaster position="top-center" richColors className="pt-safe" />
          </BiometricLockProvider>
        </BrowserRouter>
      </VirtualKeyboardProvider>
    </ThemeProvider>
  );

  if (!user) return application;

  // A provider mounts only after identity is known, so another account's
  // IndexedDB entry can never hydrate into this session's QueryClient.
  return (
    <PersistedQueryScope key={getQueryCacheScope(user)} user={user}>
      {application}
    </PersistedQueryScope>
  );
}

export default function App() {
  React.useEffect(() => {
    initBackButtonListener();
    void dismissAppLoader();
    // Clear chunk error reload flag if application successfully loaded
    sessionStorage.removeItem("chunk_error_reloaded");
    // v1 stored every account in one device-wide key. Purge only that retired
    // key; never erase the current account's scoped offline cache on startup.
    void clearLegacyPersistedQueryCache();
  }, []);

  return (
    <ErrorBoundary>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <AuthScopedApplication />
        </QueryClientProvider>
      </trpc.Provider>
    </ErrorBoundary>
  );
}
