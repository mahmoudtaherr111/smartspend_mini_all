import React, { Suspense, lazy, useState } from "react";
import { ThemeProvider } from "next-themes";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { clearPersistedQueryCache } from "@/lib/queryPersister";
import { trpc, trpcClient } from "@/providers/trpc";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/useAuth";
import { PageTransition } from "@/components/layout/PageTransition";
import { Sidebar } from "@/components/Sidebar";
import { useHaptics } from "@/hooks/useHaptics";
import { useHistoryBound } from "@/hooks/useHistoryBound";
import { AdBanner } from "@/components/ads/AdBanner";
import { useSessionTracker } from "@/hooks/useSessionTracker";
import { cn } from "@/lib/utils";
import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";
import { FeedbackButton } from "@/components/FeedbackButton";
// VoiceCallFAB removed - voice calls are now in the AI Center page
import { NotificationBell } from "@/components/NotificationBell";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { PwaEnhancements } from "@/components/pwa/PwaEnhancements";
import { PullToRefreshWrapper } from "@/components/pwa/PullToRefreshWrapper";

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

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
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
  const { user, isLoading, isModerator } = useAuth();
  if (isLoading) return <PageLoadingSkeleton />;
  if (!user || !isModerator) return <Navigate to="/dashboard" replace />;
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
];

export function hasBottomNav(pathname: string): boolean {
  return BOTTOM_NAV_ROUTES.some((route) => pathname.startsWith(route));
}

function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();
  useHistoryBound(sidebarOpen, () => setSidebarOpen(false));
  const { lightTap, mediumTap } = useHaptics();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const location = useLocation();
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);

  const touchStart = React.useRef<number | null>(null);
  const touchEnd = React.useRef<number | null>(null);

  const minSwipeDistance = 50;

  React.useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        setIsKeyboardOpen(true);
      }
    };

    const handleFocusOut = () => {
      setIsKeyboardOpen(false);
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("focusout", handleFocusOut);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("focusout", handleFocusOut);
    };
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    touchEnd.current = null;
    const touch = e.targetTouches?.[0] || e.touches?.[0];
    if (touch) {
      touchStart.current = touch.clientX;
    }
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const touch = e.targetTouches?.[0] || e.touches?.[0];
    if (touch) {
      touchEnd.current = touch.clientX;
    }
  };

  const handleTouchEnd = () => {
    if (!touchStart.current || !touchEnd.current) return;
    const distance = touchStart.current - touchEnd.current;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    // RTL layout: Sidebar is on the right.
    // Swipe left (pulling from right edge) opens it.
    // Only open if touch starts from the right edge area (within 44px of screen width)
    if (isLeftSwipe && !sidebarOpen && touchStart.current > window.innerWidth - 44) {
      mediumTap();
      setSidebarOpen(true);
    }
    // Swipe right (pushing back to right edge) closes it.
    if (isRightSwipe && sidebarOpen) {
      lightTap();
      setSidebarOpen(false);
    }
  };

  const isBottomNavActive = hasBottomNav(location.pathname);
  const shouldPadBottomNav = Boolean(user && isBottomNavActive && !isKeyboardOpen);

  return (
    <div
      className="app-shell bg-background relative overflow-hidden"
      dir="rtl"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Premium Ambient Background Glows */}
      <div className="absolute top-[-5%] right-[-10%] ambient-glow glow-emerald pointer-events-none" />
      <div className="absolute bottom-[15%] left-[-15%] ambient-glow glow-indigo pointer-events-none" />

      {user && (
        <>
          <div className="lg:hidden flex items-center justify-between px-4 py-3 pt-safe bg-white/70 dark:bg-slate-950/60 backdrop-blur-xl text-slate-900 dark:text-white border-b border-slate-200/50 dark:border-white/5 shrink-0 z-40">
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
            <div className="flex items-center gap-2">
              <NotificationBell />
              <button
                type="button"
                onClick={() => {
                  mediumTap();
                  setSidebarOpen(true);
                }}
                className="tap-target p-2.5 hover:bg-slate-100 dark:hover:bg-white/10 rounded-xl transition-colors active-press"
                aria-label="فتح القائمة"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="4" x2="20" y1="12" y2="12" />
                  <line x1="4" x2="20" y1="6" y2="6" />
                  <line x1="4" x2="20" y1="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
          <Sidebar
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen(!sidebarOpen)}
          />
          <MobileBottomNav onOpenMenu={() => setSidebarOpen(true)} />
          <PwaEnhancements />
        </>
      )}
      <main
        ref={scrollRef}
        className={cn(
          "app-content hide-scrollbar transition-all duration-500",
          user ? "lg:ms-72 lg:pb-0" : "",
          user ? (shouldPadBottomNav ? "pb-nav-safe" : "pb-safe") : "",
        )}
      >
        <PullToRefreshWrapper scrollRef={scrollRef}>
          {user && <AdBanner />}
          {children}
          {user && <FeedbackButton />}
        </PullToRefreshWrapper>
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
          path="/settings"
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

export default function App() {
  React.useEffect(() => {
    // Clear chunk error reload flag if application successfully loaded
    sessionStorage.removeItem("chunk_error_reloaded");
    // Older releases persisted every financial tRPC response under one device
    // key. Purge that legacy cache rather than hydrating another user's data.
    void clearPersistedQueryCache();
  }, []);

  return (
    <ErrorBoundary>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <BrowserRouter>
              <Layout>
                <Suspense fallback={<PageLoadingSkeleton />}>
                  <AnimatedRoutes />
                </Suspense>
              </Layout>
              <Toaster position="top-center" richColors className="pt-safe" />
            </BrowserRouter>
          </ThemeProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </ErrorBoundary>
  );
}
