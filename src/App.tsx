import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { trpc, trpcClient } from "@/providers/trpc";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/useAuth";
import { Sidebar } from "@/components/Sidebar";
import { SEOMeta } from "@/components/seo/SEOMeta";
import { AdBanner } from "@/components/ads/AdBanner";
import { useState } from "react";
import { cn } from "@/lib/utils";

// Pages
import Login from "@/pages/Login";
import AuthCallback from "@/pages/AuthCallback";
import Home from "@/pages/Home";
import Support from "@/pages/Support";
import Admin from "@/pages/Admin";
import Pro from "@/pages/Pro";

// CSS
import "./3d-effects.css";
import "./print.css";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center h-screen">جاري التحميل...</div>;
  if (!user) return <Navigate to="/login" />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isModerator } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center h-screen">جاري التحميل...</div>;
  if (!user || !isModerator) return <Navigate to="/" />;
  return <>{children}</>;
}

function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <SEOMeta />
      {user && <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />}
      <main className={cn(
        "transition-all duration-500",
        user ? "lg:mr-20" : "",
        sidebarOpen && user ? "lg:mr-72" : ""
      )}>
        {user && <AdBanner />}
        {children}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
              <Route path="/support" element={<ProtectedRoute><Support /></ProtectedRoute>} />
              <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
              <Route path="/pro" element={<ProtectedRoute><Pro /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Layout>
          <Toaster position="top-center" richColors />
        </BrowserRouter>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
