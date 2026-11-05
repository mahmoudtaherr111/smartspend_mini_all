import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { trpc } from "@admin/lib/trpc";
import { Shell } from "./shell/Shell";
import { SignIn } from "./pages/SignIn";
import { AiCalls } from "./pages/AiCalls";
import { Classifications } from "./pages/Classifications";
import { Connectors } from "./pages/Connectors";
import { Growth } from "./pages/Growth";
import { AiSetup, Communications, Rules } from "./pages/Hosted";
import { BankMessages } from "./pages/bank/BankMessages";
import { Money } from "./pages/Money";
import { Operations } from "./pages/Operations";
import { People } from "./pages/People";
import { Support } from "./pages/Support";
import { Person } from "./pages/Person";
import { Today } from "./pages/Today";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { Loading } from "./ui/states";

const LegacyConsole = lazy(() => import("./pages/LegacyConsole"));

/** Only staff reach the console: anyone else sees the sign-in page, and a signed-in user without the role is told so. */
export default function App() {
  const session = trpc.adminConsole.session.useQuery(undefined, {
    retry: false,
  });
  // A new page gets a fresh boundary, so one broken page never blocks the others.
  const location = useLocation();

  if (session.isLoading) return <Loading full />;
  if (!session.data) {
    const code = session.error?.data?.code;
    return <SignIn forbidden={code === "FORBIDDEN"} />;
  }

  const isAdmin = session.data.role === "admin";
  return (
    <Shell name={session.data.name} isAdmin={isAdmin}>
      <ErrorBoundary key={location.pathname}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route
              path="/"
              element={isAdmin ? <Today /> : <Navigate to="/support" replace />}
            />
            <Route path="/support" element={<Support isAdmin={isAdmin} />} />
            {isAdmin && <Route path="/operations" element={<Operations />} />}
            {isAdmin && <Route path="/money" element={<Money />} />}
            {isAdmin && (
              <Route path="/communications" element={<Communications />} />
            )}
            {isAdmin && (
              <Route path="/bank-messages" element={<BankMessages />} />
            )}
            {isAdmin && <Route path="/ai/rules" element={<Rules />} />}
            {isAdmin && <Route path="/ai/setup" element={<AiSetup />} />}
            {isAdmin && <Route path="/growth" element={<Growth />} />}
            {isAdmin && <Route path="/people" element={<People />} />}
            {isAdmin && <Route path="/people/:type/:id" element={<Person />} />}
            {isAdmin && <Route path="/ai/calls" element={<AiCalls />} />}
            {isAdmin && (
              <Route path="/ai/classifications" element={<Classifications />} />
            )}
            {isAdmin && (
              <Route path="/ai/connectors" element={<Connectors />} />
            )}
            {isAdmin && <Route path="/legacy" element={<LegacyConsole />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Shell>
  );
}
