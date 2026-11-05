import { lazy, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { trpc } from "@admin/lib/trpc";
import { Shell } from "./shell/Shell";
import { SignIn } from "./pages/SignIn";
import { Support } from "./pages/Support";
import { Today } from "./pages/Today";
import { ErrorBoundary } from "./ui/ErrorBoundary";
import { Loading } from "./ui/states";

// Each page is its own file, loaded when it is first opened; «النهارده» and «الدعم», where everyone lands, come with the
// console itself. A file missing after a deploy is caught by the page's ErrorBoundary, which says a new version is out.
const AiCalls = lazy(() => import("./pages/AiCalls").then((page) => ({ default: page.AiCalls })));
const Audit = lazy(() => import("./pages/Audit").then((page) => ({ default: page.Audit })));
const Status = lazy(() => import("./pages/Status").then((page) => ({ default: page.Status })));
const AllSettings = lazy(() => import("./pages/AllSettings").then((page) => ({ default: page.AllSettings })));
const Classifications = lazy(() => import("./pages/Classifications").then((page) => ({ default: page.Classifications })));
const Connectors = lazy(() => import("./pages/Connectors").then((page) => ({ default: page.Connectors })));
const Growth = lazy(() => import("./pages/Growth").then((page) => ({ default: page.Growth })));
const Communications = lazy(() => import("./pages/comms/Communications").then((page) => ({ default: page.Communications })));
const Rules = lazy(() => import("./pages/rules/Rules").then((page) => ({ default: page.Rules })));
const AiSetup = lazy(() => import("./pages/ai/AiSetup").then((page) => ({ default: page.AiSetup })));
const BankMessages = lazy(() => import("./pages/bank/BankMessages").then((page) => ({ default: page.BankMessages })));
const Money = lazy(() => import("./pages/Money").then((page) => ({ default: page.Money })));
const Plans = lazy(() => import("./pages/plans/Plans").then((page) => ({ default: page.Plans })));
const Operations = lazy(() => import("./pages/Operations").then((page) => ({ default: page.Operations })));
const People = lazy(() => import("./pages/People").then((page) => ({ default: page.People })));
const Person = lazy(() => import("./pages/Person").then((page) => ({ default: page.Person })));


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
            {isAdmin && <Route path="/audit" element={<Audit />} />}
            {isAdmin && <Route path="/status" element={<Status />} />}
            {isAdmin && <Route path="/settings" element={<AllSettings />} />}
            {isAdmin && <Route path="/money" element={<Money />} />}
            {isAdmin && <Route path="/plans" element={<Plans />} />}
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
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Shell>
  );
}
