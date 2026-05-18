import React, { Suspense, lazy, useState } from "react";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc, trpcClient } from "@/providers/trpc";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar } from "@/components/Sidebar";
import { AdBanner } from "@/components/ads/AdBanner";
import { useSessionTracker } from "@/hooks/useSessionTracker";
import { cn } from "@/lib/utils";
import { PageLoadingSkeleton } from "@/components/PageLoadingSkeleton";
import { UltraFeatureRoute } from "@/components/routing/PlanGates";
import { FeedbackButton } from "@/components/FeedbackButton";

import "./3d-effects.css";
import "./print.css";

import darkModeLogo from "../photos/dark_mode_logo-removebg-preview.png";
import whiteModeLogo from "../photos/white_mode_logo-removebg-preview.png";

const Login = lazy(() => import("@/pages/Login"));
const AuthCallback = lazy(() => import("@/pages/AuthCallback"));
const Landing = lazy(() => import("@/pages/Landing"));
const Home = lazy(() => import("@/pages/Home"));
const Support = lazy(() => import("@/pages/Support"));
const Admin = lazy(() => import("@/pages/Admin"));
const Pro = lazy(() => import("@/pages/Pro"));
const Settings = lazy(() => import("@/pages/Settings"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));
const UltraLounge = lazy(() => import("@/pages/UltraLounge"));
const NotFound = lazy(() => import("@/pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
    },
  },
});

function HomeEntry() {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background" dir="rtl">
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

function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();

  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);

  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;
    
    // RTL layout: Sidebar is on the right.
    // Swipe left (pulling from right edge) opens it.
    if (isLeftSwipe && !sidebarOpen) {
      setSidebarOpen(true);
    }
    // Swipe right (pushing back to right edge) closes it.
    if (isRightSwipe && sidebarOpen) {
      setSidebarOpen(false);
    }
  };

  return (
    <div 
      className="min-h-screen bg-background" 
      dir="rtl"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {user && (
        <>
          <div className="lg:hidden flex items-center justify-between p-4 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-b border-slate-200 dark:border-white/10 sticky top-0 z-40">
            <div className="flex items-center gap-3">
              <img 
                src={whiteModeLogo} 
                alt="SmartSpend" 
                className="h-16 w-auto object-contain block dark:hidden scale-110 origin-right"
              />
              <img 
                src={darkModeLogo} 
                alt="SmartSpend" 
                className="h-16 w-auto object-contain hidden dark:block scale-110 origin-right"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
              </button>
            </div>
          </div>
          <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
        </>
      )}
      <main className={cn("transition-all duration-500", user ? "lg:mr-72" : "")}>
        {user && <AdBanner />}
        {children}
        {user && <FeedbackButton />}
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
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="min-h-screen flex flex-col items-center justify-center p-6 bg-background text-foreground"
          dir="rtl"
        >
          <div className="max-w-lg w-full rounded-xl border border-destructive/30 bg-card p-6 shadow-sm space-y-4">
            <h1 className="text-xl font-bold text-destructive">حصل مشكلة في العرض</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              حصل خطأ غير متوقع. جرّب تعيد تحميل الصفحة. لو المشكلة مستمرة، سجّل الدخول من جديد أو تواصل مع الدعم.
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

export default function App() {
  return (
    <ErrorBoundary>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <BrowserRouter>
              <Layout>
                <Suspense fallback={<PageLoadingSkeleton />}>
                  <Routes>
                    <Route path="/" element={<HomeEntry />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/auth/callback" element={<AuthCallback />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="/terms" element={<Terms />} />

                    <Route path="/dashboard" element={<ProtectedRoute><Home /></ProtectedRoute>} />
                    <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
                    <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
                    <Route path="/pro" element={<ProtectedRoute><Pro /></ProtectedRoute>} />
                    <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
                    <Route
                      path="/ultra"
                      element={
                        <ProtectedRoute>
                          <UltraFeatureRoute>
                            <UltraLounge />
                          </UltraFeatureRoute>
                        </ProtectedRoute>
                      }
                    />

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </Layout>
              <Toaster position="top-center" richColors />
            </BrowserRouter>
          </ThemeProvider>
        </QueryClientProvider>
      </trpc.Provider>
    </ErrorBoundary>
  );
}
